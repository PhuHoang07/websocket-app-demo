const { pub } = require("../redis/redis");
const { PRESENCE_TTL } = require("../redis/presence");
const CONSTANTS = require("../constants/index");
const seen = new Set();

async function watchPresence() {
  setInterval(async () => {
    const keys = await pub.keys("presence:*");
    const current = new Set(keys);

    for (const key of seen) {
      if (!current.has(key)) {
        const [, conversationId, username] = key.split(":");

        const lockKey = `lock:presence:disconnect:${conversationId}:${username}`;

        const locked = await pub.set(lockKey, "1", {
          NX: true,
          EX: 5,
        });

        if (!locked) {
          continue;
        }

        pub.publish(
          CONSTANTS.REDIS_PUBSUB.SYSTEM_MESSAGE,
          JSON.stringify({
            conversationId,
            message: `${username} is disconnected`,
            exceptUsername: username,
          }),
        );
      }
    }

    seen.clear();
    keys.forEach((k) => seen.add(k));
  }, PRESENCE_TTL * 1000); //*INFO: PRESENCE_TTL is milisecond
}

module.exports = watchPresence;
