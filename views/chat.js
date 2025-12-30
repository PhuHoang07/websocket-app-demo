/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

const messagesDiv = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const messages = [];
const connectionStatusDiv = document.getElementById("connectionStatus");

let isReconnecting = false;
let currentConversationId = null;
let username = null;
let mode = null; // "JOIN" | "VIEW"
let ws;
let lastJoinPayload = null;
let retryQueue = [];
let isRetrying = false;

connectWebSocket();

function connectWebSocket() {
  const wsUrl =
    (location.protocol === "https:" ? "wss://" : "ws://") + location.host;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    hideReconnecting();
    addSystemMessage("Connected to " + wsUrl);

    if (mode === CONSTANTS.WS_IN.JOIN && lastJoinPayload) {
      ws.send(JSON.stringify(lastJoinPayload));
    }
  };

  ws.onmessage = handleMessage;
  ws.onclose = () => {
    showReconnecting();
    setTimeout(connectWebSocket, 2000);
  };
}

setInterval(() => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: CONSTANTS.WS_IN.PING }));
  }
}, 5000);

function formatTime(dateString) {
  const date = new Date(dateString);

  return date.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

function addSystemMessage(text) {
  const div = document.createElement("div");
  div.className = "system";
  div.textContent = text;
  messagesDiv.appendChild(div);
}

function setSendEnabled(enabled) {
  messageInput.disabled = !enabled;
}

function handleMessage(e) {
  const message = JSON.parse(e.data);

  switch (message.type) {
    case CONSTANTS.WS_OUT.CONVERSATION_CREATED:
      currentConversationId = message.conversationId;
      addSystemMessage(`Conversation created: ${message.conversationId}`);
      break;

    case CONSTANTS.WS_OUT.JOIN_SUCCESS:
      mode = CONSTANTS.WS_IN.JOIN;
      currentConversationId = message.conversationId;
      addSystemMessage("Joined conversation");
      setSendEnabled(true);
      break;

    case CONSTANTS.WS_OUT.JOIN_REFUSED:
      addSystemMessage("Join refused: " + message.reason);
      break;

    case CONSTANTS.WS_OUT.HISTORY: {
      const pending = getPendingMessages();

      const historyMessages = message.data.map((m) =>
        normalizeServerMessage({
          id: m.clientMessageId,
          senderName: m.senderName,
          content: m.content,
          clientCreatedAt: m.clientCreatedAt,
          acceptedAt: m.acceptedAt,
          status: CONSTANTS.MESSAGE_STATUS.SENT,
        }),
      );

      messages.length = 0;
      const historyIds = new Set(historyMessages.map((m) => m.id));

      const safePending = pending.filter((p) => !historyIds.has(p.id));

      messages.length = 0;
      messages.push(...historyMessages, ...safePending);

      sortMessages();
      renderMessages();
      retryPendingMessages();

      if (mode === CONSTANTS.WS_IN.VIEW) {
        addSystemMessage("Viewing conversation (read-only)");
      }
      break;
    }

    case CONSTANTS.WS_OUT.NEW_MESSAGE: {
      const index = messages.findIndex(
        (m) => m.id === message.data.clientMessageId,
      );

      if (index !== -1) {
        messages[index].status = CONSTANTS.MESSAGE_STATUS.SENT;
        messages[index].acceptedAt = new Date(
          message.data.acceptedAt,
        ).getTime();
      } else {
        messages.push(
          normalizeServerMessage({
            id: message.data.clientMessageId,
            senderName: message.data.senderName,
            content: message.data.content,
            clientCreatedAt: message.data.clientCreatedAt,
            acceptedAt: message.data.acceptedAt,
            status: CONSTANTS.MESSAGE_STATUS.SENT,
          }),
        );
      }
      sortMessages();
      renderMessages();
      break;
    }

    case CONSTANTS.WS_OUT.SYSTEM:
      addSystemMessage(message.message);
      autoScroll();
      break;

    case CONSTANTS.WS_OUT.MESSAGE_SENT: {
      const index = messages.findIndex((m) => m.id === message.tempId);
      if (index === -1) return;

      messages[index].status = CONSTANTS.MESSAGE_STATUS.SENT;

      if (retryQueue.length && retryQueue[0].id === message.tempId) {
        retryQueue.shift();
      }

      renderMessages();
      processRetryQueue();
      break;
    }
  }
}

function retryPendingMessages() {
  if (isRetrying || ws.readyState !== WebSocket.OPEN) return;

  retryQueue = messages
    .filter(
      (m) =>
        !m.acceptedAt &&
        (m.status === CONSTANTS.MESSAGE_STATUS.SENDING ||
          m.status === CONSTANTS.MESSAGE_STATUS.RETRYING),
    )
    .sort((a, b) => a.clientCreatedAt - b.clientCreatedAt);

  processRetryQueue();
}

function processRetryQueue() {
  if (retryQueue.length === 0) {
    isRetrying = false;
    return;
  }

  isRetrying = true;
  const msg = retryQueue[0];

  if (msg.retryCount >= 2) {
    msg.status = CONSTANTS.MESSAGE_STATUS.FAILED;
    retryQueue.shift();
    return processRetryQueue();
  }

  msg.retryCount++;
  msg.status = CONSTANTS.MESSAGE_STATUS.RETRYING;

  sendMessageToServer(msg);
}

function createConversation() {
  username = document.getElementById("username").value;
  if (!username) return alert("Enter username");

  resetState();

  ws.send(
    JSON.stringify({
      type: CONSTANTS.WS_IN.CREATE_CONVERSATION,
      username,
    }),
  );
}

function joinConversation() {
  username = document.getElementById("username").value;
  const conversationId = document.getElementById("conversationId").value;

  if (!username || !conversationId)
    return alert("Enter username & conversationId");

  resetState();
  mode = CONSTANTS.WS_IN.JOIN;

  lastJoinPayload = {
    type: CONSTANTS.WS_IN.JOIN,
    username,
    conversationId,
  };

  ws.send(JSON.stringify(lastJoinPayload));
}

function viewConversation() {
  const conversationId = document.getElementById("conversationId").value;

  if (!conversationId) return alert("Enter conversationId");

  resetState();
  mode = CONSTANTS.WS_IN.VIEW;
  currentConversationId = conversationId;

  ws.send(
    JSON.stringify({
      type: CONSTANTS.WS_IN.VIEW,
      conversationId,
    }),
  );
}

function sendMessage() {
  if (mode !== CONSTANTS.WS_IN.JOIN) return;

  const content = messageInput.value;
  if (!content) return;

  const tempId = crypto.randomUUID();

  messages.push({
    id: tempId,
    senderName: username,
    content,
    clientCreatedAt: Date.now(),
    status: CONSTANTS.MESSAGE_STATUS.SENDING,
    retryCount: 0,
  });

  renderMessages();
  sendMessageToServer(messages[messages.length - 1]);

  messageInput.value = "";
}

function sendMessageToServer(message) {
  if (ws.readyState !== WebSocket.OPEN) return false;

  ws.send(
    JSON.stringify({
      type: CONSTANTS.WS_IN.MESSAGE,
      tempId: message.id,
      content: message.content,
      clientCreatedAt: message.clientCreatedAt,
    }),
  );

  return true;
}

function sortMessages() {
  messages.sort((a, b) => {
    const timeA = a.acceptedAt ?? a.clientCreatedAt;
    const timeB = b.acceptedAt ?? b.clientCreatedAt;
    return timeA - timeB;
  });
}

function renderMessages() {
  messagesDiv.innerHTML = "";

  messages.forEach((m) => {
    const div = document.createElement("div");
    div.className = "msg";

    const text = document.createElement("span");
    let prefix = "";

    if (m.acceptedAt) {
      prefix = `[${formatTime(m.acceptedAt)}] `;
    }

    text.textContent = `${prefix}${m.senderName}: ${m.content}`;

    div.appendChild(text);

    if (m.status !== CONSTANTS.MESSAGE_STATUS.SENT) {
      const status = document.createElement("span");
      status.className = "msg-status";

      if (m.status === CONSTANTS.MESSAGE_STATUS.SENDING)
        status.textContent = "sending...";
      if (m.status === CONSTANTS.MESSAGE_STATUS.RETRYING)
        status.textContent = `retrying (${m.retryCount})`;
      if (m.status === CONSTANTS.MESSAGE_STATUS.FAILED)
        status.textContent = "failed";

      div.appendChild(status);
    }

    messagesDiv.appendChild(div);
  });

  autoScroll();
}

function getPendingMessages() {
  return messages.filter(
    (m) =>
      m.status === CONSTANTS.MESSAGE_STATUS.SENDING ||
      m.status === CONSTANTS.MESSAGE_STATUS.RETRYING,
  );
}

function normalizeServerMessage(m) {
  return {
    ...m,
    clientCreatedAt: new Date(m.clientCreatedAt).getTime(),
    acceptedAt: m.acceptedAt ? new Date(m.acceptedAt).getTime() : null,
  };
}

function autoScroll() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function resetState() {
  mode = null;
  currentConversationId = null;
  messagesDiv.innerHTML = "";
  setSendEnabled(false);
}

function showReconnecting() {
  if (isReconnecting) return;
  isReconnecting = true;
  connectionStatusDiv.style.display = "flex";
}

function hideReconnecting() {
  isReconnecting = false;
  connectionStatusDiv.style.display = "none";
}
