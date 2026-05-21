const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { z } = require("zod");

const User = require("../models/user.model");
const env = require("../config/env");
const { authRequired } = require("../middlewares/auth.middleware");

const router = express.Router();
const JWT_SECRET = env.JWT_SECRET;

const loginSchema = z.object({
  email: z.string().email("Email invalido"),
  password: z.string().min(1, "Password requerido"),
});

const registerSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  email: z.string().email("Email invalido"),
  password: z.string().min(6, "Password minimo 6 caracteres"),
  phone: z.string().min(1, "Telefono requerido").optional(),
});

function sanitizeUser(user) {
  const data = user.toJSON();
  delete data.password;
  return data;
}

router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Datos invalidos", details: parsed.error.issues });
    }

    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const user = await User.findOne({ email: normalizedEmail }).select("+password");
    if (!user) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    const safeUser = sanitizeUser(user);

    const token = jwt.sign(
      { id: safeUser.id, email: safeUser.email, role: safeUser.role },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      user: { id: safeUser.id, name: safeUser.name, email: safeUser.email, role: safeUser.role },
    });
  } catch (err) {
    console.error("Error al iniciar sesion:", err?.stack || err?.message || err);
    res.status(500).json({ error: "Error al iniciar sesion" });
  }
});

router.post("/register", async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Datos invalidos", details: parsed.error.issues });
    }

    const { name, email, password, phone } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const exists = await User.exists({ email: normalizedEmail });
    if (exists) {
      return res.status(409).json({ error: "Ese email ya esta registrado" });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email: normalizedEmail,
      password: hash,
      role: "USER",
      phone: phone ?? null,
    });

    res.status(201).json({
      message: "Usuario registrado correctamente",
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("Error al registrar usuario:", err?.stack || err?.message || err);
    if (err.code === 11000) {
      return res.status(409).json({ error: "Ese email ya esta registrado" });
    }
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});

router.get("/me", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error("Error al consultar sesion:", err?.stack || err?.message || err);
    res.status(500).json({ error: "Error al consultar sesion" });
  }
});

module.exports = router;
