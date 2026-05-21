function transformDocument(_doc, ret) {
  if (ret._id) {
    ret.id = ret._id.toString();
  }

  delete ret._id;
  delete ret.__v;

  return ret;
}

const schemaOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: transformDocument,
  },
  toObject: {
    virtuals: true,
    transform: transformDocument,
  },
};

module.exports = { schemaOptions, transformDocument };
