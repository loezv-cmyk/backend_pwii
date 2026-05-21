require("dotenv").config();

const { z } = require("zod");

const envSchema = z.object({
  MONGODB_URI: z.string().trim().min(1, "MONGODB_URI es requerida"),
  JWT_SECRET: z.string().trim().min(16, "JWT_SECRET debe tener al menos 16 caracteres"),
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_ORIGIN: z.string().trim().optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Configuracion de entorno invalida: ${messages}`);
  }

  return parsed.data;
}

module.exports = loadEnv();
