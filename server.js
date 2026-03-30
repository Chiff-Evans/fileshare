const { PeerServer } = require("peer");
const express = require("express");
const app = express();

const server = app.listen(process.env.PORT || 9999);

const peerServer = PeerServer({
  port: process.env.PORT || 9999,
  path: "/peerjs",
});

console.log("PeerJS server running on port", process.env.PORT || 9999);
