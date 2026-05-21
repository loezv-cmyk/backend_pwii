const mongoose = require("mongoose");
const env = require("./env");

async function connectDb() {
  mongoose.connection.on("connected", () => {
    console.log("MongoDB conectado");
  });

  mongoose.connection.on("error", (err) => {
    console.error("Error de conexion MongoDB:", err.message);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB desconectado");
  });

  await mongoose.connect(env.MONGODB_URI);
}

module.exports = { connectDb };
