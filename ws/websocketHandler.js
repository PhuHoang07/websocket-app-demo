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
            await handleJoinConversation(ws, data);
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

const handleJoinConversation = async (ws, data) => {
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
};

const handleMessage = async (ws, wss, data) => {
  if (!ws.conversationId) return;

  const saved = await messageController.saveMessage({
    conversationId: ws.conversationId,
    content: data.content,
    senderName: ws.username,
  });

  wss.clients.forEach((client) => {
    if (
      client.readyState === 1 &&
      client.conversationId === ws.conversationId
    ) {
      client.send(
        JSON.stringify({
          type: WS_EVENTS.WS_OUT.NEW_MESSAGE,
          data: saved,
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
