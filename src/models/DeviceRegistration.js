const mongoose = require("mongoose");

const deviceRegistrationSchema = new mongoose.Schema(
  {
    userId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true},
    installationId: {type: String, required: true, unique: true, trim: true, maxlength: 200},
    tokenCiphertext: {type: String, required: true, select: false},
    tokenIv: {type: String, required: true, select: false},
    tokenTag: {type: String, required: true, select: false},
    tokenHash: {type: String, required: true, unique: true, select: false},
    platform: {type: String, enum: ["ANDROID", "IOS"], required: true},
    enabled: {type: Boolean, default: true, index: true},
    lastSeenAt: {type: Date, default: Date.now, index: true},
    disabledAt: Date,
    disabledReason: {type: String, trim: true, maxlength: 100},
  },
  {timestamps: true, versionKey: false},
);

deviceRegistrationSchema.index({userId: 1, enabled: 1, lastSeenAt: -1});

module.exports = mongoose.model("DeviceRegistration", deviceRegistrationSchema);
