const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
// .env.local (ej: generado por `vercel env pull`) pisa lo de .env si existe.
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local"), override: true });

const express = require("express");
const multer = require("multer");
const fsSync = require("fs");

const { ROOT_DIR, UPLOADS_DIR, USE_SQLITE, initSqliteSchema } = require("./db");
const { requireAdmin } = require("./auth");

const app = express();
const PORT = process.env.PORT || 3000;

// Todo el sitio es same-origin (scripts/estilos propios, sin CDNs) salvo
// las imágenes, que viven en Supabase Storage -- por eso img-src suma
// ese host aparte y el resto queda cerrado a 'self'.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: https://*.supabase.co",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Content-Security-Policy", CSP);
  // Vercel ya fuerza HTTPS; este header refuerza que el navegador nunca
  // intente HTTP de entrada, ni siquiera en el primer request.
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  next();
});

app.use("/api", (req, res, next) => {
  // Todo /api quedaba con no-store, incluidos los GET públicos de
  // catálogo (config/categorias/hero/productos) -- eso obliga a pegarle
  // a Supabase de cero en cada F5, que es la causa del delay reportado.
  // Lo admin (mutaciones y login) sigue sin cachear nunca; lo público de
  // solo lectura se cachea unos segundos (browser + edge de Vercel).
  if (req.method === "GET" && !req.path.startsWith("/admin")) {
    res.setHeader("Cache-Control", "public, max-age=20, stale-while-revalidate=120");
  } else {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
  }
  next();
});

app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));
// index:false -- si no, express.static sirve "/" con su propio
// index.html crudo (sin el ?v= de cache-busting) antes de llegar a la
// ruta de abajo que sí lo inyecta.
app.use(express.static(path.join(ROOT_DIR, "public"), { index: false }));

app.use("/api", require("./routes/business"));
app.use("/api", require("./routes/categorias"));
app.use("/api", require("./routes/hero"));
app.use("/api", require("./routes/productos"));
app.use("/api", require("./routes/admin-auth"));

// Red de contención contra el riesgo real de RLS deshabilitado: como
// service_role ignora RLS, la única defensa contra "una ruta admin nueva
// se olvidó el requireAdmin" es verificarlo en código. Esto recorre las
// rutas ya registradas y, si encuentra una mutación bajo /admin sin el
// middleware, hace fallar el arranque en vez de exponerla en silencio.
function auditAdminRoutes() {
  const sinProteger = [];
  const MUTATING = new Set(["post", "put", "patch", "delete"]);
  (function walk(stack) {
    for (const layer of stack) {
      if (layer.route) {
        const routePath = layer.route.path;
        const methods = Object.keys(layer.route.methods).filter((m) => MUTATING.has(m));
        if (!methods.length || routePath === "/admin/login") continue;
        if (routePath.startsWith("/admin") && !layer.route.stack.some((l) => l.handle === requireAdmin)) {
          sinProteger.push(`${methods.join(",").toUpperCase()} ${routePath}`);
        }
      } else if (layer.name === "router" && layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  })(app._router.stack);
  if (sinProteger.length) {
    throw new Error(`[security] Rutas admin sin requireAdmin: ${sinProteger.join(", ")}`);
  }
}
auditAdminRoutes();

// ============================================================
// PÁGINAS
// ============================================================
// Un navegador viejo (o un proxy/antivirus en el medio) puede no revalidar
// bien el caché de /js/*.js entre deploys y quedarse sirviendo una copia
// vieja para siempre -- pasó varias veces esta sesión (confundía a un
// cliente real). En vez de confiar en que cachee bien, cada deploy tiene
// un id distinto (el commit de Vercel, o un timestamp en local) que se
// suma como ?v= a los scripts propios: así cada deploy pide una URL
// nueva, que ningún caché pudo haber visto antes.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || String(Date.now());
const pageCache = new Map();
function sendPage(res, filename) {
  let html = pageCache.get(filename);
  if (!html) {
    html = fsSync.readFileSync(path.join(ROOT_DIR, "public", filename), "utf8")
      .replace(/(src|href)="(\/(?:js|tailwind-build\.css)[^"]*)"/g, `$1="$2?v=${BUILD_ID}"`);
    pageCache.set(filename, html);
  }
  res.type("html").send(html);
}
app.get("/", (_req, res) => sendPage(res, "index.html"));
app.get("/productos", (_req, res) => sendPage(res, "productos.html"));
app.get("/producto/:id", (_req, res) => sendPage(res, "producto.html"));
app.get("/admin", (_req, res) => sendPage(res, "admin.html"));

// ============================================================
// ERROR HANDLER
// ============================================================
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "El archivo supera 5 MB. Subí uno más liviano." });
    }
    return res.status(400).json({ error: "Error al subir el archivo." });
  }
  if (err.message) return res.status(400).json({ error: err.message });
  return res.status(500).json({ error: "Error interno del servidor." });
});

async function start() {
  if (USE_SQLITE) await initSqliteSchema();
  app.listen(PORT, () => console.log(`Planeta Surf en http://localhost:${PORT}`));
}

if (require.main === module) {
  start();
}

module.exports = app;
