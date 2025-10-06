const Database = require("better-sqlite3");

// Open or create the database file synchronously
const db = new Database("./students.db");

// Log a confirmation message once opened
console.log("✅ Connected to SQLite database (better-sqlite3).");

// Optional: enforce foreign keys if you use them
db.pragma("foreign_keys = ON");

  db.prepare(`
    drop table if exists schools;
    CREATE TABLE IF NOT EXISTS schools (
      schoolID TEXT PRIMARY KEY,
      schoolName TEXT NOT NULL
    )
  `).run();

  // Teachers table
  db.prepare(`
    drop table if exists teachers;
    CREATE TABLE IF NOT EXISTS teachers (
      teacherID TEXT PRIMARY KEY,
      teacherName TEXT NOT NULL,
      teacherPassword TEXT NULL,
      teacherSchoolID TEXT NOT NULL
    )
  `).run();

  // Students table
  db.prepare(`
    drop table if exists students;
    CREATE TABLE IF NOT EXISTS students (
      studentID TEXT PRIMARY KEY,
      studentName TEXT NOT NULL,
      studentTeacherID TEXT NOT NULL
    )
  `).run();

  // Subjects table (optional, could also just store in scores)
  db.prepare(`
    drop table if exists subjects;
    CREATE TABLE IF NOT EXISTS subjects (
      subjectID INTEGER PRIMARY KEY AUTOINCREMENT,
      subjectTeacherID TEXT NOT NULL,
      subjectName TEXT NOT NULL
    )
  `).run();

  // Scores table
  db.prepare(`
    drop table if exists scores;
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
      drop table if exists codes;
    CREATE TABLE IF NOT EXISTS codes (
        codeID INTEGER PRIMARY KEY AUTOINCREMENT,
        codeTeacherID TEXT NOT NULL,
        codeText TEXT NOT NULL,
        codeCreatedDate DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();  

    db.prepare(`
      drop table if exists studentGoals;
      CREATE TABLE IF NOT EXISTS studentGoals (
        studentID TEXT NOT NULL,
        studentSubjectID INTEGER NOT NULL,
        studentGoal REAL NOT NULL,
        PRIMARY KEY (studentID, studentSubjectID)
      )
    `).run();

module.exports = db;
