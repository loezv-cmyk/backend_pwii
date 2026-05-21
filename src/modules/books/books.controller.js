const mongoose = require("mongoose");

const Book = require("../../models/book.model");
const { createBookSchema, updateBookSchema } = require("./books.schemas");
const logger = require("../../utils/logger");

function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

function normalizeBookData(data) {
  return {
    ...data,
    genre: data.genre === "" || data.genre === undefined ? null : data.genre,
    isbn: data.isbn === "" || data.isbn === undefined ? null : data.isbn,
  };
}

// GET /books
async function listBooks(req, res) {
  try {
    const books = await Book.find().sort({ createdAt: 1 });
    res.json(books);
  } catch (err) {
    logger.error("Error al listar libros", { error: err.message });
    res.status(500).json({ error: "Error al consultar libros" });
  }
}

// GET /books/:id
async function getBook(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const book = await Book.findById(id);
    if (!book) return res.status(404).json({ error: "Libro no encontrado" });

    res.json(book);
  } catch (err) {
    logger.error("Error al obtener libro", { error: err.message });
    res.status(500).json({ error: "Error al consultar libro" });
  }
}

// POST /books
async function createBook(req, res) {
  logger.info("Creando libro", { body: req.body });

  try {
    const parsed = createBookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Body invalido", details: parsed.error.issues });
    }

    const book = await Book.create(normalizeBookData(parsed.data));

    logger.info("Libro creado", { bookId: book.id });
    res.status(201).json(book);
  } catch (err) {
    logger.error("Error al crear libro", { error: err.message });
    if (err.code === 11000) {
      return res.status(409).json({ error: "Ya existe un libro con ese ISBN" });
    }
    res.status(500).json({ error: "Error al crear libro" });
  }
}

// PUT /books/:id
async function updateBook(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const parsed = updateBookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Body invalido", details: parsed.error.issues });
    }

    const updated = await Book.findByIdAndUpdate(id, normalizeBookData(parsed.data), {
      returnDocument: "after",
      runValidators: true,
    });

    if (!updated) return res.status(404).json({ error: "Libro no encontrado" });

    res.json(updated);
  } catch (err) {
    logger.error("Error al actualizar libro", { bookId: req.params.id, error: err.message });
    if (err.code === 11000) {
      return res.status(409).json({ error: "Ya existe un libro con ese ISBN" });
    }
    res.status(500).json({ error: "Error al actualizar libro" });
  }
}

// DELETE /books/:id
async function deleteBook(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const deleted = await Book.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: "Libro no encontrado" });

    logger.info("Libro eliminado", { bookId: id });
    res.json({ status: "ok", message: "Libro eliminado" });
  } catch (err) {
    logger.error("Error al eliminar libro", { bookId: req.params.id, error: err.message });
    res.status(500).json({ error: "Error al eliminar libro" });
  }
}

module.exports = { listBooks, getBook, createBook, updateBook, deleteBook };
