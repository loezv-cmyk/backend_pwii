const logger = require("../utils/logger");

/**
 * Middleware central de manejo de errores.
 * Debe registrarse al FINAL de todos los app.use() en server.js.
 */
function errorHandler(err, req, res, next) {
  logger.error("Excepción no controlada", {
    path: req.path,
    method: req.method,
    message: err.message,
    stack: err.stack,
  });

  // Si la respuesta ya se envió, delegar al handler default de Express
  if (res.headersSent) return next(err);

  res.status(err.status || 500).json({
    error: err.message || "Error interno del servidor",
  });
}

/**
 * Middleware para rutas no encontradas (404).
 */
function notFoundHandler(req, res) {
  logger.warn("Ruta no encontrada", { path: req.path, method: req.method });
  res.status(404).json({ error: "Ruta no encontrada" });
}

module.exports = { errorHandler, notFoundHandler };
