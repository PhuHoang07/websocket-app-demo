const conversationController = require("../controllers/conversationController");
const messageController = require("../controllers/messageController");
const WS_EVENTS = require("../constants/index");

module.exports = (wss) => {
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
            await handleMessage(ws, wss, data);
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
          wss,
          ws.conversationId,
          `${ws.username} left the conversation`,
          ws,
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
    wss,
    data.conversationId,
    `${data.username} joined the conversation`,
    ws,
  );
};

const handleMessage = async (ws, wss, data) => {
  if (!ws.conversationId) return;

  await new Promise((res) => setTimeout(res, 2000));

  const saved = await messageController.saveMessage({
    conversationId: ws.conversationId,
    content: data.content,
    senderName: ws.username,
  });

  ws.send(
    JSON.stringify({
      type: WS_EVENTS.WS_OUT.MESSAGE_SENT,
      tempId: data.tempId,
      data: {
        senderName: saved.senderName,
        content: saved.content,
        createdAt: saved.createdAt,
      },
    }),
  );

  wss.clients.forEach((client) => {
    if (
      client.readyState === 1 &&
      client.conversationId === ws.conversationId &&
      client !== ws
    ) {
      client.send(
        JSON.stringify({
          type: WS_EVENTS.WS_OUT.NEW_MESSAGE,
          data: {
            senderName: saved.senderName,
            content: saved.content,
            createdAt: saved.createdAt,
          },
        }),
      );
    }
  });
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
const broadcastSystem = (wss, conversationId, message, exceptWs = null) => {
  wss.clients.forEach((client) => {
    if (
      client.readyState === 1 &&
      client.conversationId === conversationId &&
      client !== exceptWs
    ) {
      client.send(
        JSON.stringify({
          type: WS_EVENTS.WS_OUT.SYSTEM,
          message,
        }),
      );
    }
  });
};
