const express = require("express");
const { USE_SQLITE, USE_SUPABASE, supabase, dbGet, dbRun, isMissingTableError } = require("../db");
const { requireAdmin, validateFileMagicBytes } = require("../auth");
const { imageUpload, uploadImage, removeImage } = require("../storage");
const { slugify, mapCategoriaRow, listCategorias } = require("../categorias");

const router = express.Router();

const MISSING_TABLE_MSG = "Todavía no corriste supabase-planetasurf.sql en tu proyecto de Supabase.";

router.get("/categorias", async (_req, res, next) => {
  try {
    res.json(await listCategorias({ onlyActivas: true }));
  } catch (error) { next(error); }
});

router.get("/admin/categorias", requireAdmin, async (_req, res, next) => {
  try {
    res.json(await listCategorias({ onlyActivas: false }));
  } catch (error) { next(error); }
});

router.post("/admin/categorias", requireAdmin, async (req, res, next) => {
  try {
    const nombre = String(req.body?.nombre || "").trim().slice(0, 80);
    if (!nombre) return res.status(400).json({ error: "El nombre es obligatorio." });
    const slug = slugify(req.body?.slug) || slugify(nombre);
    if (!slug) return res.status(400).json({ error: "No se pudo generar un slug válido." });
    const orden = Number.isFinite(Number(req.body?.orden)) ? Math.trunc(Number(req.body.orden)) : 0;

    if (USE_SQLITE) {
      const result = await dbRun("INSERT INTO categorias (nombre, slug, orden) VALUES (?, ?, ?)", [nombre, slug, orden]);
      const row = await dbGet("SELECT * FROM categorias WHERE id = ?", [result.lastID]);
      return res.status(201).json(mapCategoriaRow(row));
    }
    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("categorias").insert({ nombre, slug, orden }).select().single();
      if (error) {
        if (isMissingTableError(error)) return res.status(409).json({ error: MISSING_TABLE_MSG });
        if (error.code === "23505") return res.status(409).json({ error: "Ya existe una categoría con ese slug." });
        throw new Error(error.message);
      }
      return res.status(201).json(mapCategoriaRow(data));
    }
    return res.status(501).json({ error: "No disponible en este entorno." });
  } catch (error) { next(error); }
});

router.put("/admin/categorias/:id", requireAdmin, async (req, res, next) => {
  try {
    const nombre = String(req.body?.nombre || "").trim().slice(0, 80);
    if (!nombre) return res.status(400).json({ error: "El nombre es obligatorio." });
    const slug = slugify(req.body?.slug) || slugify(nombre);
    const orden = Number.isFinite(Number(req.body?.orden)) ? Math.trunc(Number(req.body.orden)) : 0;
    const activo = req.body?.activo !== false;

    if (USE_SQLITE) {
      await dbRun("UPDATE categorias SET nombre = ?, slug = ?, orden = ?, activo = ? WHERE id = ?", [nombre, slug, orden, activo ? 1 : 0, req.params.id]);
    } else if (USE_SUPABASE) {
      const { error } = await supabase.from("categorias").update({ nombre, slug, orden, activo }).eq("id", req.params.id);
      if (error) throw new Error(error.message);
    }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.patch("/admin/categorias/:id/imagen", requireAdmin, imageUpload.single("imagen"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No se recibió imagen." });
    if (!(await validateFileMagicBytes(req.file))) return res.status(400).json({ error: "Imagen inválida. Solo JPG, PNG, WEBP." });

    const imagenUrl = await uploadImage("categorias", `cat_${req.params.id}`, req.file);
    if (USE_SQLITE) {
      await dbRun("UPDATE categorias SET imagen_url = ? WHERE id = ?", [imagenUrl, req.params.id]);
    } else if (USE_SUPABASE) {
      const { error } = await supabase.from("categorias").update({ imagen_url: imagenUrl }).eq("id", req.params.id);
      if (error) throw new Error(error.message);
    }
    res.json({ ok: true, imagenUrl });
  } catch (error) { next(error); }
});

router.delete("/admin/categorias/:id", requireAdmin, async (req, res, next) => {
  try {
    if (USE_SQLITE) {
      const row = await dbGet("SELECT * FROM categorias WHERE id = ?", [req.params.id]);
      if (row?.imagen_url) await removeImage(row.imagen_url);
      await dbRun("DELETE FROM categorias WHERE id = ?", [req.params.id]);
    } else if (USE_SUPABASE) {
      const { data: row } = await supabase.from("categorias").select("imagen_url").eq("id", req.params.id).maybeSingle();
      if (row?.imagen_url) await removeImage(row.imagen_url);
      const { error } = await supabase.from("categorias").delete().eq("id", req.params.id);
      if (error) throw new Error(error.message);
    }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

module.exports = router;
