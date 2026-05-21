const { z } = require("zod");

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "ObjectId invalido");

const createFineSchema = z.object({
  userId: objectIdSchema,
  loanId: objectIdSchema,
  amount: z.number().positive(),
  reason: z.string().min(1, "reason es requerido"),
});

const updateFineSchema = z.object({
  amount: z.number().positive().optional(),
  reason: z.string().min(1).optional(),
  status: z.enum(["PENDING", "PAID"]).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "Envia al menos un campo para actualizar",
});

module.exports = { createFineSchema, updateFineSchema, objectIdSchema };
