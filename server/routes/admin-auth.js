const express = require("express");
const {
  getClientIp,
  checkLoginRateLimit,
  resetLoginRateLimit,
  createAdminSession,
  verifyAdminPassword,
  setAdminPassword,
  requireAdmin,
} = require("../auth");

const router = express.Router();

router.post("/admin/login", async (req, res, next) => {
  try {
    const password = String(req.body?.password || "");
    const rateKey = getClientIp(req);
    if (!(await checkLoginRateLimit(rateKey))) {
      return res.status(429).json({ error: "Demasiados intentos. Esperá unos minutos y volvé a intentar." });
    }
    const ok = await verifyAdminPassword(password);
    if (!ok) return res.status(401).json({ error: "Contraseña incorrecta." });
    await resetLoginRateLimit(rateKey);
    res.json({ token: createAdminSession() });
  } catch (error) { next(error); }
});

router.post("/admin/password", requireAdmin, async (req, res, next) => {
  try {
    const actual = String(req.body?.actual || "");
    const nueva = String(req.body?.nueva || "");
    if (nueva.length < 6) return res.status(400).json({ error: "La contraseña nueva debe tener al menos 6 caracteres." });
    const ok = await verifyAdminPassword(actual);
    if (!ok) return res.status(401).json({ error: "La contraseña actual no es correcta." });
    await setAdminPassword(nueva);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

module.exports = router;
