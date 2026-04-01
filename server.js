const express = require("express");
const { ExpressPeerServer } = require("peer");
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 9999;

const certPath =
  process.env.SSL_CERT ||
  "/etc/letsencrypt/live/sendmaster.masterbrainssolutions.com/fullchain.pem";
const keyPath =
  process.env.SSL_KEY ||
  "/etc/letsencrypt/live/sendmaster.masterbrainssolutions.com/privkey.pem";

const app = express();

// Serve static files (index.html, test.html, etc.)
app.use(express.static(path.join(__dirname)));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    transport: useHttps ? "https" : "http",
  });
});

const useHttps = fs.existsSync(certPath) && fs.existsSync(keyPath);

let server;
if (useHttps) {
  const options = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
  server = https.createServer(options, app);
  console.log(`Server running on port ${PORT} with HTTPS`);
} else {
  server = http.createServer(app);
  console.log(`Server running on port ${PORT} with HTTP (no SSL certs found)`);
}

// Attach PeerJS to Express using ExpressPeerServer
const peerServer = ExpressPeerServer(server, {
  path: "/",
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  },
});

app.use("/peerjs", peerServer);

peerServer.on("connection", (client) => {
  console.log(`Peer connected: ${client.getId()}`);
});
peerServer.on("disconnect", (client) => {
  console.log(`Peer disconnected: ${client.getId()}`);
});

server.listen(PORT, () => {
  console.log(`PeerJS endpoint: /peerjs`);
  console.log(`Health check:    /health`);
  console.log(`App served at:   /`);
});
