// eslint-disable-next-line no-undef
window.CONSTANTS = {
  WS_IN: {
    CREATE_CONVERSATION: "CREATE_CONVERSATION",
    JOIN: "JOIN",
    MESSAGE: "MESSAGE",
    VIEW: "VIEW",
    PING: "PING",
  },
  WS_OUT: {
    CONVERSATION_CREATED: "CONVERSATION_CREATED",
    JOIN_SUCCESS: "JOIN_SUCCESS",
    JOIN_REFUSED: "JOIN_REFUSED",
    MESSAGE_SENT: "MESSAGE_SENT",
    NEW_MESSAGE: "NEW_MESSAGE",
    HISTORY: "HISTORY",
    ERROR: "ERROR",
    SYSTEM: "SYSTEM",
  },
  MESSAGE_STATUS: {
    SENDING: "sending",
    SENT: "sent",
    RETRYING: "retrying",
    FAILED: "failed",
  },
};
