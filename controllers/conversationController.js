const Conversation = require("../models/Conversation");
const CONSTANTS = require("../constants/index");

exports.createConversation = async (payload) => {
  const { chatType = CONSTANTS.CHAT_TYPE.PRIVATE, userId, username } = payload;
  if (!payload) {
    throw new Error("Payload is required");
  }

  // MVP: use username, future: use userId (uuid)
  const actor = userId ?? username;

  if (!actor) {
    throw new Error("Actor is required to create conversation");
  }

  return Conversation.create({
    chatType,
    createdBy: actor,
  });
};

exports.joinConversation = async (payload) => {
  try {
    const { conversationId, username, userId } = payload;
    // MVP: use username, future: use userId (uuid)
    const actor = userId ?? username;
    if (!payload) {
      throw new Error("Payload is required");
    }

    const conversationDetails = await Conversation.findById(conversationId);

    if (!conversationDetails) {
      throw new Error("Conversation not found");
    }

    if (!conversationDetails.chatParticipant) {
      conversationDetails.chatParticipant = actor;
      await conversationDetails.save();

      return { ok: true, conversation: conversationDetails };
    }

    // *INFO: temporary check chatParticipant = actor  for testing case
    if (
      conversationDetails.chatParticipant === actor ||
      conversationDetails.createdBy === actor
    ) {
      return { ok: true, conversation: conversationDetails };
    }

    throw new Error("Conversation already belongs to another user");
  } catch (error) {
    return { ok: false, reason: error.message };
  }
};
