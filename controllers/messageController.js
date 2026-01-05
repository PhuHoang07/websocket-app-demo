const Message = require("../models/Message");
const { ERROR_TYPE } = require("../constants/index");

exports.getHistory = async (payload) => {
  if (!payload) {
    throw new Error("Payload is required");
  }

  const { conversationId } = payload;

  if (!conversationId) {
    throw new Error("conversationId is required");
  }

  return Message.find({ conversationId })
    .sort({ acceptedAt: 1 })
    .select(
      "content senderName acceptedAt clientCreatedAt -_id clientMessageId",
    )
    .lean();
};

exports.saveMessage = async (payload) => {
  if (!payload) {
    throw new Error("Payload is required");
  }

  const {
    conversationId,
    content,
    senderName,
    userId,
    clientMessageId,
    clientCreatedAt,
    acceptedAt,
  } = payload;
  //*HACK: in MVP: use username, future: use userId (uuid)
  const actor = userId ?? senderName;

  if (!conversationId) {
    throw new Error("conversationId is required");
  }

  if (!senderName) {
    throw new Error("senderName is required");
  }

  if (!clientMessageId) {
    throw new Error("clientMessageId is required");
  }

  if (!content || typeof content !== "string" || !content.trim()) {
    throw new Error("content must be a non-empty string");
  }

  try {
    const existing = await Message.findOne({
      conversationId,
      clientMessageId,
    });

    if (existing) {
      return existing;
    }

    return await Message.create({
      conversationId,
      clientMessageId,
      content,
      senderName: actor,
      clientCreatedAt,
      acceptedAt,
    });
  } catch (err) {
    if (err.code === ERROR_TYPE.DUPLICATE_KEY) {
      return await Message.findOne({ conversationId, clientMessageId });
    }
    console.error("saveMessage error:", err);
  }
};
