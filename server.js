const { PeerServer } = require("peer");
const http = require("http");

const PORT = process.env.PORT || 9999;

const peerServer = PeerServer({
  port: PORT,
  path: "/peerjs",
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  },
});

console.log("PeerJS server running on port", PORT);
