const { z } = require("zod");

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "ObjectId invalido");

const createLoanSchema = z.object({
  userId: objectIdSchema,
  items: z.array(
    z.object({
      bookId: objectIdSchema,
      qty: z.number().int().positive().default(1),
    })
  ).min(1, "Debes enviar al menos 1 libro"),
});

const createLoanRequestSchema = createLoanSchema;

const rejectLoanRequestSchema = z.object({
  reason: z.string().min(1, "reason es requerido").optional(),
});

module.exports = { createLoanSchema, createLoanRequestSchema, rejectLoanRequestSchema, objectIdSchema };
