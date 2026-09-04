const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sourceKey: {type: String, trim: true, maxlength: 160},
    type: { type: String, required: true, trim: true, maxlength: 80 },
    title: {
      en: { type: String, required: true, maxlength: 200 },
      bn: { type: String, maxlength: 200, default: "" },
    },
    body: {
      en: { type: String, required: true, maxlength: 1000 },
      bn: { type: String, maxlength: 1000, default: "" },
    },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    pushRequired: {type: Boolean, default: false, index: true},
    pushState: {type: String, enum: ["NOT_REQUIRED", "PENDING", "READY"], default: "NOT_REQUIRED", index: true},
    pushLastAttemptAt: Date,
    readAt: Date,
  },
  { timestamps: true, versionKey: false }
);

notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index(
  {sourceKey: 1},
  {unique: true, partialFilterExpression: {sourceKey: {$type: "string"}}},
);

module.exports = mongoose.model("Notification", notificationSchema);
