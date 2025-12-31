const { pub } = require("./redis");

const PRESENCE_TTL = 10;

const presenceKey = (conversationId, username) =>
  `presence:${conversationId}:${username}`;

async function setOnline(conversationId, username) {
  await pub.set(presenceKey(conversationId, username), "online", {
    EX: PRESENCE_TTL,
  });
}

async function removeOnline(conversationId, username) {
  await pub.del(presenceKey(conversationId, username));
}

module.exports = {
  setOnline,
  removeOnline,
  presenceKey,
  PRESENCE_TTL,
};
