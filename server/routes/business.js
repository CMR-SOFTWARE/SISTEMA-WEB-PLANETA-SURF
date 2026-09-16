const express = require("express");
const { requireAdmin, validateFileMagicBytes } = require("../auth");
const { imageUpload, uploadImage } = require("../storage");
const { getBusiness, updateBusiness, updateBusinessLogo } = require("../business");

const router = express.Router();

router.get("/config", async (_req, res, next) => {
  try {
    const business = await getBusiness();
    if (!business) return res.status(404).json({ error: "Negocio no configurado." });
    res.json(business);
  } catch (error) { next(error); }
});

router.patch("/admin/business", requireAdmin, async (req, res, next) => {
  try {
    const business = await updateBusiness(req.body || {});
    res.json(business);
  } catch (error) { next(error); }
});

router.patch("/admin/logo", requireAdmin, imageUpload.single("logo"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No se recibió imagen." });
    if (!(await validateFileMagicBytes(req.file))) return res.status(400).json({ error: "Imagen inválida. Solo JPG, PNG, WEBP." });
    const logoUrl = await uploadImage("logo", "logo", req.file);
    await updateBusinessLogo(logoUrl);
    res.json({ ok: true, logoUrl });
  } catch (error) { next(error); }
});

module.exports = router;
