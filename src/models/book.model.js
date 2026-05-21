const mongoose = require("mongoose");
const { schemaOptions } = require("../utils/mongoose-transform");

const bookSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  author: {
    type: String,
    required: true,
    trim: true,
  },
  genre: {
    type: String,
    default: null,
    trim: true,
  },
  isbn: {
    type: String,
    unique: true,
    sparse: true,
    default: null,
    trim: true,
  },
  stock: {
    type: Number,
    default: 1,
    min: 0,
  },
}, schemaOptions);

module.exports = mongoose.model("Book", bookSchema);
