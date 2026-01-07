# websocket-app-demo

## Demo
Simple real-time chat application using **WebSocket**.

Features:
- Real-time messaging
- Typing indicator
- Message status: `sent` / `seen` / `sending`
- Auto reconnect WebSocket

---

## Requirements
- **Node.js** >= 18
- **npm** >= 9
- **MongoDB** (Local or MongoDB Atlas)
- Modern browser (Chrome, Edge, Firefox)

---

## Install & Run Project

### Clone repository
```bash
git clone https://github.com/PhuHoang07/websocket-app-demo.git
cd websocket-app-demo
```

### Install backend dependencies
```bash
npm intall
```

### Environment variables
Create a `.env` file inside the folder
```env
PORT=YOUR PORT
MONGO_URI=YOUR DB URI
```

### Run demo
```bash
npm start
```
Open  `http://localhost:3000/views/index.html` (replace `3000` with your port)

---

## Usage
- Open 2 browser tabs to simulate 2 users
- Send messages in real-time
- Message status:
  - `sent`: receiver is offline
  - `seen`: receiver joins or reads message
- Typing indicator appears when the other user is typing

## Tech Stack

### Backend
- Node.js
- WebSocket
- MongoDB

### Frontend
- HTML
- CSS
- JavaScript

## References
- WebSocket MDN: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- Mongoose: https://mongoosejs.com/
- Redis: https://github.com/redis/node-redis?tab=readme-ov-file




