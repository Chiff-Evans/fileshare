const { PeerServer } = require("peer");
const express = require("express");
const app = express();

const PORT = process.env.PORT || 9999;
const server = app.listen(PORT);

const peerServer = PeerServer({
  server: server,
  path: "/peerjs",
});

console.log("PeerJS server running on port", PORT);
