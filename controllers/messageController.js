const Message = require("../models/Message");

exports.getHistory = async (conversationId) => {
  return Message.find({ conversationId })
    .sort({ createdAt: 1 })
    .select("content senderName createdAt -_id")
    .lean();
};

exports.saveMessage = async ({ conversationId, content, senderName }) => {
  return Message.create({ conversationId, content, senderName });
};
