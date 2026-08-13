const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
      validate: [(value) => value.length === 2, "A conversation must have exactly two participants"],
    },
    participantKey: { type: String, required: true, unique: true, index: true },
    contextType: { type: String, enum: ["PROPERTY", "JOB", "HOUSING_REQUEST", "WORKER_PROFILE", "GENERAL"], default: "GENERAL" },
    contextId: mongoose.Schema.Types.ObjectId,
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, maxlength: 200, default: "" },
    blockedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Conversation", conversationSchema);
