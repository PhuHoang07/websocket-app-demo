require("dotenv").config();
const http = require("http");
const WebSocket = require("ws");
const express = require("express");
const app = express();
const connectMongo = require("./db/mongoose");
const Message = require("./models/Message");

const server = http.createServer(app);

app.get("/", (req, res) => {
  res.send("Start server");
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", async (raw) => {
    const data = JSON.parse(raw.toString());

    if (data.type === "JOIN") {
      const messages = await Message.find({
        conversationId: data.conversationId,
      })
        .sort({ createdAt: 1 })
        .limit(20);

      ws.send(
        JSON.stringify({
          type: "HISTORY",
          data: messages.map((m) => {
            return {
              content: m.content,
              senderName: m.senderName,
              createdAt: m.createdAt,
            };
          }),
        }),
      );
    }

    if (data.type === "SEND") {
      const msg = await Message.create({
        conversationId: data.conversationId,
        content: data.content,
        senderName: data.senderName,
      });

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: "NEW_MESSAGE",
              data: msg,
            }),
          );
        }
      });
    }
  });
});

(async () => {
  try {
    await connectMongo();

    server.listen(3000, () => {
      console.log("Server running on port 3000");
    });
  } catch (err) {
    console.error("Server startup failed");
    console.error(err);
  }
})();
