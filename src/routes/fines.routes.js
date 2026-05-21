const express = require("express");
const { adminRequired } = require("../middlewares/auth.middleware");
const router = express.Router();

const {
  listFines,
  getFine,
  createFine,
  updateFine,
  deleteFine,
} = require("../modules/fines/fines.controller");

router.get("/", listFines);
router.get("/:id", getFine);
router.post("/", adminRequired, createFine);
router.put("/:id", updateFine);
router.delete("/:id", adminRequired, deleteFine);

module.exports = router;
