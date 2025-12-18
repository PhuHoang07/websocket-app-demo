require("dotenv").config();
const http = require("http");
const WebSocket = require("ws");
const express = require("express");
const app = express();
const connectMongo = require("./db/mongoose");

const server = http.createServer(app);

app.get("/", (req, res) => {
  res.send("Start server");
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("error", console.error);

  ws.on("message", (message) => {
    console.log("Message:", message.toString());

    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message.toString());
      }
    });
  });

  ws.on("close", () => {
    console.log("Client left");
  });
});

(async () => {
  await connectMongo();

  server.listen(3000, () => {
    console.log("Server running on port 3000");
  });
})();
