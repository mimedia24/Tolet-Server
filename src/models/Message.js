const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    clientMessageId: {type: String, trim: true, maxlength: 100},
    contentHash: {type: String, trim: true, maxlength: 64, select: false},
    text: { type: String, trim: true, maxlength: 4000, required: true },
    attachments: [
      {
        type: { type: String, enum: ["IMAGE", "FILE"], default: "IMAGE" },
        url: { type: String, required: true, maxlength: 1000 },
      },
    ],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    deliveredAt: Date,
    readAt: Date,
    notificationRequired: {type: Boolean, default: false, index: true},
    notificationState: {type: String, enum: ["PENDING", "READY"], default: "PENDING", index: true},
    notificationLastAttemptAt: Date,
    deletedAt: Date,
  },
  { timestamps: true, versionKey: false }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index(
  {senderId: 1, clientMessageId: 1},
  {unique: true, partialFilterExpression: {clientMessageId: {$type: "string"}}},
);

module.exports = mongoose.model("Message", messageSchema);
