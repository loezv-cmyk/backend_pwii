const express = require("express");
const { adminRequired } = require("../middlewares/auth.middleware");
const router = express.Router();

const {
  mostBorrowedBooks,
  usersWithMostFines,
  overdueLoans,
  dashboardSummary,
  userActivity,
} = require("../modules/reports/reports.controller");

router.use(adminRequired);

router.get("/most-borrowed-books", mostBorrowedBooks);
router.get("/users-with-most-fines", usersWithMostFines);
router.get("/overdue-loans", overdueLoans);
router.get("/dashboard", dashboardSummary);
router.get("/user-activity/:userId", userActivity);

module.exports = router;
