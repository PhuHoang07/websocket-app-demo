const conversationController = require("../controllers/conversationController");
const messageController = require("../controllers/messageController");
const WS_EVENTS = require("../constants/index");
const { pub, sub } = require("../redis/redis");

module.exports = (wss) => {
  sub.subscribe("chat-message", (raw) => {
    const message = JSON.parse(raw);

    wss.clients.forEach((client) => {
      if (
        client.readyState === 1 &&
        client.conversationId === message.conversationId
      ) {
        client.send(
          JSON.stringify({
            type: WS_EVENTS.WS_OUT.NEW_MESSAGE,
            data: message,
          }),
        );
      }
    });
  });

  sub.subscribe("system-message", (raw) => {
    const data = JSON.parse(raw);
    wss.clients.forEach((client) => {
      if (
        client.readyState === 1 &&
        client.conversationId === data.conversationId &&
        client.username !== data.exceptUsername
      ) {
        client.send(
          JSON.stringify({
            type: WS_EVENTS.WS_OUT.SYSTEM,
            message: data.message,
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
          case WS_EVENTS.WS_IN.CREATE_CONVERSATION:
            await handleCreateConversation(ws, data);
            break;

          case WS_EVENTS.WS_IN.JOIN:
            await handleJoinConversation(wss, ws, data);
            break;

          case WS_EVENTS.WS_IN.MESSAGE:
            await handleMessage(ws, data);
            break;

          case WS_EVENTS.WS_IN.VIEW:
            await handleViewHistory(ws, data);
            break;
        }
      } catch (err) {
        ws.send(
          JSON.stringify({
            type: WS_EVENTS.WS_OUT.ERROR,
            message: err.message,
          }),
        );
      }
    });
    ws.on("close", () => {
      if (ws.username && ws.conversationId) {
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
      type: WS_EVENTS.WS_OUT.CONVERSATION_CREATED,
      conversationId: conversation._id,
    }),
  );
};

const handleJoinConversation = async (wss, ws, data) => {
  const result = await conversationController.joinConversation({
    conversationId: data.conversationId,
    username: data.username,
  });

  if (!result.ok) {
    ws.send(
      JSON.stringify({
        type: WS_EVENTS.WS_OUT.JOIN_REFUSED,
        reason: result.reason,
      }),
    );
    return;
  }

  ws.username = data.username;
  ws.conversationId = data.conversationId;

  ws.send(
    JSON.stringify({
      type: WS_EVENTS.WS_OUT.JOIN_SUCCESS,
      conversationId: data.conversationId,
    }),
  );

  const history = await messageController.getHistory({
    conversationId: data.conversationId,
  });

  ws.send(
    JSON.stringify({
      type: WS_EVENTS.WS_OUT.HISTORY,
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
  });

  ws.send(
    JSON.stringify({
      type: WS_EVENTS.WS_OUT.MESSAGE_SENT,
      tempId: data.tempId,
      data: {
        senderName: saved.senderName,
        content: saved.content,
        createdAt: saved.createdAt,
        clientCreatedAt: saved.clientCreatedAt,
      },
    }),
  );

  pub.publish(
    "chat-message",
    JSON.stringify({
      conversationId: ws.conversationId,
      clientCreatedAt: saved.clientCreatedAt,
      clientMessageId: saved.clientMessageId,
      senderName: saved.senderName,
      content: saved.content,
      createdAt: saved.createdAt,
    }),
  );
};

const handleViewHistory = async (ws, data) => {
  const history = await messageController.getHistory({
    conversationId: data.conversationId,
  });

  ws.send(
    JSON.stringify({
      type: WS_EVENTS.WS_OUT.HISTORY,
      data: history,
    }),
  );
};

//*INFO: This function broadcast system message to others in conversation.
const broadcastSystem = async (conversationId, message, exceptUsername) => {
  if (!pub.isOpen) return;

  pub.publish(
    "system-message",
    JSON.stringify({
      conversationId,
      message,
      exceptUsername,
    }),
  );
};
