const mongoose = require("mongoose");

const commentLikeSchema = new mongoose.Schema(
  {
    commentId: {type: mongoose.Schema.Types.ObjectId, ref: "PropertyComment", required: true, index: true},
    userId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true},
  },
  {timestamps: true, versionKey: false},
);

commentLikeSchema.index({commentId: 1, userId: 1}, {unique: true});

module.exports = mongoose.model("CommentLike", commentLikeSchema);
