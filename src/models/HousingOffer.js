const mongoose = require("mongoose");

const housingOfferSchema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "HousingRequest", required: true, index: true },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    message: { type: String, trim: true, maxlength: 1000, default: "" },
    status: { type: String, enum: ["SENT", "VIEWED", "ACCEPTED", "DECLINED", "WITHDRAWN"], default: "SENT", index: true },
  },
  { timestamps: true, versionKey: false }
);

housingOfferSchema.index({ requestId: 1, propertyId: 1 }, { unique: true });

module.exports = mongoose.model("HousingOffer", housingOfferSchema);
