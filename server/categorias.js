const { USE_SQLITE, USE_SUPABASE, supabase, dbAll, isMissingTableError } = require("./db");

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function mapCategoriaRow(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    slug: row.slug,
    imagenUrl: row.imagen_url || null,
    orden: row.orden ?? 0,
    activo: USE_SQLITE ? row.activo !== 0 : row.activo !== false,
  };
}

async function listCategorias({ onlyActivas } = {}) {
  if (USE_SQLITE) {
    const sql = onlyActivas
      ? "SELECT * FROM categorias WHERE activo = 1 ORDER BY orden ASC, id ASC"
      : "SELECT * FROM categorias ORDER BY orden ASC, id ASC";
    return (await dbAll(sql)).map(mapCategoriaRow);
  }
  if (USE_SUPABASE) {
    let query = supabase.from("categorias").select("*").order("orden", { ascending: true }).order("id", { ascending: true });
    if (onlyActivas) query = query.eq("activo", true);
    const { data, error } = await query;
    if (error) {
      if (isMissingTableError(error)) return [];
      throw new Error(error.message);
    }
    return (data || []).map(mapCategoriaRow);
  }
  return [];
}

async function getCategoriasById() {
  const categorias = await listCategorias({});
  return new Map(categorias.map((c) => [Number(c.id), c]));
}

module.exports = { slugify, mapCategoriaRow, listCategorias, getCategoriasById };
