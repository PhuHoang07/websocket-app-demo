const { createClient } = require("redis");

const pub = createClient({ url: "redis://localhost:6379" });
const sub = createClient({ url: "redis://localhost:6379" });

let isReady = false;

async function connectRedis() {
  if (isReady) return;

  pub.on("error", (err) => console.error("Redis pub error", err));
  sub.on("error", (err) => console.error("Redis sub error", err));

  await pub.connect();
  await sub.connect();

  isReady = true;
  console.log("Redis connected");
}

module.exports = {
  pub,
  sub,
  connectRedis,
};
