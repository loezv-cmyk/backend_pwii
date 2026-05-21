const mongoose = require("mongoose");

const Book = require("../../models/book.model");
const Fine = require("../../models/fine.model");
const Loan = require("../../models/loan.model");
const User = require("../../models/user.model");
const logger = require("../../utils/logger");
const { createLoanSchema } = require("./loans.schemas");

// Duracion por defecto de un prestamo en dias.
const LOAN_DAYS = 14;
const LOAN_STATUSES = new Set(["ACTIVE", "RETURNED", "OVERDUE"]);

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

function aggregateItems(items) {
  const grouped = new Map();

  for (const item of items) {
    const key = String(item.bookId);
    grouped.set(key, (grouped.get(key) || 0) + item.qty);
  }

  return [...grouped.entries()].map(([bookId, qty]) => ({ bookId, qty }));
}

function forbidden(res) {
  return res.status(403).json({ error: "No tienes permisos para operar este prestamo" });
}

async function hydrateLoan(loanOrId, includeFines = false) {
  const query = Loan.findById(loanOrId)
    .populate("userId", "name email")
    .populate("loanitem.bookId");

  const loan = await query;
  if (!loan) return null;

  const data = loan.toJSON();

  data.user = data.userId;
  data.userId = data.user?.id ?? String(loan.userId);
  data.loanitem = data.loanitem.map((item) => ({
    ...item,
    book: item.bookId,
    bookId: item.bookId?.id ?? String(item.bookId),
  }));

  if (includeFines) {
    data.fine = await Fine.find({ loanId: loan.id }).sort({ createdAt: -1 });
  }

  return data;
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

// GET /loans  (con filtros opcionales: ?userId=X, ?status=ACTIVE)
async function listLoans(req, res) {
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
      if (!LOAN_STATUSES.has(req.query.status)) {
        return res.status(400).json({ error: "status invalido" });
      }
      where.status = req.query.status;
    }

    const loans = await Loan.find(where).sort({ createdAt: -1 });
    const result = await Promise.all(loans.map((loan) => hydrateLoan(loan.id)));

    res.json(result);
  } catch (err) {
    logger.error("Error al listar prestamos", { error: err.message });
    res.status(500).json({ error: "Error al consultar prestamos" });
  }
}

// GET /loans/:id
async function getLoan(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const loan = await hydrateLoan(id);
    if (!loan) return res.status(404).json({ error: "Prestamo no encontrado" });
    if (!isAdmin(req) && !isOwnUser(req, loan.userId)) return forbidden(res);

    res.json(loan);
  } catch (err) {
    logger.error("Error al obtener prestamo", { error: err.message });
    res.status(500).json({ error: "Error al consultar prestamo" });
  }
}

// POST /loans  (crea loan + loanitems + descuenta stock + calcula dueDate)
async function createLoan(req, res) {
  logger.info("Creando prestamo", { body: req.body });

  try {
    const parsed = createLoanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Body invalido", details: parsed.error.issues });
    }

    const { userId, items } = parsed.data;
    if (!isAdmin(req) && !isOwnUser(req, userId)) return forbidden(res);

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    const loanItems = aggregateItems(items);
    const bookIds = loanItems.map((item) => item.bookId);
    const uniqueBookIds = [...new Set(bookIds)];
    const books = await Book.find({ _id: { $in: uniqueBookIds } });

    if (books.length !== uniqueBookIds.length) {
      return res.status(400).json({ error: "Uno o mas libros no existen" });
    }

    for (const item of loanItems) {
      const book = books.find((candidate) => sameId(candidate.id, item.bookId));
      if (!book || book.stock < item.qty) {
        return res.status(409).json({ error: `Stock insuficiente para bookId=${item.bookId}` });
      }
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + LOAN_DAYS);

    await decrementStock(loanItems);

    try {
      const loan = await Loan.create({
        userId,
        status: "ACTIVE",
        dueDate,
        loanitem: loanItems,
      });

      const result = await hydrateLoan(loan.id);
      logger.info("Prestamo creado", { loanId: result.id, userId });

      res.status(201).json(result);
    } catch (err) {
      await restoreStock(loanItems);
      throw err;
    }
  } catch (err) {
    logger.error("Error al crear prestamo", { error: err.message });
    res.status(err.status || 500).json({ error: err.status ? err.message : "Error al crear prestamo" });
  }
}

// PUT /loans/:id/return  (marca devuelto + regresa stock + crea multa si hay atraso)
async function returnLoan(req, res) {
  logger.info("Devolviendo prestamo", { loanId: req.params.id });

  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const loan = await Loan.findById(id);
    if (!loan) return res.status(404).json({ error: "Prestamo no encontrado" });
    if (!isAdmin(req) && !isOwnUser(req, loan.userId)) return forbidden(res);
    if (loan.status === "RETURNED") {
      return res.status(409).json({ error: "El prestamo ya esta devuelto" });
    }

    const now = new Date();
    let fineCreated = null;

    if (loan.dueDate && now > loan.dueDate) {
      const daysLate = Math.ceil((now - loan.dueDate) / (1000 * 60 * 60 * 24));
      fineCreated = {
        userId: loan.userId,
        loanId: loan.id,
        amount: daysLate * 10,
        reason: `Devolucion con ${daysLate} dia(s) de atraso`,
        status: "PENDING",
      };
    }

    await restoreStock(loan.loanitem);

    loan.status = "RETURNED";
    loan.returnDate = now;
    await loan.save();

    if (fineCreated) {
      await Fine.create(fineCreated);
      logger.warn("Prestamo devuelto con atraso - multa generada", {
        loanId: id,
        amount: fineCreated.amount,
      });
    } else {
      logger.info("Prestamo devuelto a tiempo", { loanId: id });
    }

    const updated = await hydrateLoan(id, true);
    res.json(updated);
  } catch (err) {
    logger.error("Error al devolver prestamo", { error: err.message });
    res.status(500).json({ error: "Error al devolver prestamo" });
  }
}

// DELETE /loans/:id (cancela prestamo y regresa stock si estaba activo)
async function deleteLoan(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const loan = await Loan.findById(id);
    if (!loan) return res.status(404).json({ error: "Prestamo no encontrado" });

    if (loan.status === "ACTIVE") {
      await restoreStock(loan.loanitem);
    }

    await Fine.deleteMany({ loanId: loan.id });
    await Loan.findByIdAndDelete(id);

    logger.info("Prestamo eliminado", { loanId: id });
    res.json({ status: "ok", message: "Prestamo eliminado" });
  } catch (err) {
    logger.error("Error al eliminar prestamo", { error: err.message });
    res.status(500).json({ error: "Error al eliminar prestamo" });
  }
}

module.exports = { listLoans, getLoan, createLoan, returnLoan, deleteLoan };
