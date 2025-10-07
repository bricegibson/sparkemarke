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

// Function to check if a column exists, and add it if missing
function ensureColumnExists(table, column, type) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some(c => c.name === column);
  if (!exists) {
    console.log(`🧱 Adding missing column '${column}' to ${table}...`);
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
  } else {
    console.log(`✅ Column '${column}' already exists in ${table}.`);
  }
}

function ensureTableExists(table, createSQL) {
  const row = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(table);
  if (!row) {
    console.log(`🆕 Creating missing table '${table}'...`);
    db.exec(createSQL);
  } else {
    console.log(`✅ Table '${table}' already exists.`);
  }
}

db.prepare(`UPDATE schools SET schoolName = 'Wolverine Elementary' WHERE schoolID = '1DCDWE'`).run();

function migrateDatabase() {
  console.log("🔍 Running database migration checks...");

  // --- Ensure core tables exist ---
  // ensureTableExists("teachers", `
  //   CREATE TABLE IF NOT EXISTS teachers (
  //     teacherID TEXT PRIMARY KEY,
  //     teacherName TEXT NOT NULL,
  //     teacherPassword TEXT NULL,
  //     teacherSchoolID TEXT NOT NULL,
  //     teacherGradeLevel TEXT NULL,
  //     teacherEmail TEXT NULL
  //   );
  // `);

  // ensureTableExists("students", `
  //   CREATE TABLE IF NOT EXISTS students (
  //     studentID TEXT PRIMARY KEY,
  //     studentName TEXT NOT NULL,
  //     studentTeacherID TEXT NOT NULL
  //   );
  // `);

  // ensureTableExists("schools", `
  //   CREATE TABLE IF NOT EXISTS schools (
  //     schoolID TEXT PRIMARY KEY,
  //     schoolName TEXT NOT NULL
  //   );
  // `);

  // ensureTableExists("subjects", `
  //   CREATE TABLE IF NOT EXISTS subjects (
  //     subjectID INTEGER PRIMARY KEY AUTOINCREMENT,
  //     subjectTeacherID TEXT NOT NULL,
  //     subjectName TEXT NOT NULL
  //   );
  // `);

  // ensureTableExists("codes", `
  //   CREATE TABLE IF NOT EXISTS codes (
  //       codeID INTEGER PRIMARY KEY AUTOINCREMENT,
  //       codeTeacherID TEXT NOT NULL,
  //       codeText TEXT NOT NULL,
  //       codeCreatedDate DATETIME DEFAULT (datetime('now','localtime'))
  //   );
  // `);

  // ensureTableExists("scores", `
  //   CREATE TABLE IF NOT EXISTS scores (
  //     scoreID INTEGER PRIMARY KEY AUTOINCREMENT,
  //     scoreStudentID TEXT NOT NULL,
  //     scoreTeacherID TEXT NOT NULL,
  //     scoreSubjectID TEXT NOT NULL,
  //     scoreDate TEXT NOT NULL,
  //     scoreValue INTEGER NOT NULL,
  //     scorePossible INTEGER NULL,
  //     scoreActual REAL NULL
  //     );
  // `);

  // ensureTableExists("admins", `
  //   CREATE TABLE IF NOT EXISTS admins (
  //       id INTEGER PRIMARY KEY AUTOINCREMENT,
  //       adminUsername TEXT UNIQUE NOT NULL,
  //       adminPassword TEXT NOT NULL
  //   );
  // `);

  // --- Ensure new columns exist on existing tables ---
  // ensureColumnExists("teachers", "teacherGradeLevel", "TEXT");
  // ensureColumnExists("teachers", "teacherEmail", "TEXT");
  // ensureColumnExists("codes", "codeCreatedDate", "DATETIME DEFAULT (datetime('now','localtime'))");

  console.log("✅ Database migration complete.");
}

console.log(`✅ Connected to database at ${dbPath}`);

module.exports = { db, migrateDatabase };
