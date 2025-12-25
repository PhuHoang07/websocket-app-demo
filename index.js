require("dotenv").config();
const http = require("http");
const WebSocket = require("ws");
const express = require("express");
const app = express();
const connectMongo = require("./db/mongoose");
const wsHandler = require("./ws/websocketHandler");

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT;

app.use("/views", express.static("views"));

(async () => {
  await connectMongo();
  wsHandler(wss);

  server.listen(PORT, () => {
    console.log("Server running on port " + PORT);
  });
})();
