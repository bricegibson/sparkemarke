const Database = require("better-sqlite3");

// Open or create the database file synchronously
const db = new Database("./students.db");

// Log a confirmation message once opened
console.log("✅ Connected to SQLite database (better-sqlite3).");

module.exports = db;
