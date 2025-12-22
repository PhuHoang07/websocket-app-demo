const Conversation = require("../models/Conversation");

exports.createConversation = async (username) => {
  return Conversation.create({
    chatType: "private",
    createdBy: username,
    chatParticipant: null,
  });
};

exports.joinConversation = async (payload) => {
  const { conversationId, username } = payload;
  const actor = username;

  try {
    const converstationDetails = await Conversation.findById(conversationId);

    if (!converstationDetails) {
      throw new Error("Conversation not found");
    }

    if (!converstationDetails.chatParticipant) {
      converstationDetails.chatParticipant = actor;
      await converstationDetails.save();

      return { ok: true, conversation: converstationDetails };
    }

    // *INFO: temporary check chatParticipant = actor  for testing case
    if (
      converstationDetails.chatParticipant === actor ||
      converstationDetails.createdBy === actor
    ) {
      return { ok: true, conversation: converstationDetails };
    }

    throw new Error("Conversation already belongs to another user");
  } catch (error) {
    return { ok: false, reason: error.messegae };
  }
};
