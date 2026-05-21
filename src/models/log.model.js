const mongoose = require("mongoose");
const { schemaOptions } = require("../utils/mongoose-transform");

const logSchema = new mongoose.Schema({
  level: {
    type: String,
    required: true,
    enum: ["INFO", "WARN", "ERROR", "DEBUG"],
    index: true,
  },
  message: {
    type: String,
    required: true,
  },
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
}, schemaOptions);

module.exports = mongoose.model("Log", logSchema);
