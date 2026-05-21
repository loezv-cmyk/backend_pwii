const express = require("express");
const { adminRequired } = require("../middlewares/auth.middleware");

const {
  listBooks,
  getBook,
  createBook,
  updateBook,
  deleteBook,
} = require("../modules/books/books.controller");

const router = express.Router();

router.get("/", listBooks);
router.get("/:id", getBook);
router.post("/", adminRequired, createBook);
router.put("/:id", adminRequired, updateBook);
router.delete("/:id", adminRequired, deleteBook);

module.exports = router;
