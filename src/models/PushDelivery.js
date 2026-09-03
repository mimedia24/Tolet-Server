const mongoose = require("mongoose");

const pushDeliverySchema = new mongoose.Schema(
  {
    notificationId: {type: mongoose.Schema.Types.ObjectId, ref: "Notification", required: true, index: true},
    deviceRegistrationId: {type: mongoose.Schema.Types.ObjectId, ref: "DeviceRegistration", required: true, index: true},
    status: {type: String, enum: ["PENDING", "PROCESSING", "SENT", "RETRY", "FAILED"], default: "PENDING", index: true},
    attemptCount: {type: Number, default: 0, min: 0},
    nextAttemptAt: {type: Date, default: Date.now, index: true},
    leaseUntil: {type: Date, default: null, index: true},
    lastErrorCode: {type: String, trim: true, maxlength: 160, default: ""},
    sentAt: Date,
    expiresAt: {type: Date, required: true, index: {expires: 0}},
  },
  {timestamps: true, versionKey: false},
);

pushDeliverySchema.index({notificationId: 1, deviceRegistrationId: 1}, {unique: true});
pushDeliverySchema.index({status: 1, nextAttemptAt: 1, leaseUntil: 1});

module.exports = mongoose.model("PushDelivery", pushDeliverySchema);
