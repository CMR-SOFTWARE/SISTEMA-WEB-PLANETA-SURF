const express = require("express");
const { USE_SQLITE, USE_SUPABASE, supabase, dbAll, dbGet, dbRun, isMissingTableError } = require("../db");
const { requireAdmin, validateFileMagicBytes } = require("../auth");
const { imageUpload, uploadImage, removeImage } = require("../storage");
const { getCategoriasById } = require("../categorias");

const router = express.Router();

const MISSING_TABLE_MSG = "Todavía no corriste supabase-planetasurf.sql en tu proyecto de Supabase.";
const MAX_IMAGENES_ADICIONALES = 6;

function parseArrayField(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }
  return [];
}

function parseListInput(value) {
  // Body puede llegar como array (JSON) o como string separada por comas (form).
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((v) => v.trim()).filter(Boolean);
  return [];
}

function mapProductoRow(row, categoriasById) {
  const categoria = row.categoria_id != null ? categoriasById.get(Number(row.categoria_id)) || null : null;
  return {
    id: row.id,
    nombre: row.nombre,
    descripcion: row.descripcion || "",
    precio: Number(row.precio) || 0,
    precioPromocional: row.precio_promocional != null ? Number(row.precio_promocional) : null,
    categoriaId: row.categoria_id ?? null,
    categoria,
    imagenPrincipal: row.imagen_principal || null,
    imagenesAdicionales: parseArrayField(row.imagenes_adicionales),
    etiqueta: row.etiqueta || null,
    destacado: USE_SQLITE ? row.destacado === 1 : row.destacado === true,
    mostrarEnHome: USE_SQLITE ? row.mostrar_en_home === 1 : row.mostrar_en_home === true,
    ordenHome: row.orden_home ?? null,
    activo: USE_SQLITE ? row.activo !== 0 : row.activo !== false,
    disponible: USE_SQLITE ? row.disponible !== 0 : row.disponible !== false,
    stock: row.stock ?? null,
    talles: parseArrayField(row.talles),
    createdAt: row.created_at,
  };
}

async function fetchAllProductos() {
  const categoriasById = await getCategoriasById();
  if (USE_SQLITE) {
    const rows = await dbAll("SELECT * FROM productos ORDER BY created_at DESC");
    return rows.map((r) => mapProductoRow(r, categoriasById));
  }
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from("productos").select("*").order("created_at", { ascending: false });
    if (error) {
      if (isMissingTableError(error)) return [];
      throw new Error(error.message);
    }
    return (data || []).map((r) => mapProductoRow(r, categoriasById));
  }
  return [];
}

function applyFiltersAndSort(productos, query) {
  let result = productos.filter((p) => p.activo);

  if (query.categoria) {
    result = result.filter((p) => p.categoria?.slug === query.categoria);
  }
  if (query.precioMin) {
    const min = Number(query.precioMin);
    if (Number.isFinite(min)) result = result.filter((p) => (p.precioPromocional ?? p.precio) >= min);
  }
  if (query.precioMax) {
    const max = Number(query.precioMax);
    if (Number.isFinite(max)) result = result.filter((p) => (p.precioPromocional ?? p.precio) <= max);
  }
  if (query.disponible === "1") result = result.filter((p) => p.disponible);
  if (query.promocion === "1") result = result.filter((p) => p.precioPromocional != null && p.precioPromocional < p.precio);
  if (query.destacado === "1") result = result.filter((p) => p.destacado);
  if (query.talle) result = result.filter((p) => p.talles.includes(query.talle));
  if (query.q) {
    const q = String(query.q).toLowerCase().trim();
    result = result.filter((p) => p.nombre.toLowerCase().includes(q) || p.descripcion.toLowerCase().includes(q));
  }

  const precioEfectivo = (p) => p.precioPromocional ?? p.precio;
  switch (query.orden) {
    case "precio_asc": result = [...result].sort((a, b) => precioEfectivo(a) - precioEfectivo(b)); break;
    case "precio_desc": result = [...result].sort((a, b) => precioEfectivo(b) - precioEfectivo(a)); break;
    case "novedades": result = [...result].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
    case "destacados": result = [...result].sort((a, b) => (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0)); break;
    default: break; // relevancia: orden de llegada (más nuevos primero, ya viene así de la query)
  }
  return result;
}

router.get("/productos", async (req, res, next) => {
  try {
    const productos = await fetchAllProductos();
    res.json(applyFiltersAndSort(productos, req.query));
  } catch (error) { next(error); }
});

router.get("/productos-home", async (_req, res, next) => {
  try {
    const productos = await fetchAllProductos();
    const home = productos
      .filter((p) => p.activo && p.mostrarEnHome)
      .sort((a, b) => (a.ordenHome ?? 999) - (b.ordenHome ?? 999));
    res.json(home);
  } catch (error) { next(error); }
});

router.get("/productos/:id", async (req, res, next) => {
  try {
    const categoriasById = await getCategoriasById();
    if (USE_SQLITE) {
      const row = await dbGet("SELECT * FROM productos WHERE id = ? AND activo = 1", [req.params.id]);
      if (!row) return res.status(404).json({ error: "Producto no encontrado." });
      return res.json(mapProductoRow(row, categoriasById));
    }
    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("productos").select("*").eq("id", req.params.id).eq("activo", true).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return res.status(404).json({ error: "Producto no encontrado." });
      return res.json(mapProductoRow(data, categoriasById));
    }
    return res.status(404).json({ error: "Producto no encontrado." });
  } catch (error) { next(error); }
});

// ============================================================
// ADMIN
// ============================================================

router.get("/admin/productos", requireAdmin, async (_req, res, next) => {
  try {
    res.json(await fetchAllProductos());
  } catch (error) { next(error); }
});

function parseProductoBody(body = {}) {
  const nombre = String(body.nombre || "").trim().slice(0, 120);
  const descripcion = String(body.descripcion || "").trim().slice(0, 1000);
  const precio = Number(body.precio);
  const precioPromocionalRaw = body.precioPromocional;
  const precioPromocional = precioPromocionalRaw === "" || precioPromocionalRaw == null ? null : Number(precioPromocionalRaw);
  const categoriaId = body.categoriaId === "" || body.categoriaId == null ? null : Number(body.categoriaId);
  const etiqueta = String(body.etiqueta || "").trim().slice(0, 40) || null;
  const destacado = body.destacado === true || body.destacado === "true";
  const mostrarEnHome = body.mostrarEnHome === true || body.mostrarEnHome === "true";
  const ordenHomeRaw = body.ordenHome;
  const ordenHome = mostrarEnHome && ordenHomeRaw !== "" && ordenHomeRaw != null ? Math.trunc(Number(ordenHomeRaw)) : null;
  const disponible = body.disponible !== false && body.disponible !== "false";
  const stock = body.stock === "" || body.stock == null ? null : Math.max(0, Math.trunc(Number(body.stock) || 0));
  const talles = parseListInput(body.talles);
  return { nombre, descripcion, precio, precioPromocional, categoriaId, etiqueta, destacado, mostrarEnHome, ordenHome, disponible, stock, talles };
}

function validateProductoBody(p) {
  if (!p.nombre || p.nombre.length < 2) return "El nombre es obligatorio.";
  if (!(p.precio > 0)) return "El precio tiene que ser mayor a 0.";
  if (p.precioPromocional != null && !(p.precioPromocional > 0)) return "El precio promocional tiene que ser mayor a 0.";
  if (p.precioPromocional != null && p.precioPromocional >= p.precio) return "El precio promocional tiene que ser menor al precio normal.";
  return null;
}

router.post("/admin/productos", requireAdmin, async (req, res, next) => {
  try {
    const parsed = parseProductoBody(req.body);
    const errorMsg = validateProductoBody(parsed);
    if (errorMsg) return res.status(400).json({ error: errorMsg });

    if (USE_SQLITE) {
      const result = await dbRun(
        `INSERT INTO productos (nombre, descripcion, precio, precio_promocional, categoria_id, etiqueta, destacado, mostrar_en_home, orden_home, disponible, stock, talles)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [parsed.nombre, parsed.descripcion, parsed.precio, parsed.precioPromocional, parsed.categoriaId, parsed.etiqueta,
          parsed.destacado ? 1 : 0, parsed.mostrarEnHome ? 1 : 0, parsed.ordenHome, parsed.disponible ? 1 : 0, parsed.stock,
          JSON.stringify(parsed.talles)]
      );
      const row = await dbGet("SELECT * FROM productos WHERE id = ?", [result.lastID]);
      return res.status(201).json(mapProductoRow(row, await getCategoriasById()));
    }
    if (USE_SUPABASE) {
      const { data, error } = await supabase.from("productos").insert({
        nombre: parsed.nombre,
        descripcion: parsed.descripcion,
        precio: parsed.precio,
        precio_promocional: parsed.precioPromocional,
        categoria_id: parsed.categoriaId,
        etiqueta: parsed.etiqueta,
        destacado: parsed.destacado,
        mostrar_en_home: parsed.mostrarEnHome,
        orden_home: parsed.ordenHome,
        disponible: parsed.disponible,
        stock: parsed.stock,
        talles: parsed.talles,
        activo: true,
      }).select().single();
      if (error) {
        if (isMissingTableError(error)) return res.status(409).json({ error: MISSING_TABLE_MSG });
        throw new Error(error.message);
      }
      return res.status(201).json(mapProductoRow(data, await getCategoriasById()));
    }
    return res.status(501).json({ error: "No disponible en este entorno." });
  } catch (error) { next(error); }
});

router.put("/admin/productos/:id", requireAdmin, async (req, res, next) => {
  try {
    const parsed = parseProductoBody(req.body);
    const errorMsg = validateProductoBody(parsed);
    if (errorMsg) return res.status(400).json({ error: errorMsg });
    const activo = req.body?.activo !== false && req.body?.activo !== "false";

    if (USE_SQLITE) {
      await dbRun(
        `UPDATE productos SET nombre = ?, descripcion = ?, precio = ?, precio_promocional = ?, categoria_id = ?, etiqueta = ?,
           destacado = ?, mostrar_en_home = ?, orden_home = ?, disponible = ?, stock = ?, talles = ?, activo = ?,
           updated_at = datetime('now') WHERE id = ?`,
        [parsed.nombre, parsed.descripcion, parsed.precio, parsed.precioPromocional, parsed.categoriaId, parsed.etiqueta,
          parsed.destacado ? 1 : 0, parsed.mostrarEnHome ? 1 : 0, parsed.ordenHome, parsed.disponible ? 1 : 0, parsed.stock,
          JSON.stringify(parsed.talles), activo ? 1 : 0, req.params.id]
      );
    } else if (USE_SUPABASE) {
      const { error } = await supabase.from("productos").update({
        nombre: parsed.nombre,
        descripcion: parsed.descripcion,
        precio: parsed.precio,
        precio_promocional: parsed.precioPromocional,
        categoria_id: parsed.categoriaId,
        etiqueta: parsed.etiqueta,
        destacado: parsed.destacado,
        mostrar_en_home: parsed.mostrarEnHome,
        orden_home: parsed.ordenHome,
        disponible: parsed.disponible,
        stock: parsed.stock,
        talles: parsed.talles,
        activo,
        updated_at: new Date().toISOString(),
      }).eq("id", req.params.id);
      if (error) throw new Error(error.message);
    }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.delete("/admin/productos/:id", requireAdmin, async (req, res, next) => {
  try {
    if (USE_SQLITE) {
      const row = await dbGet("SELECT * FROM productos WHERE id = ?", [req.params.id]);
      if (row) {
        if (row.imagen_principal) await removeImage(row.imagen_principal);
        for (const url of parseArrayField(row.imagenes_adicionales)) await removeImage(url);
      }
      await dbRun("DELETE FROM productos WHERE id = ?", [req.params.id]);
    } else if (USE_SUPABASE) {
      const { data: row } = await supabase.from("productos").select("imagen_principal, imagenes_adicionales").eq("id", req.params.id).maybeSingle();
      if (row) {
        if (row.imagen_principal) await removeImage(row.imagen_principal);
        for (const url of parseArrayField(row.imagenes_adicionales)) await removeImage(url);
      }
      const { error } = await supabase.from("productos").delete().eq("id", req.params.id);
      if (error) throw new Error(error.message);
    }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// ---- Imágenes ----

async function getProductoRaw(id) {
  if (USE_SQLITE) return dbGet("SELECT * FROM productos WHERE id = ?", [id]);
  if (USE_SUPABASE) {
    const { data } = await supabase.from("productos").select("*").eq("id", id).maybeSingle();
    return data;
  }
  return null;
}

async function saveImagenes(id, imagenPrincipal, imagenesAdicionales) {
  if (USE_SQLITE) {
    await dbRun("UPDATE productos SET imagen_principal = ?, imagenes_adicionales = ? WHERE id = ?", [
      imagenPrincipal, JSON.stringify(imagenesAdicionales), id,
    ]);
    return;
  }
  if (USE_SUPABASE) {
    const { error } = await supabase.from("productos")
      .update({ imagen_principal: imagenPrincipal, imagenes_adicionales: imagenesAdicionales })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }
}

router.post("/admin/productos/:id/imagenes", requireAdmin, imageUpload.single("imagen"), async (req, res, next) => {
  try {
    const producto = await getProductoRaw(req.params.id);
    if (!producto) return res.status(404).json({ error: "Producto no encontrado." });
    if (!req.file) return res.status(400).json({ error: "No se recibió imagen." });
    if (!(await validateFileMagicBytes(req.file))) return res.status(400).json({ error: "Imagen inválida. Solo JPG, PNG, WEBP." });

    const adicionales = parseArrayField(producto.imagenes_adicionales);
    if (!producto.imagen_principal && adicionales.length === 0) {
      const url = await uploadImage("productos", `prod_${req.params.id}_principal`, req.file);
      await saveImagenes(req.params.id, url, adicionales);
      return res.json({ ok: true, imagenPrincipal: url, imagenesAdicionales: adicionales });
    }
    if (adicionales.length >= MAX_IMAGENES_ADICIONALES) {
      return res.status(400).json({ error: `Máximo ${MAX_IMAGENES_ADICIONALES} imágenes adicionales.` });
    }
    const url = await uploadImage("productos", `prod_${req.params.id}`, req.file);
    const nuevas = [...adicionales, url];
    await saveImagenes(req.params.id, producto.imagen_principal, nuevas);
    res.json({ ok: true, imagenPrincipal: producto.imagen_principal, imagenesAdicionales: nuevas });
  } catch (error) { next(error); }
});

router.patch("/admin/productos/:id/imagen-principal", requireAdmin, async (req, res, next) => {
  try {
    const producto = await getProductoRaw(req.params.id);
    if (!producto) return res.status(404).json({ error: "Producto no encontrado." });
    const url = String(req.body?.url || "");
    const adicionales = parseArrayField(producto.imagenes_adicionales);
    if (!adicionales.includes(url)) return res.status(400).json({ error: "Esa imagen no está entre las adicionales del producto." });

    const nuevasAdicionales = adicionales.filter((u) => u !== url);
    if (producto.imagen_principal) nuevasAdicionales.push(producto.imagen_principal);
    await saveImagenes(req.params.id, url, nuevasAdicionales);
    res.json({ ok: true, imagenPrincipal: url, imagenesAdicionales: nuevasAdicionales });
  } catch (error) { next(error); }
});

router.delete("/admin/productos/:id/imagenes", requireAdmin, async (req, res, next) => {
  try {
    const producto = await getProductoRaw(req.params.id);
    if (!producto) return res.status(404).json({ error: "Producto no encontrado." });
    const url = String(req.body?.url || "");
    await removeImage(url);

    let imagenPrincipal = producto.imagen_principal;
    let adicionales = parseArrayField(producto.imagenes_adicionales);
    if (url === imagenPrincipal) {
      imagenPrincipal = adicionales[0] || null;
      adicionales = adicionales.slice(1);
    } else {
      adicionales = adicionales.filter((u) => u !== url);
    }
    await saveImagenes(req.params.id, imagenPrincipal, adicionales);
    res.json({ ok: true, imagenPrincipal, imagenesAdicionales: adicionales });
  } catch (error) { next(error); }
});

module.exports = router;
