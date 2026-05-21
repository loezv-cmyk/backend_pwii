const mongoose = require("mongoose");
const { schemaOptions } = require("../utils/mongoose-transform");

const loanRequestItemSchema = new mongoose.Schema({
  bookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Book",
    required: true,
  },
  qty: {
    type: Number,
    default: 1,
    min: 1,
  },
}, {
  _id: false,
});

const loanRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  items: {
    type: [loanRequestItemSchema],
    default: [],
  },
  status: {
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
    default: "PENDING",
    index: true,
  },
  loanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Loan",
    default: null,
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  reviewedAt: {
    type: Date,
    default: null,
  },
  rejectionReason: {
    type: String,
    default: null,
    trim: true,
  },
}, schemaOptions);

loanRequestSchema.index({ userId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("LoanRequest", loanRequestSchema);
