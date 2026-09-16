const path = require("path");
const fs = require("fs/promises");
const multer = require("multer");
const { USE_SUPABASE, supabase, SUPABASE_BUCKET, UPLOADS_DIR } = require("./db");

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new Error("Solo se permiten imágenes (JPG, PNG, WEBP)."));
  },
});

/**
 * Sube una imagen ya validada (magic bytes) a Supabase Storage, o al
 * filesystem local (`/uploads/<folder>/...`) cuando se usa el fallback
 * SQLite. Devuelve la URL pública. `folder` es el subdirectorio lógico
 * (logo, hero, categorias, productos).
 */
async function uploadImage(folder, filenameHint, file) {
  const ext = (path.extname(file.originalname) || ".jpg").toLowerCase();
  const filename = `${filenameHint}_${Date.now()}${ext}`;

  if (USE_SUPABASE) {
    const storagePath = `${folder}/${filename}`;
    const { error: uploadErr } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: true });
    if (uploadErr) throw new Error(uploadErr.message);
    const { data: { publicUrl } } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(storagePath);
    return publicUrl;
  }

  const dir = path.join(UPLOADS_DIR, folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), file.buffer);
  return `/uploads/${folder}/${filename}`;
}

async function removeImage(imagenUrl) {
  if (!imagenUrl) return;
  if (USE_SUPABASE) {
    const marker = `/storage/v1/object/public/${SUPABASE_BUCKET}/`;
    const idx = imagenUrl.indexOf(marker);
    if (idx === -1) return;
    const storagePath = imagenUrl.slice(idx + marker.length);
    await supabase.storage.from(SUPABASE_BUCKET).remove([storagePath]).catch(() => {});
    return;
  }
  if (imagenUrl.startsWith("/uploads/")) {
    await fs.unlink(path.join(UPLOADS_DIR, "..", imagenUrl)).catch(() => {});
  }
}

module.exports = { imageUpload, uploadImage, removeImage };
