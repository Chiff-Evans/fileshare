const { PeerServer } = require("peer");
const express = require("express");
const app = express();

const PORT = process.env.PORT || 9999;
const server = app.listen(PORT);

// Enable CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

const peerServer = PeerServer({
  server: server,
  path: "/peerjs",
});

console.log("PeerJS server running on port", PORT);
