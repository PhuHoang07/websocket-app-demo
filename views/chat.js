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

function addChatMessage(sender, content, createdAt) {
  const div = document.createElement("div");
  div.className = "msg";

  const time = createdAt ? formatTime(createdAt) : "";
  div.textContent = `[${time}] ${sender}: ${content}`;

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

      const historyMessages = message.data.map((m) => ({
        id: m.clientMessageId,
        senderName: m.senderName,
        content: m.content,
        createdAt: m.createdAt,
        status: CONSTANTS.MESSAGE_STATUS.SENT,
      }));

      messages.length = 0;
      messages.push(...historyMessages, ...pending);

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
        messages[index].createdAt = message.data.createdAt;
      } else {
        messages.push({
          id: message.data.clientMessageId,
          senderName: message.data.senderName,
          content: message.data.content,
          createdAt: message.data.createdAt,
          status: CONSTANTS.MESSAGE_STATUS.SENT,
        });
      }
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
      messages[index].createdAt = message.data.createdAt;

      sortMessages();
      renderMessages();
      break;
    }
  }
}

function retryPendingMessages() {
  if (ws.readyState !== WebSocket.OPEN) return;

  const pending = messages.filter(
    (m) =>
      m.status === CONSTANTS.MESSAGE_STATUS.SENDING ||
      m.status === CONSTANTS.MESSAGE_STATUS.RETRYING,
  );

  pending.sort((a, b) => a.clientCreatedAt - b.clientCreatedAt);

  pending.forEach((m) => {
    if (m.retryCount >= 2) {
      m.status = CONSTANTS.MESSAGE_STATUS.FAILED;
      return;
    }
    m.status = CONSTANTS.MESSAGE_STATUS.RETRYING;
    m.retryCount++;
    sendMessageToServer(m);
  });

  renderMessages();
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
    createdAt: null,
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
    const timeA = a.clientCreatedAt || a.createdAt || 0;
    const timeB = b.clientCreatedAt || b.createdAt || 0;
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

    if (m.createdAt) {
      prefix = `[${formatTime(m.createdAt)}] `;
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
