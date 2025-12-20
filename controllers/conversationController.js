const Conversation = require("../models/Conversation");

exports.createConversation = async (username) => {
  return Conversation.create({
    chatType: "private",
    createdBy: username,
    chatParticipant: null,
  });
};

exports.joinConversation = async (conversationId, username) => {
  const convo = await Conversation.findById(conversationId);

  if (!convo) {
    return { ok: false, reason: "Conversation not found" };
  }

  if (!convo.chatParticipant) {
    convo.chatParticipant = username;
    await convo.save();
    return { ok: true, conversation: convo };
  }

  if (convo.chatParticipant === username || convo.createdBy === username) {
    return { ok: true, conversation: convo };
  }

  return {
    ok: false,
    reason: "Conversation already belongs to another user",
  };
};
