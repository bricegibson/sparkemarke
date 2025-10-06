const path = require("path");
const Database = require("better-sqlite3");
const fs = require("fs");

// Detect environment: Render (Linux) or local (Windows/macOS)
let dbPath;

// Render persistent disk
if (fs.existsSync("/var/data")) {
  dbPath = "/var/data/students.db";
} else {
  // Local fallback
  dbPath = path.join(__dirname, "var/data/students.db");
}

// Open database
const db = new Database(dbPath);

console.log(`✅ Connected to database at ${dbPath}`);

module.exports = db;
