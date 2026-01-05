const ConversationRead = require("../models/ConversationRead");
const Message = require("../models/Message");

exports.markSeenLatest = async ({ conversationId, username }) => {
  const lastMessage = await Message.findOne({ conversationId }).sort({
    acceptedAt: -1,
  });

  if (!lastMessage) return null;

  const record = await ConversationRead.findOne({
    conversationId,
    username,
  });

  if (record && record.lastSeenMessageId === lastMessage.clientMessageId) {
    return {
      lastSeenMessageId: lastMessage.clientMessageId,
      hasNewSeen: false,
    };
  }

  await ConversationRead.updateOne(
    { conversationId, username },
    {
      lastSeenMessageId: lastMessage.clientMessageId,
      seenAt: new Date(),
    },
    { upsert: true },
  );

  return {
    lastSeenMessageId: lastMessage.clientMessageId,
    hasNewSeen: true,
  };
};

exports.markSeenMessage = async ({
  conversationId,
  username,
  clientMessageId,
}) => {
  return ConversationRead.findOneAndUpdate(
    { conversationId, username },
    {
      conversationId,
      username,
      lastSeenAt: new Date(),
      lastSeenMessageId: clientMessageId,
    },
    { upsert: true, new: true },
  );
};
