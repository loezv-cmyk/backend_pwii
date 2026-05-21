const express = require("express");
const { adminRequired } = require("../middlewares/auth.middleware");
const router = express.Router();

const {
  listLoans,
  getLoan,
  createLoan,
  returnLoan,
  deleteLoan,
} = require("../modules/loans/loans.controller");
const {
  listLoanRequests,
  getLoanRequest,
  createLoanRequest,
  approveLoanRequest,
  rejectLoanRequest,
  cancelLoanRequest,
} = require("../modules/loans/loan-requests.controller");

router.get("/", listLoans);
router.get("/requests", listLoanRequests);
router.get("/requests/:id", getLoanRequest);
router.post("/requests", createLoanRequest);
router.put("/requests/:id/approve", adminRequired, approveLoanRequest);
router.put("/requests/:id/reject", adminRequired, rejectLoanRequest);
router.delete("/requests/:id", cancelLoanRequest);
router.get("/:id", getLoan);
router.post("/", createLoan);
router.put("/:id/return", returnLoan);
router.delete("/:id", adminRequired, deleteLoan);

module.exports = router;
