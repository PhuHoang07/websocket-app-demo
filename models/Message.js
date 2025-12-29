const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Conversation",
      index: true,
    },

    clientMessageId: {
      type: String,
      required: true,
    },

    content: {
      type: String,
      required: true,
      trim: true,
    },

    senderName: {
      type: String,
      required: true,
    },

    clientCreatedAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

messageSchema.index(
  { conversationId: 1, clientMessageId: 1 },
  { unique: true },
);

module.exports = mongoose.model("Message", messageSchema);
