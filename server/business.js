const { USE_SQLITE, USE_SUPABASE, supabase, dbGet, dbRun } = require("./db");

const CACHE_TTL_MS = 20_000;
let cached = null;
let cachedAt = 0;

function invalidateBusinessCache() {
  cached = null;
  cachedAt = 0;
}

function mapBusinessRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    nombre: row.nombre,
    direccion: row.direccion || "",
    horarioTexto: row.horario_texto || "",
    instagramUrl: row.instagram_url || "",
    whatsappNumero: row.whatsapp_numero || "",
    colorMarca: row.color_marca || "#111111",
    logoUrl: row.logo_url || null,
    // Convención: "\n" literal (dos caracteres) separa línea 1 / línea 2 del headline.
    heroTitulo: row.hero_titulo || "",
    heroSubtitulo: row.hero_subtitulo || "",
    heroCtaPrimarioTexto: row.hero_cta_primario_texto || "",
    heroCtaPrimarioLink: row.hero_cta_primario_link || "/productos",
    heroCtaSecundarioTexto: row.hero_cta_secundario_texto || "",
    heroCtaSecundarioLink: row.hero_cta_secundario_link || "/productos",
    beneficio1Titulo: row.beneficio1_titulo || "",
    beneficio1Subtitulo: row.beneficio1_subtitulo || "",
    beneficio2Titulo: row.beneficio2_titulo || "",
    beneficio2Subtitulo: row.beneficio2_subtitulo || "",
    beneficio3Titulo: row.beneficio3_titulo || "",
    beneficio3Subtitulo: row.beneficio3_subtitulo || "",
  };
}

async function getBusinessUncached() {
  if (USE_SQLITE) {
    const row = await dbGet("SELECT * FROM business ORDER BY id LIMIT 1");
    return mapBusinessRow(row);
  }
  if (USE_SUPABASE) {
    const { data } = await supabase.from("business").select("*").order("id").limit(1).maybeSingle();
    return mapBusinessRow(data);
  }
  return null;
}

async function getBusiness() {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;
  cached = await getBusinessUncached();
  cachedAt = Date.now();
  return cached;
}

const PATCHABLE_FIELDS = {
  nombre: "nombre",
  direccion: "direccion",
  horarioTexto: "horario_texto",
  instagramUrl: "instagram_url",
  whatsappNumero: "whatsapp_numero",
  colorMarca: "color_marca",
  heroTitulo: "hero_titulo",
  heroSubtitulo: "hero_subtitulo",
  heroCtaPrimarioTexto: "hero_cta_primario_texto",
  heroCtaPrimarioLink: "hero_cta_primario_link",
  heroCtaSecundarioTexto: "hero_cta_secundario_texto",
  heroCtaSecundarioLink: "hero_cta_secundario_link",
  beneficio1Titulo: "beneficio1_titulo",
  beneficio1Subtitulo: "beneficio1_subtitulo",
  beneficio2Titulo: "beneficio2_titulo",
  beneficio2Subtitulo: "beneficio2_subtitulo",
  beneficio3Titulo: "beneficio3_titulo",
  beneficio3Subtitulo: "beneficio3_subtitulo",
};

async function updateBusiness(body) {
  const patch = {};
  for (const [key, column] of Object.entries(PATCHABLE_FIELDS)) {
    if (typeof body[key] === "string") patch[column] = body[key].trim();
  }
  if (Object.keys(patch).length === 0) return getBusiness();

  const business = await getBusiness();
  if (!business) throw new Error("Negocio no encontrado.");

  if (USE_SQLITE) {
    const sets = Object.keys(patch).map((c) => `${c} = ?`).join(", ");
    await dbRun(`UPDATE business SET ${sets}, updated_at = datetime('now') WHERE id = ?`, [...Object.values(patch), business.id]);
  } else if (USE_SUPABASE) {
    patch.updated_at = new Date().toISOString();
    const { error } = await supabase.from("business").update(patch).eq("id", business.id);
    if (error) throw new Error(error.message);
  }
  invalidateBusinessCache();
  return getBusiness();
}

async function updateBusinessLogo(logoUrl) {
  const business = await getBusiness();
  if (!business) throw new Error("Negocio no encontrado.");
  if (USE_SQLITE) {
    await dbRun("UPDATE business SET logo_url = ?, updated_at = datetime('now') WHERE id = ?", [logoUrl, business.id]);
  } else if (USE_SUPABASE) {
    const { error } = await supabase.from("business").update({ logo_url: logoUrl }).eq("id", business.id);
    if (error) throw new Error(error.message);
  }
  invalidateBusinessCache();
}

module.exports = {
  getBusiness,
  updateBusiness,
  updateBusinessLogo,
  invalidateBusinessCache,
};
