const express = require("express");
const cors    = require("cors");

const env = require("./config/env");
const { connectDb } = require("./config/db");
const logger = require("./utils/logger");
const { authRequired } = require("./middlewares/auth.middleware");
const { errorHandler, notFoundHandler } = require("./middlewares/error.middleware");

const authRoutes    = require("./routes/auth.routes");
const booksRoutes   = require("./routes/books.routes");
const usersRoutes   = require("./routes/users.routes");
const loansRoutes   = require("./routes/loans.routes");
const holdsRoutes   = require("./routes/holds.routes");
const finesRoutes   = require("./routes/fines.routes");
const reportsRoutes = require("./routes/reports.routes");

const app  = express();
const PORT = env.PORT;

const allowedOrigins = env.FRONTEND_ORIGIN
  ? env.FRONTEND_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
  : [];

const corsOptions = allowedOrigins.length > 0
  ? {
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error("Origen no permitido por CORS"));
      },
    }
  : {};

app.use(cors(corsOptions));
app.use(express.json());

// Health check (público)
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Servidor funcionando" });
});

// ====== Rutas públicas (login y register) ======
app.use("/auth", authRoutes);

// ====== Rutas protegidas (requieren JWT) ======
app.use("/books",   authRequired, booksRoutes);
app.use("/users",   authRequired, usersRoutes);
app.use("/loans",   authRequired, loansRoutes);
app.use("/holds",   authRequired, holdsRoutes);
app.use("/fines",   authRequired, finesRoutes);
app.use("/reports", authRequired, reportsRoutes);

// 404 y error handler (deben ir AL FINAL)
app.use(notFoundHandler);
app.use(errorHandler);

async function startServer() {
  try {
    await connectDb();

    app.listen(PORT, async () => {
      await logger.info("Servidor iniciado", { port: PORT });
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Error iniciando servidor:", err.message);
    process.exit(1);
  }
}

startServer();

// Captura de errores no controlados a nivel de proceso
process.on("uncaughtException", (err) => {
  logger.error("uncaughtException", { message: err.message, stack: err.stack });
});
process.on("unhandledRejection", (reason) => {
  logger.error("unhandledRejection", { reason: String(reason) });
});
