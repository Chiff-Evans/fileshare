-- Run once to create the database and user
-- mysql -u root -p < db.sql

CREATE DATABASE IF NOT EXISTS fileshare CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fileshare;

CREATE TABLE IF NOT EXISTS uploads (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  token         VARCHAR(64) UNIQUE NOT NULL,
  created_at    DATETIME DEFAULT NOW(),
  expires_at    DATETIME NOT NULL,
  uploader_ip   VARCHAR(45),
  total_size    BIGINT DEFAULT 0,
  download_count INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS files (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  upload_id     INT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name   VARCHAR(255) NOT NULL,
  size          BIGINT NOT NULL,
  mime_type     VARCHAR(100),
  FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS downloads (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  upload_id      INT NOT NULL,
  file_id        INT NULL,
  downloaded_at  DATETIME DEFAULT NOW(),
  downloader_ip  VARCHAR(45),
  FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE
);
