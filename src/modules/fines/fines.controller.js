const mongoose = require("mongoose");

const Fine = require("../../models/fine.model");
const Loan = require("../../models/loan.model");
const User = require("../../models/user.model");
const logger = require("../../utils/logger");
const { createFineSchema, updateFineSchema } = require("./fines.schemas");
const FINE_STATUSES = new Set(["PENDING", "PAID"]);

function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

function sameId(a, b) {
  return String(a) === String(b);
}

function isAdmin(req) {
  return req.user?.role === "ADMIN";
}

function isOwnUser(req, userId) {
  return sameId(req.user?.id, userId);
}

function forbidden(res) {
  return res.status(403).json({ error: "No tienes permisos para operar esta multa" });
}

async function hydrateFine(fineOrId) {
  const fine = await Fine.findById(fineOrId)
    .populate("userId", "name email")
    .populate({
      path: "loanId",
      select: "loanDate returnDate dueDate loanitem status",
      populate: {
        path: "loanitem.bookId",
        select: "title author",
      },
    });

  if (!fine) return null;

  const data = fine.toJSON();
  data.user = data.userId;
  data.loan = data.loanId;
  data.userId = data.user?.id ?? String(fine.userId);
  data.loanId = data.loan?.id ?? String(fine.loanId);

  if (data.loan?.loanitem) {
    data.loan.loanitem = data.loan.loanitem.map((item) => ({
      ...item,
      book: item.bookId,
      bookId: item.bookId?.id ?? String(item.bookId),
    }));
  }

  return data;
}

// GET /fines  (con filtros: ?userId=X, ?status=PENDING/PAID)
async function listFines(req, res) {
  try {
    const where = {};

    if (req.query.userId) {
      if (!isValidId(req.query.userId)) return res.status(400).json({ error: "userId invalido" });
      if (!isAdmin(req) && !isOwnUser(req, req.query.userId)) return forbidden(res);
      where.userId = req.query.userId;
    } else if (!isAdmin(req)) {
      where.userId = req.user.id;
    }

    if (req.query.status) {
      if (!FINE_STATUSES.has(req.query.status)) {
        return res.status(400).json({ error: "status invalido" });
      }
      where.status = req.query.status;
    }

    const fines = await Fine.find(where).sort({ createdAt: -1 });
    const result = await Promise.all(fines.map((fine) => hydrateFine(fine.id)));

    res.json(result);
  } catch (err) {
    logger.error("Error al listar multas", { error: err.message });
    res.status(500).json({ error: "Error al consultar multas" });
  }
}

// GET /fines/:id
async function getFine(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const fine = await hydrateFine(id);
    if (!fine) return res.status(404).json({ error: "Multa no encontrada" });
    if (!isAdmin(req) && !isOwnUser(req, fine.userId)) return forbidden(res);

    res.json(fine);
  } catch (err) {
    logger.error("Error al obtener multa", { error: err.message });
    res.status(500).json({ error: "Error al consultar multa" });
  }
}

// POST /fines
async function createFine(req, res) {
  logger.info("Creando multa", { body: req.body });

  try {
    const parsed = createFineSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Body invalido", details: parsed.error.issues });
    }

    const { userId, loanId, amount, reason } = parsed.data;

    const [user, loan] = await Promise.all([
      User.findById(userId),
      Loan.findById(loanId),
    ]);

    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    if (!loan) return res.status(404).json({ error: "Prestamo no encontrado" });
    if (!sameId(loan.userId, userId)) {
      return res.status(400).json({ error: "El prestamo no pertenece al usuario indicado" });
    }

    const fine = await Fine.create({
      userId,
      loanId,
      amount,
      reason,
      status: "PENDING",
    });

    const result = await hydrateFine(fine.id);
    logger.info("Multa creada", { fineId: result.id, userId, amount });

    res.status(201).json(result);
  } catch (err) {
    logger.error("Error al crear multa", { error: err.message });
    res.status(500).json({ error: "Error al crear multa" });
  }
}

// PUT /fines/:id  (ej: marcar como pagada)
async function updateFine(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const parsed = updateFineSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Body invalido", details: parsed.error.issues });
    }

    const exists = await Fine.findById(id);
    if (!exists) return res.status(404).json({ error: "Multa no encontrada" });
    if (!isAdmin(req) && !isOwnUser(req, exists.userId)) return forbidden(res);

    const data = { ...parsed.data };
    if (!isAdmin(req)) {
      const fields = Object.keys(data);
      if (fields.some((field) => field !== "status") || data.status !== "PAID") {
        return forbidden(res);
      }
    }

    if (data.status === "PAID" && exists.status !== "PAID") {
      data.paidAt = new Date();
    }
    if (data.status === "PENDING" && exists.status === "PAID") {
      data.paidAt = null;
    }

    const updated = await Fine.findByIdAndUpdate(id, data, {
      returnDocument: "after",
      runValidators: true,
    });

    logger.info("Multa actualizada", { fineId: id, changes: data });
    res.json(await hydrateFine(updated.id));
  } catch (err) {
    logger.error("Error al actualizar multa", { error: err.message });
    res.status(500).json({ error: "Error al actualizar multa" });
  }
}

// DELETE /fines/:id
async function deleteFine(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const deleted = await Fine.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: "Multa no encontrada" });

    logger.info("Multa eliminada", { fineId: id });
    res.json({ status: "ok", message: "Multa eliminada" });
  } catch (err) {
    logger.error("Error al eliminar multa", { error: err.message });
    res.status(500).json({ error: "Error al eliminar multa" });
  }
}

module.exports = { listFines, getFine, createFine, updateFine, deleteFine };
