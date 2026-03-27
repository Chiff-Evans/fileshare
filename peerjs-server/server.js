const { PeerServer } = require("peer");
const express = require("express");
const app = express();

const server = app.listen(process.env.PORT || 9001);

const peerServer = PeerServer({
  port: process.env.PORT || 9001,
  path: "/peerjs",
  proxied: true,
});

app.use("/peerjs", peerServer);

console.log("PeerJS server running on port", process.env.PORT || 9001);
