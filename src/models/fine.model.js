const mongoose = require("mongoose");
const { schemaOptions } = require("../utils/mongoose-transform");

const fineSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  loanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Loan",
    required: true,
    index: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  reason: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ["PENDING", "PAID"],
    default: "PENDING",
    index: true,
  },
  paidAt: {
    type: Date,
    default: null,
  },
}, schemaOptions);

module.exports = mongoose.model("Fine", fineSchema);
