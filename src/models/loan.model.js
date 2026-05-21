const mongoose = require("mongoose");
const { schemaOptions } = require("../utils/mongoose-transform");

const loanItemSchema = new mongoose.Schema({
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

const loanSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ["ACTIVE", "RETURNED", "OVERDUE"],
    default: "ACTIVE",
    index: true,
  },
  loanDate: {
    type: Date,
    default: Date.now,
  },
  dueDate: {
    type: Date,
    default: null,
    index: true,
  },
  returnDate: {
    type: Date,
    default: null,
  },
  loanitem: {
    type: [loanItemSchema],
    default: [],
  },
}, schemaOptions);

module.exports = mongoose.model("Loan", loanSchema);
