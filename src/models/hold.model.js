const mongoose = require("mongoose");
const { schemaOptions } = require("../utils/mongoose-transform");

const holdSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  bookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Book",
    required: true,
    index: true,
  },
  position: {
    type: Number,
    required: true,
    min: 1,
  },
  status: {
    type: String,
    enum: ["WAITING", "NOTIFIED", "CANCELLED", "FULFILLED"],
    default: "WAITING",
    index: true,
  },
}, schemaOptions);

holdSchema.index({ bookId: 1, status: 1, position: 1 });
holdSchema.index({ userId: 1, bookId: 1, status: 1 });

module.exports = mongoose.model("Hold", holdSchema);
