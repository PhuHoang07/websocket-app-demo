const conversationController = require("../controllers/conversationController");
const messageController = require("../controllers/messageController");

module.exports = (wss) => {
  wss.on("connection", (ws) => {
    ws.on("message", async (raw) => {
      try {
        const data = JSON.parse(raw.toString());

        switch (data.type) {
          case "CREATE_CONVERSATION": {
            const convo = await conversationController.createConversation(
              data.username,
            );

            ws.send(
              JSON.stringify({
                type: "CONVERSATION_CREATED",
                conversationId: convo._id,
              }),
            );
            break;
          }

          case "JOIN": {
            const result = await conversationController.joinConversation(
              data.conversationId,
              data.username,
            );

            if (!result.ok) {
              ws.send(
                JSON.stringify({
                  type: "JOIN_REFUSED",
                  reason: result.reason,
                }),
              );
              return;
            }

            ws.username = data.username;
            ws.conversationId = data.conversationId;

            ws.send(
              JSON.stringify({
                type: "JOIN_SUCCESS",
                conversationId: data.conversationId,
              }),
            );

            const history = await messageController.getHistory(
              data.conversationId,
            );

            ws.send(
              JSON.stringify({
                type: "HISTORY",
                data: history,
              }),
            );
            break;
          }

          case "MESSAGE": {
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
                    type: "NEW_MESSAGE",
                    data: saved,
                  }),
                );
              }
            });
            break;
          }

          case "VIEW": {
            const history = await messageController.getHistory(
              data.conversationId,
            );

            ws.send(
              JSON.stringify({
                type: "HISTORY",
                data: history,
              }),
            );
            break;
          }
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: "ERROR", message: err.message }));
      }
    });
  });
};
