const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
// .env.local (ej: generado por `vercel env pull`) pisa lo de .env si existe.
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local"), override: true });

const express = require("express");
const multer = require("multer");
const fsSync = require("fs");

const { ROOT_DIR, UPLOADS_DIR, USE_SQLITE, initSqliteSchema } = require("./db");

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

app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  next();
});

app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));
app.use(express.static(path.join(ROOT_DIR, "public")));

app.use("/api", require("./routes/business"));
app.use("/api", require("./routes/categorias"));
app.use("/api", require("./routes/hero"));
app.use("/api", require("./routes/productos"));
app.use("/api", require("./routes/admin-auth"));

// ============================================================
// PÁGINAS
// ============================================================
app.get("/", (_req, res) => res.sendFile(path.join(ROOT_DIR, "public", "index.html")));
app.get("/productos", (_req, res) => res.sendFile(path.join(ROOT_DIR, "public", "productos.html")));
app.get("/producto/:id", (_req, res) => res.sendFile(path.join(ROOT_DIR, "public", "producto.html")));
app.get("/admin", (_req, res) => res.sendFile(path.join(ROOT_DIR, "public", "admin.html")));

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
