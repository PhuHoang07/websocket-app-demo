const mongoose = require("mongoose");

const conversationReadSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    username: {
      type: String,
      required: true,
      index: true,
    },

    lastSeenAt: {
      type: Date,
      required: true,
    },

    lastSeenMessageId: {
      type: String, // clientMessageId
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

conversationReadSchema.index(
  { conversationId: 1, username: 1 },
  { unique: true },
);

module.exports = mongoose.model("ConversationRead", conversationReadSchema);
