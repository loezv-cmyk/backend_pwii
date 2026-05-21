const { z } = require("zod");

const roleSchema = z.enum(["USER", "ADMIN"]);

const createUserSchema = z.object({
  name: z.string().min(1, "name es requerido"),
  email: z.string().email("email invalido"),
  password: z.string().min(6, "password minimo 6 caracteres"),
  role: roleSchema.optional(), // "USER" por default
  phone: z.string().min(1, "phone no puede estar vacio").optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: roleSchema.optional(),
  phone: z.string().min(1, "phone no puede estar vacio").optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "Envia al menos un campo para actualizar",
});

module.exports = { createUserSchema, updateUserSchema };
