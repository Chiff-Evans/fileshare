require("dotenv").config();
const express = require("express");
const { ExpressPeerServer } = require("peer");
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const mysql = require("mysql2/promise");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const cron = require("node-cron");

// ─── Config ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 9999;
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_USER = process.env.DB_USER || "root";
const DB_PASS = process.env.DB_PASS || "1234";
const DB_NAME = process.env.DB_NAME || "fileshare";

const certPath =
  process.env.SSL_CERT ||
  "/etc/letsencrypt/live/sendmaster.masterbrainssolutions.com/fullchain.pem";
const keyPath =
  process.env.SSL_KEY ||
  "/etc/letsencrypt/live/sendmaster.masterbrainssolutions.com/privkey.pem";

const useHttps = fs.existsSync(certPath) && fs.existsSync(keyPath);

// ─── MySQL pool ───────────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ─── DB init ──────────────────────────────────────────────────────────────────
async function initDB() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS uploads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        token VARCHAR(64) UNIQUE NOT NULL,
        created_at DATETIME DEFAULT NOW(),
        expires_at DATETIME NOT NULL,
        uploader_ip VARCHAR(45),
        total_size BIGINT DEFAULT 0,
        download_count INT DEFAULT 0
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS files (
        id INT AUTO_INCREMENT PRIMARY KEY,
        upload_id INT NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        stored_name VARCHAR(255) NOT NULL,
        size BIGINT NOT NULL,
        mime_type VARCHAR(100),
        FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS downloads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        upload_id INT NOT NULL,
        file_id INT NULL,
        downloaded_at DATETIME DEFAULT NOW(),
        downloader_ip VARCHAR(45),
        FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE
      )
    `);
    console.log("Database tables ready.");
  } finally {
    conn.release();
  }
}

// ─── Cleanup expired uploads ──────────────────────────────────────────────────
async function cleanupExpired() {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      "SELECT id, token FROM uploads WHERE expires_at < NOW()",
    );
    for (const row of rows) {
      const dir = path.join(__dirname, "uploads", row.token);
      try {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      } catch (e) {
        console.error(
          `Failed to remove dir for token ${row.token}:`,
          e.message,
        );
      }
    }
    if (rows.length > 0) {
      await conn.query("DELETE FROM uploads WHERE expires_at < NOW()");
      console.log(`Cleaned up ${rows.length} expired upload(s).`);
    }
  } catch (e) {
    console.error("Cleanup error:", e.message);
  } finally {
    conn.release();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// ─── Multer setup ─────────────────────────────────────────────────────────────
// Middleware to generate upload token and create directory before multer runs
function prepareUpload(req, res, next) {
  req.uploadToken = uuidv4();
  const dir = path.join(__dirname, "uploads", req.uploadToken);
  fs.mkdirSync(dir, { recursive: true });
  next();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "uploads", req.uploadToken));
  },
  filename: (req, file, cb) => {
    cb(null, sanitizeFilename(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5 GB
});

// ─── Express app ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// ─── GET /d/:token — serve index.html (JS reads token from pathname) ─────────
app.get("/d/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ─── POST /upload ─────────────────────────────────────────────────────────────
app.post("/upload", prepareUpload, upload.array("files"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files provided." });
    }

    const token = req.uploadToken;
    const uploaderIp =
      req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
      req.socket.remoteAddress ||
      null;

    const totalSize = req.files.reduce((acc, f) => acc + f.size, 0);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const conn = await pool.getConnection();
    try {
      const [uploadResult] = await conn.query(
        `INSERT INTO uploads (token, expires_at, uploader_ip, total_size)
         VALUES (?, ?, ?, ?)`,
        [token, expiresAt, uploaderIp, totalSize],
      );
      const uploadId = uploadResult.insertId;

      for (const file of req.files) {
        await conn.query(
          `INSERT INTO files (upload_id, original_name, stored_name, size, mime_type)
           VALUES (?, ?, ?, ?, ?)`,
          [
            uploadId,
            file.originalname,
            file.filename,
            file.size,
            file.mimetype || "application/octet-stream",
          ],
        );
      }

      const downloadUrl = `${req.protocol}://${req.get("host")}/d/${token}`;
      return res.json({
        token,
        downloadUrl,
        expiresAt: expiresAt.toISOString(),
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: "Upload failed." });
  }
});

// ─── GET /d/:token/info ───────────────────────────────────────────────────────
app.get("/d/:token/info", async (req, res) => {
  const { token } = req.params;
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query("SELECT * FROM uploads WHERE token = ?", [
      token,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Upload not found." });
    }
    const upload = rows[0];
    if (new Date(upload.expires_at) < new Date()) {
      return res.status(410).json({ error: "This upload has expired." });
    }

    const [files] = await conn.query(
      "SELECT id, original_name, stored_name, size, mime_type FROM files WHERE upload_id = ?",
      [upload.id],
    );

    return res.json({
      token: upload.token,
      createdAt: upload.created_at,
      expiresAt: upload.expires_at,
      totalSize: upload.total_size,
      downloadCount: upload.download_count,
      files: files.map((f) => ({
        id: f.id,
        name: f.original_name,
        storedName: f.stored_name,
        size: f.size,
        mimeType: f.mime_type,
      })),
    });
  } catch (err) {
    console.error("Info error:", err);
    return res.status(500).json({ error: "Server error." });
  } finally {
    conn.release();
  }
});

// ─── GET /d/:token/file/:fileId ───────────────────────────────────────────────
app.get("/d/:token/file/:fileId", async (req, res) => {
  const { token, fileId } = req.params;
  const conn = await pool.getConnection();
  try {
    const [uploadRows] = await conn.query(
      "SELECT * FROM uploads WHERE token = ?",
      [token],
    );
    if (uploadRows.length === 0) {
      return res.status(404).json({ error: "Upload not found." });
    }
    const uploadRecord = uploadRows[0];
    if (new Date(uploadRecord.expires_at) < new Date()) {
      return res.status(410).json({ error: "This upload has expired." });
    }

    const [fileRows] = await conn.query(
      "SELECT * FROM files WHERE id = ? AND upload_id = ?",
      [fileId, uploadRecord.id],
    );
    if (fileRows.length === 0) {
      return res.status(404).json({ error: "File not found." });
    }
    const fileRecord = fileRows[0];

    const filePath = path.join(
      __dirname,
      "uploads",
      token,
      fileRecord.stored_name,
    );
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found on disk." });
    }

    const downloaderIp =
      req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
      req.socket.remoteAddress ||
      null;

    await conn.query(
      "INSERT INTO downloads (upload_id, file_id, downloader_ip) VALUES (?, ?, ?)",
      [uploadRecord.id, fileRecord.id, downloaderIp],
    );

    await conn.query(
      "UPDATE uploads SET download_count = download_count + 1 WHERE id = ?",
      [uploadRecord.id],
    );

    const stat = fs.statSync(filePath);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileRecord.original_name)}"`,
    );
    res.setHeader(
      "Content-Type",
      fileRecord.mime_type || "application/octet-stream",
    );
    res.setHeader("Content-Length", stat.size);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    console.error("Download error:", err);
    return res.status(500).json({ error: "Server error." });
  } finally {
    conn.release();
  }
});

// ─── GET /config.json ─────────────────────────────────────────────────────────
app.get("/config.json", (req, res) => {
  // Use the external-facing port (from Host header), not the internal PORT.
  // When behind Apache/nginx on 443, Host has no port suffix → default to 443/80.
  const proto = req.headers["x-forwarded-proto"] || (useHttps ? "https" : "http");
  const hostHeader = req.get("host") || "";
  const externalPort = hostHeader.includes(":")
    ? parseInt(hostHeader.split(":")[1], 10)
    : proto === "https" ? 443 : 80;

  res.json({
    peerHost: process.env.PEER_HOST || null,
    peerPort: externalPort,
    peerPath: "/",
    secure: proto === "https",
    localIP: getLocalIP(),
  });
});

// ─── GET /health ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    transport: useHttps ? "https" : "http",
  });
});

// ─── Static files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));

// ─── HTTP/HTTPS server ────────────────────────────────────────────────────────
let server;
if (useHttps) {
  const options = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
  server = https.createServer(options, app);
  console.log(`HTTPS mode — using certs from ${certPath}`);
} else {
  server = http.createServer(app);
  console.log(`HTTP mode (no SSL certs found at ${certPath})`);
}

// ─── PeerJS signalling server ─────────────────────────────────────────────────
const peerServer = ExpressPeerServer(server, {
  path: "/",
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  },
});

app.use("/", peerServer);

peerServer.on("connection", (client) => {
  console.log(`Peer connected: ${client.getId()}`);
});
peerServer.on("disconnect", (client) => {
  console.log(`Peer disconnected: ${client.getId()}`);
});

// ─── Cron: cleanup every hour ─────────────────────────────────────────────────
cron.schedule("0 * * * *", () => {
  console.log("Running scheduled cleanup of expired uploads…");
  cleanupExpired().catch((e) =>
    console.error("Cron cleanup error:", e.message),
  );
});

// ─── Server error handler ─────────────────────────────────────────────────────
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\nPort ${PORT} is already in use.`);
    console.error(`Run:  netstat -ano | findstr :${PORT}`);
    console.error(`Then: taskkill /PID <pid> /F\n`);
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});

// ─── Start ────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await initDB();
    await cleanupExpired();
    server.listen(PORT, () => {
      console.log(`\nSendMaster v2 running on port ${PORT}`);
      console.log(`Transport: ${useHttps ? "HTTPS" : "HTTP"}`);
      console.log(`Local IP: ${getLocalIP()}`);
      console.log(`App: http${useHttps ? "s" : ""}://localhost:${PORT}`);
      console.log(`Health: /health`);
      console.log(`PeerJS: /peerjs`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
})();
