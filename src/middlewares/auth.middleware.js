const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const env = require("../config/env");

const JWT_SECRET = env.JWT_SECRET;

/**
 * Verifica que el request traiga un token JWT válido en el header
 *   Authorization: Bearer <token>
 * Si es válido, agrega req.user con { id, email, role } y deja pasar.
 * Si no, responde 401.
 */
function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    logger.warn("Acceso sin token", { path: req.path, ip: req.ip });
    return res.status(401).json({ error: "Token de autorización requerido" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email, role, iat, exp }
    next();
  } catch (err) {
    logger.warn("Token inválido o expirado", { path: req.path, error: err.message });
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

/**
 * Solo permite el paso si el usuario es ADMIN.
 * Debe usarse DESPUÉS de authRequired.
 */
function adminRequired(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "No autenticado" });
  }
  if (req.user.role !== "ADMIN") {
    logger.warn("Intento de acceso a ruta admin sin permisos", {
      userId: req.user.id,
      path: req.path,
    });
    return res.status(403).json({ error: "Se requieren permisos de administrador" });
  }
  next();
}

module.exports = { authRequired, adminRequired };
