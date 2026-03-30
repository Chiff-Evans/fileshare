const { PeerServer } = require("peer");
const https = require("https");
const http = require("http");
const fs = require("fs");

const PORT = process.env.PORT || 9999;

// Check if SSL certificates exist for HTTPS
const certPath =
  process.env.SSL_CERT ||
  "/etc/letsencrypt/live/sendmaster.masterbrainssolutions.com/fullchain.pem";
const keyPath =
  process.env.SSL_KEY ||
  "/etc/letsencrypt/live/sendmaster.masterbrainssolutions.com/privkey.pem";

let server;

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  // Use HTTPS if certificates are available
  const options = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
  server = https.createServer(options);
  console.log("PeerJS server running on port", PORT, "with HTTPS");
} else {
  // Fall back to HTTP for local development
  server = http.createServer();
  console.log(
    "PeerJS server running on port",
    PORT,
    "with HTTP (no SSL certificates found)",
  );
}

server.listen(PORT);

const peerServer = PeerServer({
  server: server,
  path: "/peerjs",
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  },
});

console.log("PeerJS endpoints available at: /peerjs/id, /peerjs/peers, etc.");
