const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    chatType: {
      type: String,
      enum: ["private", "group"],
      required: true,
    },

    createdBy: {
      type: String,
      required: true,
    },

    chatParticipant: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: "createdAt",
      updatedAt: false,
    },
  },
);

module.exports = mongoose.model("Conversation", conversationSchema);
