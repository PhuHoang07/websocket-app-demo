const conversationController = require("../controllers/conversationController");
const messageController = require("../controllers/messageController");
const CONSTANTS = require("../constants/index");
const { pub, sub } = require("../redis/redis");
const presence = require("../redis/presence");

module.exports = (wss) => {
  sub.subscribe(CONSTANTS.REDIS_PUBSUB.CHAT_MESSAGE, (raw) => {
    const message = JSON.parse(raw);

    wss.clients.forEach((client) => {
      if (
        client.readyState === CONSTANTS.READYSTATE.OPEN &&
        client.conversationId === message.conversationId
      ) {
        client.send(
          JSON.stringify({
            type: CONSTANTS.WS_OUT.NEW_MESSAGE,
            data: message,
          }),
        );
      }
    });
  });

  sub.subscribe(CONSTANTS.REDIS_PUBSUB.SYSTEM_MESSAGE, (raw) => {
    const data = JSON.parse(raw);
    wss.clients.forEach((client) => {
      if (
        client.readyState === CONSTANTS.READYSTATE.OPEN &&
        client.conversationId === data.conversationId &&
        client.username !== data.exceptUsername
      ) {
        client.send(
          JSON.stringify({
            type: CONSTANTS.WS_OUT.SYSTEM,
            message: data.message,
          }),
        );
      }
    });
  });

  sub.subscribe(CONSTANTS.REDIS_PUBSUB.TYPING, (raw) => {
    const data = JSON.parse(raw);

    wss.clients.forEach((client) => {
      if (
        client.readyState === CONSTANTS.READYSTATE.OPEN &&
        client.conversationId === data.conversationId &&
        client.username !== data.username
      ) {
        client.send(
          JSON.stringify({
            type: CONSTANTS.WS_OUT.TYPING,
            data,
          }),
        );
      }
    });
  });

  wss.on("connection", (ws) => {
    ws.on("message", async (raw) => {
      try {
        const data = JSON.parse(raw.toString());

        switch (data.type) {
          case CONSTANTS.WS_IN.CREATE_CONVERSATION:
            await handleCreateConversation(ws, data);
            break;

          case CONSTANTS.WS_IN.JOIN:
            await handleJoinConversation(ws, data);
            break;

          case CONSTANTS.WS_IN.MESSAGE:
            await handleMessage(ws, data);
            break;

          case CONSTANTS.WS_IN.VIEW:
            await handleViewHistory(ws, data);
            break;

          case CONSTANTS.WS_IN.PING:
            if (!ws.conversationId || !ws.username) return;
            await presence.setOnline(ws.conversationId, ws.username);
            break;

          case CONSTANTS.WS_IN.TYPING: {
            if (!ws.conversationId || !ws.username) return;

            pub.publish(
              CONSTANTS.REDIS_PUBSUB.TYPING,
              JSON.stringify({
                conversationId: ws.conversationId,
                username: ws.username,
              }),
            );
            break;
          }
        }
      } catch (err) {
        ws.send(
          JSON.stringify({
            type: CONSTANTS.WS_OUT.ERROR,
            message: err.message,
          }),
        );
      }
    });
    ws.on("close", async () => {
      if (ws.username && ws.conversationId) {
        await presence.removeOnline(ws.conversationId, ws.username);
        broadcastSystem(
          ws.conversationId,
          `${ws.username} left the conversation`,
          ws.username,
        );
      }
    });
  });
};

const handleCreateConversation = async (ws, data) => {
  const conversation = await conversationController.createConversation({
    username: data.username,
  });

  ws.send(
    JSON.stringify({
      type: CONSTANTS.WS_OUT.CONVERSATION_CREATED,
      conversationId: conversation._id,
    }),
  );
};

const handleJoinConversation = async (ws, data) => {
  const result = await conversationController.joinConversation({
    conversationId: data.conversationId,
    username: data.username,
  });

  if (!result.ok) {
    ws.send(
      JSON.stringify({
        type: CONSTANTS.WS_OUT.JOIN_REFUSED,
        reason: result.reason,
      }),
    );
    return;
  }

  ws.username = data.username;
  ws.conversationId = data.conversationId;

  await presence.setOnline(ws.conversationId, ws.username);

  ws.send(
    JSON.stringify({
      type: CONSTANTS.WS_OUT.JOIN_SUCCESS,
      conversationId: data.conversationId,
    }),
  );

  const history = await messageController.getHistory({
    conversationId: data.conversationId,
  });

  ws.send(
    JSON.stringify({
      type: CONSTANTS.WS_OUT.HISTORY,
      data: history,
    }),
  );

  broadcastSystem(
    data.conversationId,
    `${data.username} joined the conversation`,
    data.username,
  );
};

const handleMessage = async (ws, data) => {
  if (!ws.conversationId) return;

  await new Promise((res) => setTimeout(res, 3000));

  if (!pub.isOpen) {
    console.error("Redis pub not ready");
    return;
  }

  const saved = await messageController.saveMessage({
    conversationId: ws.conversationId,
    content: data.content,
    senderName: ws.username,
    clientMessageId: data.tempId,
    clientCreatedAt: data.clientCreatedAt,
    acceptedAt: new Date(),
  });

  ws.send(
    JSON.stringify({
      type: CONSTANTS.WS_OUT.MESSAGE_SENT,
      tempId: data.tempId,
      data: {
        senderName: saved.senderName,
        content: saved.content,
        clientCreatedAt: saved.clientCreatedAt,
        acceptedAt: saved.acceptedAt,
      },
    }),
  );

  pub.publish(
    CONSTANTS.REDIS_PUBSUB.CHAT_MESSAGE,
    JSON.stringify({
      conversationId: ws.conversationId,
      clientMessageId: saved.clientMessageId,
      senderName: saved.senderName,
      content: saved.content,
      clientCreatedAt: saved.clientCreatedAt,
      acceptedAt: saved.acceptedAt,
    }),
  );
};

const handleViewHistory = async (ws, data) => {
  const history = await messageController.getHistory({
    conversationId: data.conversationId,
  });

  ws.send(
    JSON.stringify({
      type: CONSTANTS.WS_OUT.HISTORY,
      data: history,
    }),
  );
};

//*INFO: This function broadcast system message to others in conversation.
const broadcastSystem = async (conversationId, message, exceptUsername) => {
  if (!pub.isOpen) return;

  pub.publish(
    CONSTANTS.REDIS_PUBSUB.SYSTEM_MESSAGE,
    JSON.stringify({
      conversationId,
      message,
      exceptUsername,
    }),
  );
};
