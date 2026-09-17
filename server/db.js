const path = require("path");
const fsSync = require("fs");

let sqlite3 = null;
try { sqlite3 = require("sqlite3").verbose(); } catch (_) { sqlite3 = null; }
let supabase = null;
try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
} catch (_) { supabase = null; }

const ROOT_DIR = path.resolve(__dirname, "..");
const IS_VERCEL = process.env.VERCEL === "1";
const DATA_DIR = IS_VERCEL ? path.join("/tmp", "planeta-surf-data") : ROOT_DIR;
const DB_FILE = process.env.SQLITE_PATH || path.join(DATA_DIR, "planetasurf.sqlite");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

const USE_SUPABASE = Boolean(supabase);
const USE_SQLITE = !USE_SUPABASE && Boolean(sqlite3);
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "planeta-surf";

if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR, { recursive: true });
if (!fsSync.existsSync(UPLOADS_DIR)) fsSync.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = USE_SQLITE ? new sqlite3.Database(DB_FILE) : null;

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) { reject(error); return; }
      resolve(this);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) { reject(error); return; }
      resolve(rows);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) { reject(error); return; }
      resolve(row || null);
    });
  });
}

// true si el error de Supabase es "la tabla no existe" (42P01) — pasa
// mientras no se corrió supabase-planetasurf.sql en el proyecto nuevo.
function isMissingTableError(error) {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202") return true;
  return /could not find the table|schema cache|does not exist/i.test(error.message || "");
}

async function initSqliteSchema() {
  if (!USE_SQLITE) return;

  await dbRun(`
    CREATE TABLE IF NOT EXISTS business (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL DEFAULT 'Planeta Surf',
      direccion TEXT NOT NULL DEFAULT '',
      horario_texto TEXT NOT NULL DEFAULT '',
      instagram_url TEXT NOT NULL DEFAULT '',
      whatsapp_numero TEXT NOT NULL DEFAULT '',
      color_marca TEXT NOT NULL DEFAULT '#111111',
      logo_url TEXT,
      hero_titulo TEXT NOT NULL DEFAULT 'TU ESTILO.\\nTU PLANETA.',
      hero_subtitulo TEXT NOT NULL DEFAULT 'Ropa y accesorios para vivir tu día a tu manera.',
      hero_cta_primario_texto TEXT NOT NULL DEFAULT 'Ver colección',
      hero_cta_primario_link TEXT NOT NULL DEFAULT '/productos',
      hero_cta_secundario_texto TEXT NOT NULL DEFAULT 'Nuevos ingresos',
      hero_cta_secundario_link TEXT NOT NULL DEFAULT '/productos?orden=novedades',
      beneficio1_titulo TEXT NOT NULL DEFAULT 'Envíos en San Nicolás',
      beneficio1_subtitulo TEXT NOT NULL DEFAULT 'Coordinamos la entrega por WhatsApp',
      beneficio2_titulo TEXT NOT NULL DEFAULT '3 y 6 cuotas sin interés',
      beneficio2_subtitulo TEXT NOT NULL DEFAULT 'Con todas las tarjetas',
      beneficio3_titulo TEXT NOT NULL DEFAULT 'Compra 100% segura',
      beneficio3_subtitulo TEXT NOT NULL DEFAULT 'Protegemos tus datos',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS admin_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt_b TEXT,
      password_hash_b TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      imagen_url TEXT,
      orden INTEGER NOT NULL DEFAULT 0,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS hero_slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      imagen_url TEXT NOT NULL,
      orden INTEGER NOT NULL DEFAULT 0,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT DEFAULT '',
      precio REAL NOT NULL DEFAULT 0,
      precio_promocional REAL,
      categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
      imagen_principal TEXT,
      imagenes_adicionales TEXT NOT NULL DEFAULT '[]',
      etiqueta TEXT,
      destacado INTEGER NOT NULL DEFAULT 0,
      mostrar_en_home INTEGER NOT NULL DEFAULT 0,
      orden_home INTEGER,
      activo INTEGER NOT NULL DEFAULT 1,
      disponible INTEGER NOT NULL DEFAULT 1,
      stock INTEGER,
      talles TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  try {
    await dbRun("ALTER TABLE productos ADD COLUMN talles TEXT NOT NULL DEFAULT '[]'");
  } catch (_) { /* la columna ya existe */ }

  const business = await dbGet("SELECT id FROM business LIMIT 1");
  if (!business) {
    await dbRun(
      `INSERT INTO business (nombre, direccion, horario_texto, instagram_url, whatsapp_numero, color_marca)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        "Planeta Surf",
        "Mitre 247 · Urquiza 31, San Nicolás de los Arroyos",
        "Mitre 247: 9 a 21 hs (corrido) · Urquiza 31: 8:30-12:30 y 16:30-20:30",
        "https://www.instagram.com/planetasurfshops/",
        "5493364294644",
        "#111111",
      ]
    );
  }

  const admin = await dbGet("SELECT id FROM admin_credentials LIMIT 1");
  if (!admin) {
    const crypto = require("crypto");
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto
      .scryptSync("admin123", salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
      .toString("hex");
    await dbRun("INSERT INTO admin_credentials (password_salt, password_hash) VALUES (?, ?)", [salt, hash]);
  }

  const categoriasCount = await dbGet("SELECT COUNT(*) as c FROM categorias");
  if (!categoriasCount || categoriasCount.c === 0) {
    const seed = [
      ["Surf", "surf", 1],
      ["Remeras", "remeras", 2],
      ["Musculosas", "musculosas", 3],
      ["Shorts", "shorts", 4],
    ];
    for (const [nombre, slug, orden] of seed) {
      await dbRun("INSERT INTO categorias (nombre, slug, orden) VALUES (?, ?, ?)", [nombre, slug, orden]);
    }
  }
}

module.exports = {
  supabase,
  USE_SUPABASE,
  USE_SQLITE,
  SUPABASE_BUCKET,
  ROOT_DIR,
  DATA_DIR,
  UPLOADS_DIR,
  dbRun,
  dbAll,
  dbGet,
  isMissingTableError,
  initSqliteSchema,
};
