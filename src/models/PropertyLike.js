const mongoose = require("mongoose");

const propertyLikeSchema = new mongoose.Schema(
  {
    propertyId: {type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true},
    userId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true},
  },
  {timestamps: true, versionKey: false},
);

propertyLikeSchema.index({propertyId: 1, userId: 1}, {unique: true});

module.exports = mongoose.model("PropertyLike", propertyLikeSchema);
