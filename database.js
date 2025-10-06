const Database = require("better-sqlite3");

// Open or create the database file synchronously
const db = new Database("./students.db");

// Log a confirmation message once opened
console.log("✅ Connected to SQLite database (better-sqlite3).");

// Optional: enforce foreign keys if you use them
db.pragma("foreign_keys = ON");

  // Students table
  db.prepare(`
    drop table if exists students
  `).run(); 

  db.prepare(`
    CREATE TABLE IF NOT EXISTS students (
      studentID TEXT PRIMARY KEY,
      studentName TEXT NOT NULL,
      studentTeacherID TEXT NOT NULL
    )
  `).run();

  // Scores table
  db.prepare(`
    drop table if exists scores
  `).run(); 

  db.prepare(`
    CREATE TABLE IF NOT EXISTS scores (
      scoreID INTEGER PRIMARY KEY AUTOINCREMENT,
      scoreStudentID TEXT NOT NULL,
      scoreTeacherID TEXT NOT NULL,
      scoreSubjectID TEXT NOT NULL,
      scoreDate TEXT NOT NULL,
      scoreValue INTEGER NOT NULL,
      scorePossible INTEGER NULL,
      scoreActual REAL NULL
      )
  `).run();

    db.prepare(`
      drop table if exists studentGoals
    `).run();    

    db.prepare(`
      CREATE TABLE IF NOT EXISTS studentGoals (
        studentID TEXT NOT NULL,
        studentSubjectID INTEGER NOT NULL,
        studentGoal REAL NOT NULL,
        PRIMARY KEY (studentID, studentSubjectID)
      )
    `).run();

module.exports = db;
