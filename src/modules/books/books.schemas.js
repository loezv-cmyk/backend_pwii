const { z } = require("zod");

const createBookSchema = z.object({
  title: z.string().min(1, "title es requerido"),
  author: z.string().min(1, "author es requerido"),
  genre: z.string().min(1).optional(),
  isbn: z.string().min(1).optional(),
  stock: z.number().int().nonnegative().optional(),
});

const updateBookSchema = z.object({
  title: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
  genre: z.string().min(1).nullable().optional(),
  isbn: z.string().min(1).nullable().optional(),
  stock: z.number().int().nonnegative().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "Envia al menos un campo para actualizar",
});

module.exports = { createBookSchema, updateBookSchema };
