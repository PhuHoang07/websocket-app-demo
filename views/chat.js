/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

const messagesDiv = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const messages = [];
const connectionStatusDiv = document.getElementById("connectionStatus");
const typingUsers = new Set();
const typingTimers = new Map();
const typingDiv = document.getElementById("typing");

let isReconnecting = false;
let currentConversationId = null;
let username = null;
let mode = null; // "JOIN" | "VIEW"
let ws;
let lastJoinPayload = null;
let retryMessageQueue = [];
let isRetrying = false;
let isTyping = false;
let typingTimeout = null;
let typingListenerAttached = false;
let typingInterval = null;
let pingInterval = null;
connectWebSocket();

function connectWebSocket() {
  const wsUrl =
    (location.protocol === "https:" ? "wss://" : "ws://") + location.host;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    hideReconnecting();
    addSystemMessage("Connected to " + wsUrl);
    startPing();

    if (mode === CONSTANTS.WS_IN.JOIN && lastJoinPayload) {
      ws.send(JSON.stringify(lastJoinPayload));
    }
  };

  ws.onmessage = handleMessage;
  ws.onclose = () => {
    showReconnecting();
    stopTyping();
    stopPing();
    setTimeout(connectWebSocket, CONSTANTS.TIMES.WEBSOCKET_TIMEOUT);
  };
}

function startPing() {
  if (pingInterval) return;

  pingInterval = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: CONSTANTS.WS_IN.PING }));
    }
  }, CONSTANTS.TIMES.PING_TIME);
}

function stopPing() {
  if (!pingInterval) return;

  clearInterval(pingInterval);
  pingInterval = null;
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

function setSendEnabled(enabled) {
  messageInput.disabled = !enabled;
}

function handleMessage(e) {
  const messageData = JSON.parse(e.data);

  switch (messageData.type) {
    case CONSTANTS.WS_OUT.CONVERSATION_CREATED:
      currentConversationId = messageData.conversationId;
      addSystemMessage(`Conversation created: ${messageData.conversationId}`);
      break;

    case CONSTANTS.WS_OUT.JOIN_SUCCESS:
      mode = CONSTANTS.WS_IN.JOIN;
      currentConversationId = messageData.conversationId;
      addSystemMessage("Joined conversation");
      setSendEnabled(true);

      attachTypingListener();
      retryPendingMessages();
      break;

    case CONSTANTS.WS_OUT.JOIN_REFUSED:
      addSystemMessage("Join refused: " + messageData.reason);
      break;

    case CONSTANTS.WS_OUT.HISTORY: {
      const { data, lastSeenMessageId } = messageData;

      const pendingMessages = getPendingMessages();

      const historyMessages = data.map((messageItem) => {
        let status = CONSTANTS.MESSAGE_STATUS.SENT;

        if (
          messageItem.senderName === username &&
          messageItem.clientMessageId === lastSeenMessageId
        ) {
          status = CONSTANTS.MESSAGE_STATUS.SEEN;
        }

        return normalizeServerMessage({
          id: messageItem.clientMessageId,
          senderName: messageItem.senderName,
          content: messageItem.content,
          clientCreatedAt: messageItem.clientCreatedAt,
          acceptedAt: messageItem.acceptedAt,
          status,
        });
      });

      const historyIds = new Set(historyMessages.map((m) => m.id));

      const safePending = pendingMessages.filter((m) => !historyIds.has(m.id));

      messages.length = 0;
      messages.push(...historyMessages, ...safePending);

      sortMessages();
      renderMessages();
      retryPendingMessages();
      break;
    }

    case CONSTANTS.WS_OUT.NEW_MESSAGE: {
      const index = messages.findIndex(
        (message) => message.id === messageData.data.clientMessageId,
      );

      if (index !== -1) {
        messages[index].status = CONSTANTS.MESSAGE_STATUS.SENT;
        messages[index].acceptedAt = new Date(
          messageData.data.acceptedAt,
        ).getTime();
      } else {
        messages.push(
          normalizeServerMessage({
            id: messageData.data.clientMessageId,
            senderName: messageData.data.senderName,
            content: messageData.data.content,
            clientCreatedAt: messageData.data.clientCreatedAt,
            acceptedAt: messageData.data.acceptedAt,
            status: CONSTANTS.MESSAGE_STATUS.SENT,
          }),
        );
      }
      sortMessages();
      renderMessages();
      break;
    }

    case CONSTANTS.WS_OUT.SYSTEM:
      addSystemMessage(messageData.message);
      autoScroll();
      break;

    case CONSTANTS.WS_OUT.MESSAGE_SENT: {
      const index = messages.findIndex(
        (message) => message.id === messageData.tempId,
      );
      if (index === -1) return;

      messages[index].status = CONSTANTS.MESSAGE_STATUS.SENT;

      if (
        retryMessageQueue.length &&
        retryMessageQueue[0].id === messageData.tempId
      ) {
        retryMessageQueue.shift();
      }

      renderMessages();
      processRetryQueue();
      break;
    }

    case CONSTANTS.WS_OUT.TYPING: {
      const { username } = messageData.data;

      typingUsers.add(username);

      clearTimeout(typingTimers.get(username));
      typingTimers.set(
        username,
        setTimeout(() => {
          typingUsers.delete(username);
          renderTyping();
        }, CONSTANTS.TIMES.DELETE_TYPING),
      );

      renderTyping();
      break;
    }

    case CONSTANTS.WS_OUT.MESSAGE_SEEN: {
      const { clientMessageId, seenBy } = messageData;

      if (seenBy === username) break;

      const lastOwnMessage = [...messages]
        .reverse()
        .find(
          (message) => message.senderName === username && message.acceptedAt,
        );

      if (lastOwnMessage && lastOwnMessage.id === clientMessageId) {
        lastOwnMessage.status = CONSTANTS.MESSAGE_STATUS.SEEN;
        renderMessages();
      }

      break;
    }
  }
}

function retryPendingMessages() {
  if (isRetrying || ws?.readyState !== WebSocket.OPEN) return;

  const RETRY_STATUS = [
    CONSTANTS.MESSAGE_STATUS.SENDING,
    CONSTANTS.MESSAGE_STATUS.RETRYING,
  ];

  retryMessageQueue = messages
    .filter(
      (message) => !message.acceptedAt && RETRY_STATUS.includes(message.status),
    )
    .sort((a, b) => a.clientCreatedAt - b.clientCreatedAt);

  processRetryQueue();
}

function processRetryQueue() {
  if (retryMessageQueue.length === 0) {
    isRetrying = false;
    return;
  }

  isRetrying = true;
  const message = retryMessageQueue[0];

  if (message.retryCount >= CONSTANTS.RETRY_MAX_TIMES) {
    message.status = CONSTANTS.MESSAGE_STATUS.FAILED;
    retryMessageQueue.shift();
    return processRetryQueue();
  }

  message.retryCount++;
  message.status = CONSTANTS.MESSAGE_STATUS.RETRYING;

  sendMessageToServer(message);
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
  stopTyping();

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

  const lastMessage = messages.at(-1);

  messages.forEach((message) => {
    const div = document.createElement("div");
    div.className = "msg";

    const text = document.createElement("span");
    let prefix = "";

    if (message.acceptedAt) {
      prefix = `[${formatTime(message.acceptedAt)}] `;
    }

    text.textContent = `${prefix}${message.senderName}: ${message.content}`;
    div.appendChild(text);

    if (
      lastMessage &&
      message === lastMessage &&
      message.senderName === username
    ) {
      const status = document.createElement("span");
      status.className = "msg-status";

      const statusMap = {
        sent: "sent",
        seen: "seen",
        sending: "sending...",
        retrying: `retrying (${message.retryCount || 0})`,
        failed: "failed",
      };

      status.textContent = statusMap[message.status];
      div.appendChild(status);
    }

    messagesDiv.appendChild(div);
  });

  autoScroll();
}

function getPendingMessages() {
  const PENDING_STATUSES = [
    CONSTANTS.MESSAGE_STATUS.SENDING,
    CONSTANTS.MESSAGE_STATUS.RETRYING,
  ];

  return messages.filter((message) =>
    PENDING_STATUSES.includes(message.status),
  );
}

function normalizeServerMessage(message) {
  return {
    ...message,
    clientCreatedAt: new Date(message.clientCreatedAt).getTime(),
    acceptedAt: message.acceptedAt
      ? new Date(message.acceptedAt).getTime()
      : null,
  };
}

function attachTypingListener() {
  if (typingListenerAttached) return;
  typingListenerAttached = true;

  messageInput.addEventListener("input", onTypingInput);
  messageInput.addEventListener("blur", () => {
    stopTyping();
  });
}

function onTypingInput() {
  if (mode !== CONSTANTS.WS_IN.JOIN) return;
  if (ws.readyState !== WebSocket.OPEN) return;

  if (messageInput.value.trim() === "") {
    stopTyping();
    return;
  }

  if (!isTyping) {
    isTyping = true;
    ws.send(JSON.stringify({ type: CONSTANTS.WS_IN.TYPING }));
  }

  if (!typingInterval) {
    typingInterval = setInterval(() => {
      if (isTyping && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: CONSTANTS.WS_IN.TYPING }));
      }
    }, CONSTANTS.TIMES.TYPING_INTERVAL);
  }

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(stopTyping, CONSTANTS.TIMES.TYPING_TIMEOUT);
}

function stopTyping() {
  if (!isTyping) return;

  isTyping = false;

  clearInterval(typingInterval);
  typingInterval = null;

  clearTimeout(typingTimeout);
  typingTimeout = null;
}

function renderTyping() {
  typingDiv.innerHTML = "";

  if (typingUsers.size === 0) return;

  typingDiv.textContent = [...typingUsers].join(", ") + " is typing...";
}

function autoScroll() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function resetState() {
  mode = null;
  currentConversationId = null;
  messagesDiv.innerHTML = "";
  setSendEnabled(false);

  isTyping = false;

  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = null;

  if (typingInterval) clearInterval(typingInterval);
  typingInterval = null;

  typingUsers.clear();
  typingTimers.forEach((t) => clearTimeout(t));
  typingTimers.clear();

  typingListenerAttached = false;

  renderTyping();
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
