require("dotenv").config();
const http = require("http");
const WebSocket = require("ws");
const express = require("express");
const app = express();
const connectMongo = require("./db/mongoose");
const wsHandler = require("./ws/websocketHandler");
const watchPresence = require("./worker/presenceWatcher");

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const { connectRedis } = require("./redis/redis");

const PORT = process.env.PORT;

app.use("/views", express.static("views"));

(async () => {
  await connectMongo();
  await connectRedis();
  wsHandler(wss);
  watchPresence();

  server.listen(PORT, () => {
    console.log("Server running on port " + PORT);
  });
})();
