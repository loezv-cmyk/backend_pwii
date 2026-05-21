const { z } = require("zod");

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "ObjectId invalido");

const createHoldSchema = z.object({
  userId: objectIdSchema,
  bookId: objectIdSchema,
});

const updateHoldSchema = z.object({
  status: z.enum(["WAITING", "NOTIFIED", "CANCELLED", "FULFILLED"]).optional(),
  position: z.number().int().positive().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "Envia al menos un campo para actualizar",
});

module.exports = { createHoldSchema, updateHoldSchema, objectIdSchema };
