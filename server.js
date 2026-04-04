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

// Client config — tells the browser which port/host to use for PeerJS
app.get("/config.json", (req, res) => {
  res.json({
    peerHost: process.env.PEER_HOST || null, // e.g. "sendmaster.masterbrainssolutions.com"
    peerPort: parseInt(process.env.PORT || PORT, 10),
    peerPath: "/peerjs",
    secure: useHttps,
  });
});

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
  console.log(
    `App served at:   http${useHttps ? "s" : ""}://localhost:${PORT}`,
  );
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌  Port ${PORT} is already in use.`);
    console.error(`    Run:  netstat -ano | findstr :${PORT}`);
    console.error(`    Then: taskkill /PID <pid> /F\n`);
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});
