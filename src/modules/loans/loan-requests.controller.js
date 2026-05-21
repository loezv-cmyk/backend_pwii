const mongoose = require("mongoose");

const Book = require("../../models/book.model");
const Loan = require("../../models/loan.model");
const LoanRequest = require("../../models/loan-request.model");
const User = require("../../models/user.model");
const logger = require("../../utils/logger");
const { createLoanRequestSchema, rejectLoanRequestSchema } = require("./loans.schemas");

const LOAN_DAYS = 14;
const REQUEST_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);

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
  return res.status(403).json({ error: "No tienes permisos para operar esta solicitud" });
}

function aggregateItems(items) {
  const grouped = new Map();

  for (const item of items) {
    const key = String(item.bookId);
    grouped.set(key, (grouped.get(key) || 0) + item.qty);
  }

  return [...grouped.entries()].map(([bookId, qty]) => ({ bookId, qty }));
}

async function restoreStock(items) {
  for (const item of items) {
    await Book.findByIdAndUpdate(item.bookId, { $inc: { stock: item.qty } });
  }
}

async function decrementStock(items) {
  const decremented = [];

  try {
    for (const item of items) {
      const updated = await Book.findOneAndUpdate(
        { _id: item.bookId, stock: { $gte: item.qty } },
        { $inc: { stock: -item.qty } },
        { returnDocument: "after" }
      );

      if (!updated) {
        const err = new Error(`Stock insuficiente para bookId=${item.bookId}`);
        err.status = 409;
        throw err;
      }

      decremented.push(item);
    }
  } catch (err) {
    await restoreStock(decremented);
    throw err;
  }
}

async function hydrateRequest(requestOrId) {
  const request = await LoanRequest.findById(requestOrId)
    .populate("userId", "name email")
    .populate("items.bookId", "title author genre isbn stock")
    .populate("loanId")
    .populate("reviewedBy", "name email");

  if (!request) return null;

  const data = request.toJSON();
  data.user = data.userId;
  data.userId = data.user?.id ?? String(request.userId);
  data.loan = data.loanId;
  data.loanId = data.loan?.id ?? (request.loanId ? String(request.loanId) : null);
  data.reviewer = data.reviewedBy;
  data.reviewedBy = data.reviewer?.id ?? (request.reviewedBy ? String(request.reviewedBy) : null);
  data.items = data.items.map((item) => ({
    ...item,
    book: item.bookId,
    bookId: item.bookId?.id ?? String(item.bookId),
  }));

  return data;
}

async function validateRequestItems(items) {
  const loanItems = aggregateItems(items);
  const bookIds = loanItems.map((item) => item.bookId);
  const uniqueBookIds = [...new Set(bookIds)];
  const books = await Book.find({ _id: { $in: uniqueBookIds } });

  if (books.length !== uniqueBookIds.length) {
    const err = new Error("Uno o mas libros no existen");
    err.status = 400;
    throw err;
  }

  return { loanItems, books };
}

// GET /loans/requests
async function listLoanRequests(req, res) {
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
      if (!REQUEST_STATUSES.has(req.query.status)) {
        return res.status(400).json({ error: "status invalido" });
      }
      where.status = req.query.status;
    }

    const requests = await LoanRequest.find(where).sort({ createdAt: -1 });
    const result = await Promise.all(requests.map((request) => hydrateRequest(request.id)));

    res.json(result);
  } catch (err) {
    logger.error("Error al listar solicitudes de prestamo", { error: err.message });
    res.status(500).json({ error: "Error al consultar solicitudes de prestamo" });
  }
}

// GET /loans/requests/:id
async function getLoanRequest(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const request = await hydrateRequest(id);
    if (!request) return res.status(404).json({ error: "Solicitud no encontrada" });
    if (!isAdmin(req) && !isOwnUser(req, request.userId)) return forbidden(res);

    res.json(request);
  } catch (err) {
    logger.error("Error al obtener solicitud de prestamo", { error: err.message });
    res.status(500).json({ error: "Error al consultar solicitud de prestamo" });
  }
}

// POST /loans/requests
async function createLoanRequest(req, res) {
  logger.info("Creando solicitud de prestamo", { body: req.body });

  try {
    const parsed = createLoanRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Body invalido", details: parsed.error.issues });
    }

    const { userId, items } = parsed.data;
    if (!isAdmin(req) && !isOwnUser(req, userId)) return forbidden(res);

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    const { loanItems } = await validateRequestItems(items);

    const request = await LoanRequest.create({
      userId,
      items: loanItems,
      status: "PENDING",
    });

    const result = await hydrateRequest(request.id);
    logger.info("Solicitud de prestamo creada", { requestId: result.id, userId });

    res.status(201).json(result);
  } catch (err) {
    logger.error("Error al crear solicitud de prestamo", { error: err.message });
    res.status(err.status || 500).json({ error: err.status ? err.message : "Error al crear solicitud de prestamo" });
  }
}

// PUT /loans/requests/:id/approve
async function approveLoanRequest(req, res) {
  logger.info("Aprobando solicitud de prestamo", { requestId: req.params.id, adminId: req.user?.id });

  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const request = await LoanRequest.findById(id);
    if (!request) return res.status(404).json({ error: "Solicitud no encontrada" });
    if (request.status !== "PENDING") {
      return res.status(409).json({ error: "La solicitud ya fue procesada" });
    }

    const loanItems = aggregateItems(request.items);
    await decrementStock(loanItems);

    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + LOAN_DAYS);

      const loan = await Loan.create({
        userId: request.userId,
        status: "ACTIVE",
        dueDate,
        loanitem: loanItems,
      });

      request.status = "APPROVED";
      request.loanId = loan.id;
      request.reviewedBy = req.user.id;
      request.reviewedAt = new Date();
      request.rejectionReason = null;
      await request.save();

      const result = await hydrateRequest(request.id);
      logger.info("Solicitud de prestamo aprobada", { requestId: id, loanId: loan.id });

      res.json(result);
    } catch (err) {
      await restoreStock(loanItems);
      throw err;
    }
  } catch (err) {
    logger.error("Error al aprobar solicitud de prestamo", { error: err.message });
    res.status(err.status || 500).json({ error: err.status ? err.message : "Error al aprobar solicitud de prestamo" });
  }
}

// PUT /loans/requests/:id/reject
async function rejectLoanRequest(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const parsed = rejectLoanRequestSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Body invalido", details: parsed.error.issues });
    }

    const request = await LoanRequest.findById(id);
    if (!request) return res.status(404).json({ error: "Solicitud no encontrada" });
    if (request.status !== "PENDING") {
      return res.status(409).json({ error: "La solicitud ya fue procesada" });
    }

    request.status = "REJECTED";
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    request.rejectionReason = parsed.data.reason ?? null;
    await request.save();

    const result = await hydrateRequest(request.id);
    logger.info("Solicitud de prestamo rechazada", { requestId: id, adminId: req.user.id });

    res.json(result);
  } catch (err) {
    logger.error("Error al rechazar solicitud de prestamo", { error: err.message });
    res.status(500).json({ error: "Error al rechazar solicitud de prestamo" });
  }
}

// DELETE /loans/requests/:id
async function cancelLoanRequest(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const request = await LoanRequest.findById(id);
    if (!request) return res.status(404).json({ error: "Solicitud no encontrada" });
    if (!isAdmin(req) && !isOwnUser(req, request.userId)) return forbidden(res);
    if (request.status !== "PENDING") {
      return res.status(409).json({ error: "Solo se pueden cancelar solicitudes pendientes" });
    }

    request.status = "CANCELLED";
    request.reviewedBy = isAdmin(req) ? req.user.id : null;
    request.reviewedAt = new Date();
    await request.save();

    logger.info("Solicitud de prestamo cancelada", { requestId: id, userId: request.userId });
    res.json(await hydrateRequest(id));
  } catch (err) {
    logger.error("Error al cancelar solicitud de prestamo", { error: err.message });
    res.status(500).json({ error: "Error al cancelar solicitud de prestamo" });
  }
}

module.exports = {
  listLoanRequests,
  getLoanRequest,
  createLoanRequest,
  approveLoanRequest,
  rejectLoanRequest,
  cancelLoanRequest,
};
