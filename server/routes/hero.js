const express = require("express");
const { USE_SQLITE, USE_SUPABASE, supabase, dbAll, dbGet, dbRun, isMissingTableError } = require("../db");
const { requireAdmin, validateFileMagicBytes } = require("../auth");
const { imageUpload, uploadImage, removeImage } = require("../storage");

const router = express.Router();

const MAX_HERO_SLIDES = 4;

function mapSlideRow(row) {
  return {
    id: row.id,
    imagenUrl: row.imagen_url,
    orden: row.orden ?? 0,
    activo: USE_SQLITE ? row.activo !== 0 : row.activo !== false,
  };
}

async function listSlides({ onlyActivos } = {}) {
  if (USE_SQLITE) {
    const sql = onlyActivos
      ? "SELECT * FROM hero_slides WHERE activo = 1 ORDER BY orden ASC, id ASC"
      : "SELECT * FROM hero_slides ORDER BY orden ASC, id ASC";
    return (await dbAll(sql)).map(mapSlideRow);
  }
  if (USE_SUPABASE) {
    let query = supabase.from("hero_slides").select("*").order("orden", { ascending: true }).order("id", { ascending: true });
    if (onlyActivos) query = query.eq("activo", true);
    const { data, error } = await query;
    if (error) {
      if (isMissingTableError(error)) return [];
      throw new Error(error.message);
    }
    return (data || []).map(mapSlideRow);
  }
  return [];
}

router.get("/hero-slides", async (_req, res, next) => {
  try { res.json(await listSlides({ onlyActivos: true })); } catch (error) { next(error); }
});

router.get("/admin/hero-slides", requireAdmin, async (_req, res, next) => {
  try { res.json(await listSlides({ onlyActivos: false })); } catch (error) { next(error); }
});

router.post("/admin/hero-slides", requireAdmin, imageUpload.single("imagen"), async (req, res, next) => {
  try {
    const existentes = await listSlides({});
    if (existentes.length >= MAX_HERO_SLIDES) {
      return res.status(400).json({ error: `Máximo ${MAX_HERO_SLIDES} imágenes en el banner principal.` });
    }
    if (!req.file) return res.status(400).json({ error: "No se recibió imagen." });
    if (!(await validateFileMagicBytes(req.file))) return res.status(400).json({ error: "Imagen inválida. Solo JPG, PNG, WEBP." });

    const imagenUrl = await uploadImage("hero", `hero_${Date.now()}`, req.file);
    const orden = existentes.length;

    if (USE_SQLITE) {
      const result = await dbRun("INSERT INTO hero_slides (imagen_url, orden) VALUES (?, ?)", [imagenUrl, orden]);
      const row = await dbGet("SELECT * FROM hero_slides WHERE id = ?", [result.lastID]);
      return res.status(201).json(mapSlideRow(row));
    }
    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("hero_slides").insert({ imagen_url: imagenUrl, orden }).select().single();
      if (error) {
        if (isMissingTableError(error)) return res.status(409).json({ error: "Todavía no corriste supabase-planetasurf.sql." });
        throw new Error(error.message);
      }
      return res.status(201).json(mapSlideRow(data));
    }
    return res.status(501).json({ error: "No disponible en este entorno." });
  } catch (error) { next(error); }
});

router.patch("/admin/hero-slides/:id", requireAdmin, async (req, res, next) => {
  try {
    const patch = {};
    if (Number.isFinite(Number(req.body?.orden))) patch.orden = Math.trunc(Number(req.body.orden));
    if (typeof req.body?.activo === "boolean") patch.activo = req.body.activo;
    if (Object.keys(patch).length === 0) return res.json({ ok: true });

    if (USE_SQLITE) {
      const sets = [];
      const params = [];
      if ("orden" in patch) { sets.push("orden = ?"); params.push(patch.orden); }
      if ("activo" in patch) { sets.push("activo = ?"); params.push(patch.activo ? 1 : 0); }
      params.push(req.params.id);
      await dbRun(`UPDATE hero_slides SET ${sets.join(", ")} WHERE id = ?`, params);
    } else if (USE_SUPABASE) {
      const { error } = await supabase.from("hero_slides").update(patch).eq("id", req.params.id);
      if (error) throw new Error(error.message);
    }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.delete("/admin/hero-slides/:id", requireAdmin, async (req, res, next) => {
  try {
    if (USE_SQLITE) {
      const row = await dbGet("SELECT * FROM hero_slides WHERE id = ?", [req.params.id]);
      if (row?.imagen_url) await removeImage(row.imagen_url);
      await dbRun("DELETE FROM hero_slides WHERE id = ?", [req.params.id]);
    } else if (USE_SUPABASE) {
      const { data: row } = await supabase.from("hero_slides").select("imagen_url").eq("id", req.params.id).maybeSingle();
      if (row?.imagen_url) await removeImage(row.imagen_url);
      const { error } = await supabase.from("hero_slides").delete().eq("id", req.params.id);
      if (error) throw new Error(error.message);
    }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

module.exports = router;
