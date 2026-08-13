const mongoose = require("mongoose");

const visitBookingSchema = new mongoose.Schema(
  {
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    visitorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    requestedAt: { type: Date, required: true },
    note: { type: String, trim: true, maxlength: 1000, default: "" },
    status: { type: String, enum: ["REQUESTED", "CONFIRMED", "RESCHEDULED", "COMPLETED", "CANCELLED", "REJECTED"], default: "REQUESTED", index: true },
    ownerNote: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { timestamps: true, versionKey: false }
);

visitBookingSchema.index({ propertyId: 1, visitorId: 1, requestedAt: 1 });

module.exports = mongoose.model("VisitBooking", visitBookingSchema);
