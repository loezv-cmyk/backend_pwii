const fs = require("fs");
const path = require("path");
const os = require("os");
const Log = require("../models/log.model");

// Carpeta de logs — se escribe en temp del sistema para evitar
// que Live Server detecte cambios y recargue el navegador en dev.
// El archivo queda en: C:\Users\<usuario>\AppData\Local\Temp\biblioteca-app.log
const LOG_DIR = path.join(os.tmpdir(), "biblioteca-logs");
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LOG_FILE = path.join(LOG_DIR, "app.log");
console.log("📋 Logs en:", LOG_FILE);

function writeToFile(level, message, meta) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${message}${meta ? " | " + JSON.stringify(meta) : ""}\n`;
  fs.appendFile(LOG_FILE, line, (err) => {
    if (err) console.error("Error escribiendo log:", err);
  });
}

async function writeToDb(level, message, meta) {
  try {
    await Log.create({
      level,
      message,
      meta: meta ?? null,
    });
  } catch (err) {
    // Si la BD falla, al menos no truene el server
    console.error("Error guardando log en BD:", err.message);
  }
}

async function log(level, message, meta) {
  writeToFile(level, message, meta);
  await writeToDb(level, message, meta);
}

module.exports = {
  info:  (msg, meta) => log("INFO",  msg, meta),
  warn:  (msg, meta) => log("WARN",  msg, meta),
  error: (msg, meta) => log("ERROR", msg, meta),
  debug: (msg, meta) => log("DEBUG", msg, meta),
};
