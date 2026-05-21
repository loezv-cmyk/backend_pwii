const mongoose = require("mongoose");

const Book = require("../../models/book.model");
const Fine = require("../../models/fine.model");
const Hold = require("../../models/hold.model");
const Loan = require("../../models/loan.model");
const User = require("../../models/user.model");
const logger = require("../../utils/logger");

function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

function toId(value) {
  return value ? String(value) : null;
}

function parseLimit(value, defaultValue = 10, maxValue = 50) {
  if (value === undefined) return defaultValue;

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) return null;

  return Math.min(limit, maxValue);
}

function mapLoanItem(item) {
  const book = item.bookId;

  return {
    bookId: book?.id ?? toId(item.bookId),
    qty: item.qty,
    book,
  };
}

function mapLoan(loan) {
  const data = loan.toJSON ? loan.toJSON() : loan;

  data.user = data.userId;
  data.userId = data.user?.id ?? toId(loan.userId);
  data.loanitem = data.loanitem.map(mapLoanItem);

  return data;
}

// GET /reports/most-borrowed-books?limit=10
async function mostBorrowedBooks(req, res) {
  try {
    const limit = parseLimit(req.query.limit);
    if (!limit) return res.status(400).json({ error: "limit invalido" });

    const grouped = await Loan.aggregate([
      { $unwind: "$loanitem" },
      {
        $group: {
          _id: "$loanitem.bookId",
          totalLoans: { $sum: "$loanitem.qty" },
        },
      },
      { $sort: { totalLoans: -1 } },
      { $limit: limit },
    ]);

    const bookIds = grouped.map((item) => item._id);
    const books = await Book.find({ _id: { $in: bookIds } });

    const result = grouped.map((item) => {
      const book = books.find((candidate) => toId(candidate._id) === toId(item._id));

      return {
        bookId: toId(item._id),
        title: book?.title ?? "(eliminado)",
        author: book?.author ?? "-",
        totalLoans: item.totalLoans ?? 0,
      };
    });

    logger.info("Reporte: libros mas prestados generado", { count: result.length });
    res.json({ report: "Libros mas prestados", data: result });
  } catch (err) {
    logger.error("Error en reporte mostBorrowedBooks", { error: err.message });
    res.status(500).json({ error: "Error al generar reporte" });
  }
}

// GET /reports/users-with-most-fines
async function usersWithMostFines(req, res) {
  try {
    const limit = parseLimit(req.query.limit);
    if (!limit) return res.status(400).json({ error: "limit invalido" });

    const grouped = await Fine.aggregate([
      {
        $group: {
          _id: "$userId",
          totalFines: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
      { $sort: { totalFines: -1 } },
      { $limit: limit },
    ]);

    const userIds = grouped.map((item) => item._id);
    const users = await User.find({ _id: { $in: userIds } }).select("name email");

    const result = grouped.map((item) => {
      const user = users.find((candidate) => toId(candidate._id) === toId(item._id));

      return {
        userId: toId(item._id),
        name: user?.name ?? "(eliminado)",
        email: user?.email ?? "-",
        totalFines: item.totalFines,
        totalAmount: item.totalAmount ?? 0,
      };
    });

    logger.info("Reporte: usuarios con mas multas generado", { count: result.length });
    res.json({ report: "Usuarios con mas multas", data: result });
  } catch (err) {
    logger.error("Error en reporte usersWithMostFines", { error: err.message });
    res.status(500).json({ error: "Error al generar reporte" });
  }
}

// GET /reports/overdue-loans
async function overdueLoans(req, res) {
  try {
    const now = new Date();

    const loans = await Loan.find({
      status: "ACTIVE",
      dueDate: { $lt: now },
    })
      .populate("userId", "name email")
      .populate("loanitem.bookId", "title author")
      .sort({ dueDate: 1 });

    const result = loans.map((loan) => {
      const data = mapLoan(loan);

      return {
        loanId: data.id,
        user: data.user,
        loanDate: data.loanDate,
        dueDate: data.dueDate,
        daysOverdue: data.dueDate
          ? Math.floor((now - new Date(data.dueDate)) / (1000 * 60 * 60 * 24))
          : 0,
        books: data.loanitem.map((item) => ({
          bookId: item.bookId,
          title: item.book?.title,
          qty: item.qty,
        })),
      };
    });

    logger.info("Reporte: prestamos vencidos generado", { count: result.length });
    res.json({ report: "Prestamos vencidos", count: result.length, data: result });
  } catch (err) {
    logger.error("Error en reporte overdueLoans", { error: err.message });
    res.status(500).json({ error: "Error al generar reporte" });
  }
}

// GET /reports/dashboard
async function dashboardSummary(req, res) {
  try {
    const now = new Date();

    const [
      totalUsers,
      totalAdmins,
      totalBooks,
      totalStock,
      activeLoans,
      returnedLoans,
      overdueLoansCount,
      pendingFines,
      paidFines,
      pendingFinesAmount,
      activeHolds,
    ] = await Promise.all([
      User.countDocuments({ role: "USER" }),
      User.countDocuments({ role: "ADMIN" }),
      Book.countDocuments(),
      Book.aggregate([{ $group: { _id: null, total: { $sum: "$stock" } } }]),
      Loan.countDocuments({ status: "ACTIVE" }),
      Loan.countDocuments({ status: "RETURNED" }),
      Loan.countDocuments({ status: "ACTIVE", dueDate: { $lt: now } }),
      Fine.countDocuments({ status: "PENDING" }),
      Fine.countDocuments({ status: "PAID" }),
      Fine.aggregate([
        { $match: { status: "PENDING" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Hold.countDocuments({ status: "WAITING" }),
    ]);

    const result = {
      usuarios: { miembros: totalUsers, administradores: totalAdmins },
      libros: { titulos: totalBooks, copiasTotales: totalStock[0]?.total ?? 0 },
      prestamos: {
        activos: activeLoans,
        devueltos: returnedLoans,
        vencidos: overdueLoansCount,
      },
      multas: {
        pendientes: pendingFines,
        pagadas: paidFines,
        montoPendiente: pendingFinesAmount[0]?.total ?? 0,
      },
      listaEspera: { activas: activeHolds },
      generadoEn: now,
    };

    logger.info("Reporte: dashboard generado");
    res.json({ report: "Dashboard general", data: result });
  } catch (err) {
    logger.error("Error en reporte dashboard", { error: err.message });
    res.status(500).json({ error: "Error al generar reporte" });
  }
}

// GET /reports/user-activity/:userId
async function userActivity(req, res) {
  try {
    const { userId } = req.params;
    if (!isValidId(userId)) return res.status(400).json({ error: "userId invalido" });

    const user = await User.findById(userId).select("name email role createdAt");
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    const [loans, fines, holds] = await Promise.all([
      Loan.find({ userId })
        .populate("userId", "name email")
        .populate("loanitem.bookId")
        .sort({ loanDate: -1 }),
      Fine.find({ userId }).sort({ createdAt: -1 }),
      Hold.find({ userId })
        .populate("bookId", "title")
        .sort({ createdAt: -1 }),
    ]);

    const mappedLoans = loans.map(mapLoan);
    const mappedHolds = holds.map((hold) => {
      const data = hold.toJSON();
      data.book = data.bookId;
      data.bookId = data.book?.id ?? toId(hold.bookId);
      return data;
    });

    const result = {
      user,
      resumen: {
        totalPrestamos: loans.length,
        prestamosActivos: loans.filter((loan) => loan.status === "ACTIVE").length,
        totalMultas: fines.length,
        multasPendientes: fines.filter((fine) => fine.status === "PENDING").length,
        montoPendiente: fines
          .filter((fine) => fine.status === "PENDING")
          .reduce((acc, fine) => acc + fine.amount, 0),
        listasEsperaActivas: holds.filter((hold) => hold.status === "WAITING").length,
      },
      prestamos: mappedLoans,
      multas: fines,
      listasEspera: mappedHolds,
    };

    logger.info("Reporte: actividad de usuario generado", { userId });
    res.json({ report: "Actividad del usuario", data: result });
  } catch (err) {
    logger.error("Error en reporte userActivity", { error: err.message });
    res.status(500).json({ error: "Error al generar reporte" });
  }
}

module.exports = {
  mostBorrowedBooks,
  usersWithMostFines,
  overdueLoans,
  dashboardSummary,
  userActivity,
};
