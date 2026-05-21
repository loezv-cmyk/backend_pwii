const mongoose = require("mongoose");

const Book = require("../../models/book.model");
const Hold = require("../../models/hold.model");
const User = require("../../models/user.model");
const logger = require("../../utils/logger");
const { createHoldSchema, updateHoldSchema } = require("./holds.schemas");
const HOLD_STATUSES = new Set(["WAITING", "NOTIFIED", "CANCELLED", "FULFILLED"]);

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
  return res.status(403).json({ error: "No tienes permisos para operar esta lista de espera" });
}

async function hydrateHold(holdOrId) {
  const hold = await Hold.findById(holdOrId)
    .populate("userId", "name email")
    .populate("bookId", "title author genre");

  if (!hold) return null;

  const data = hold.toJSON();
  data.user = data.userId;
  data.book = data.bookId;
  data.userId = data.user?.id ?? String(hold.userId);
  data.bookId = data.book?.id ?? String(hold.bookId);

  return data;
}

async function reorderWaitingPositions(bookId, removedPosition) {
  await Hold.updateMany(
    {
      bookId,
      status: "WAITING",
      position: { $gt: removedPosition },
    },
    { $inc: { position: -1 } }
  );
}

async function nextWaitingPosition(bookId) {
  const last = await Hold.findOne({ bookId, status: "WAITING" }).sort({ position: -1 });
  return last ? last.position + 1 : 1;
}

// GET /holds  (con filtros opcionales: ?userId=X, ?bookId=X, ?status=X)
async function listHolds(req, res) {
  try {
    const where = {};

    if (req.query.userId) {
      if (!isValidId(req.query.userId)) return res.status(400).json({ error: "userId invalido" });
      if (!isAdmin(req) && !isOwnUser(req, req.query.userId)) return forbidden(res);
      where.userId = req.query.userId;
    } else if (!isAdmin(req)) {
      where.userId = req.user.id;
    }

    if (req.query.bookId) {
      if (!isValidId(req.query.bookId)) return res.status(400).json({ error: "bookId invalido" });
      where.bookId = req.query.bookId;
    }

    if (req.query.status) {
      if (!HOLD_STATUSES.has(req.query.status)) {
        return res.status(400).json({ error: "status invalido" });
      }
      where.status = req.query.status;
    }

    const holds = await Hold.find(where).sort({ bookId: 1, position: 1 });
    const result = await Promise.all(holds.map((hold) => hydrateHold(hold.id)));

    res.json(result);
  } catch (err) {
    logger.error("Error al listar holds", { error: err.message });
    res.status(500).json({ error: "Error al consultar lista de espera" });
  }
}

// GET /holds/:id
async function getHold(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const hold = await hydrateHold(id);
    if (!hold) return res.status(404).json({ error: "Hold no encontrado" });
    if (!isAdmin(req) && !isOwnUser(req, hold.userId)) return forbidden(res);

    res.json(hold);
  } catch (err) {
    logger.error("Error al obtener hold", { error: err.message });
    res.status(500).json({ error: "Error al consultar hold" });
  }
}

// POST /holds
async function createHold(req, res) {
  logger.info("Creando hold", { body: req.body });

  try {
    const parsed = createHoldSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Body invalido", details: parsed.error.issues });
    }

    const { userId, bookId } = parsed.data;
    if (!isAdmin(req) && !isOwnUser(req, userId)) return forbidden(res);

    const [user, book] = await Promise.all([
      User.findById(userId),
      Book.findById(bookId),
    ]);

    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    if (!book) return res.status(404).json({ error: "Libro no encontrado" });
    if (book.stock > 0) {
      return res.status(409).json({ error: "El libro tiene copias disponibles; solicita un prestamo" });
    }

    const existing = await Hold.findOne({
      userId,
      bookId,
      status: { $in: ["WAITING", "NOTIFIED"] },
    });

    if (existing) {
      return res.status(409).json({ error: "Ya estas en la lista de espera de este libro" });
    }

    const position = await nextWaitingPosition(bookId);

    const hold = await Hold.create({ userId, bookId, position, status: "WAITING" });
    const result = await hydrateHold(hold.id);

    logger.info("Hold creado", { holdId: result.id, userId, bookId, position });
    res.status(201).json(result);
  } catch (err) {
    logger.error("Error al crear hold", { error: err.message });
    res.status(500).json({ error: "Error al crear hold" });
  }
}

// PUT /holds/:id
async function updateHold(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const parsed = updateHoldSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Body invalido", details: parsed.error.issues });
    }

    const current = await Hold.findById(id);
    if (!current) return res.status(404).json({ error: "Hold no encontrado" });

    const changes = { ...parsed.data };
    if (changes.status && changes.status !== "WAITING" && current.status === "WAITING") {
      await reorderWaitingPositions(current.bookId, current.position);
    }

    if (changes.status === "WAITING" && current.status !== "WAITING" && !changes.position) {
      changes.position = await nextWaitingPosition(current.bookId);
    }

    const updated = await Hold.findByIdAndUpdate(id, changes, {
      returnDocument: "after",
      runValidators: true,
    });

    logger.info("Hold actualizado", { holdId: id, changes });
    res.json(await hydrateHold(id));
  } catch (err) {
    logger.error("Error al actualizar hold", { error: err.message });
    res.status(500).json({ error: "Error al actualizar hold" });
  }
}

// DELETE /holds/:id  (cuando eliminas, reacomoda posiciones de la fila)
async function deleteHold(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const hold = await Hold.findById(id);
    if (!hold) return res.status(404).json({ error: "Hold no encontrado" });
    if (!isAdmin(req) && !isOwnUser(req, hold.userId)) return forbidden(res);

    await Hold.findByIdAndDelete(id);

    if (hold.status === "WAITING") {
      await reorderWaitingPositions(hold.bookId, hold.position);
    }

    logger.info("Hold eliminado y cola reordenada", { holdId: id });
    res.json({ status: "ok", message: "Lista de espera cancelada" });
  } catch (err) {
    logger.error("Error al eliminar hold", { error: err.message });
    res.status(500).json({ error: "Error al eliminar hold" });
  }
}

module.exports = { listHolds, getHold, createHold, updateHold, deleteHold };
