const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const User = require("../../models/user.model");
const { createUserSchema, updateUserSchema } = require("./users.schemas");

function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

function sanitizeUser(user) {
  if (!user) return null;

  const data = user.toJSON();
  delete data.password;
  return data;
}

// GET /users
async function listUsers(req, res) {
  try {
    const users = await User.find().sort({ createdAt: 1 });
    res.json(users.map(sanitizeUser));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al consultar usuarios" });
  }
}

// GET /users/:id
async function getUser(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    res.json(sanitizeUser(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al consultar usuario" });
  }
}

// POST /users
async function createUser(req, res) {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Body invalido", details: parsed.error.issues });
    }

    const { name, email, password, role, phone } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const exists = await User.exists({ email: normalizedEmail });
    if (exists) {
      return res.status(409).json({ error: "Ese email ya esta registrado" });
    }

    const hash = await bcrypt.hash(password, 10);

    const created = await User.create({
      name,
      email: normalizedEmail,
      password: hash,
      role: role ?? "USER",
      phone: phone ?? null,
    });

    res.status(201).json(sanitizeUser(created));
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(409).json({ error: "Ese email ya esta registrado" });
    }
    res.status(500).json({ error: "Error al crear usuario" });
  }
}

// PUT /users/:id
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Body invalido", details: parsed.error.issues });
    }

    const exists = await User.findById(id);
    if (!exists) return res.status(404).json({ error: "Usuario no encontrado" });

    const data = { ...parsed.data };

    if (data.email) {
      data.email = data.email.toLowerCase();
    }

    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }

    const updated = await User.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    res.json(sanitizeUser(updated));
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(409).json({ error: "Ese email ya esta registrado" });
    }
    res.status(500).json({ error: "Error al actualizar usuario" });
  }
}

// DELETE /users/:id
async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "ID invalido" });

    const exists = await User.findById(id);
    if (!exists) return res.status(404).json({ error: "Usuario no encontrado" });

    await User.findByIdAndDelete(id);
    res.json({ status: "ok", message: "Usuario eliminado" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar usuario" });
  }
}

module.exports = { listUsers, getUser, createUser, updateUser, deleteUser };
