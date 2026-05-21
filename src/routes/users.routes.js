const express = require("express");
const { adminRequired } = require("../middlewares/auth.middleware");
const router = express.Router();

const {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
} = require("../modules/users/users.controller");

router.use(adminRequired);

router.get("/", listUsers);
router.get("/:id", getUser);
router.post("/", createUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

module.exports = router;
