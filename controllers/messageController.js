const Message = require("../models/Message");

exports.getHistory = async (payload) => {
  if (!payload) {
    throw new Error("Payload is required");
  }

  const { conversationId } = payload;

  if (!conversationId) {
    throw new Error("conversationId is required");
  }

  return Message.find({ conversationId })
    .sort({ createdAt: 1 })
    .select("content senderName createdAt -_id")
    .lean();
};

exports.saveMessage = async (payload) => {
  if (!payload) {
    throw new Error("Payload is required");
  }

  const { conversationId, content, senderName, userId } = payload;
  // MVP: use username, future: use userId (uuid)
  const actor = userId ?? senderName;

  if (!conversationId) {
    throw new Error("conversationId is required");
  }

  if (!senderName) {
    throw new Error("senderName is required");
  }

  if (!content || typeof content !== "string" || !content.trim()) {
    throw new Error("content must be a non-empty string");
  }

  return Message.create({
    conversationId,
    content: content,
    senderName: actor,
  });
};
