const crypto = require("crypto");
const fs = require("fs/promises");
const { USE_SQLITE, USE_SUPABASE, supabase, dbGet, dbRun } = require("./db");

const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "cambia_esta_clave";
if (!process.env.ADMIN_SESSION_SECRET) {
  console.warn("[security] ADVERTENCIA: ADMIN_SESSION_SECRET no configurado — los tokens admin son predecibles. Configuralo en .env");
}
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_SCRYPT_KEYLEN = 64;
const ADMIN_SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map();

function getClientIp(req) {
  return (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0].trim();
}

function checkLoginRateLimit(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

function resetLoginRateLimit(key) {
  loginAttempts.delete(key);
}

function timingSafeEqualString(a, b) {
  try {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) {
      crypto.timingSafeEqual(Buffer.alloc(bufB.length), bufB);
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (_) { return false; }
}

async function validateFileMagicBytes(file) {
  let buf = file.buffer;
  if (!buf && file.path) buf = await fs.readFile(file.path).catch(() => null);
  if (!buf || buf.length < 8) return false;
  const mime = file.mimetype;
  if (mime === "image/jpeg") return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  if (mime === "image/png") return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  if (mime === "image/webp") return buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46;
  return false;
}

function hashAdminPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plain, salt, ADMIN_SCRYPT_KEYLEN, ADMIN_SCRYPT_OPTS).toString("hex");
  return { salt, hash };
}

function verifyAdminPasswordScrypt(plain, salt, hashHex) {
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(plain, salt, expected.length, ADMIN_SCRYPT_OPTS);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (_) { return false; }
}

function verifyAdminRowPasswords(plain, row) {
  if (!row) return false;
  if (verifyAdminPasswordScrypt(plain, row.password_salt, row.password_hash)) return true;
  if (row.password_salt_b && row.password_hash_b &&
      verifyAdminPasswordScrypt(plain, row.password_salt_b, row.password_hash_b)) return true;
  return false;
}

// Negocio único: el token solo firma la expiración, no hace falta un id de negocio.
function createAdminSession() {
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  const signature = crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(String(expiresAt)).digest("hex");
  return `${expiresAt}.${signature}`;
}

function parseAdminToken(token) {
  if (!token) return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return null;
  const payload = token.substring(0, lastDot);
  const providedSig = token.substring(lastDot + 1);
  const expectedSig = crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(payload).digest("hex");
  if (!timingSafeEqualString(providedSig, expectedSig)) return null;
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  return { expiresAt };
}

async function getAdminRow() {
  if (USE_SQLITE) return dbGet("SELECT * FROM admin_credentials ORDER BY id LIMIT 1");
  if (USE_SUPABASE) {
    const { data } = await supabase.from("admin_credentials").select("*").order("id").limit(1).maybeSingle();
    return data || null;
  }
  return null;
}

async function verifyAdminPassword(plain) {
  const row = await getAdminRow();
  return verifyAdminRowPasswords(plain, row);
}

async function setAdminPassword(plain) {
  const { salt, hash } = hashAdminPassword(plain);
  const row = await getAdminRow();
  if (USE_SQLITE) {
    if (row) await dbRun("UPDATE admin_credentials SET password_salt = ?, password_hash = ?, updated_at = datetime('now') WHERE id = ?", [salt, hash, row.id]);
    else await dbRun("INSERT INTO admin_credentials (password_salt, password_hash) VALUES (?, ?)", [salt, hash]);
    return;
  }
  if (USE_SUPABASE) {
    if (row) {
      const { error } = await supabase.from("admin_credentials")
        .update({ password_salt: salt, password_hash: hash, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("admin_credentials").insert({ password_salt: salt, password_hash: hash });
      if (error) throw new Error(error.message);
    }
  }
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const [, token] = auth.split(" ");
  const parsed = parseAdminToken(token);
  if (!parsed) return res.status(401).json({ error: "No autorizado." });
  return next();
}

module.exports = {
  getClientIp,
  checkLoginRateLimit,
  resetLoginRateLimit,
  timingSafeEqualString,
  validateFileMagicBytes,
  createAdminSession,
  parseAdminToken,
  verifyAdminPassword,
  setAdminPassword,
  requireAdmin,
  LOGIN_WINDOW_MS,
};
