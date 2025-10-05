const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./students.db");

// Initialize tables
db.serialize(() => {
  // Schools table
  db.run(`
    CREATE TABLE IF NOT EXISTS schools (
      schoolID TEXT PRIMARY KEY,
      schoolName TEXT NOT NULL
    )
  `);

  // Teachers table
  db.run(`
    CREATE TABLE IF NOT EXISTS teachers (
      teacherID TEXT PRIMARY KEY,
      teacherName TEXT NOT NULL,
      teacherPassword TEXT NULL,
      teacherSchoolID TEXT NOT NULL
    )
  `);

  // Students table
  db.run(`
    CREATE TABLE IF NOT EXISTS students (
      studentID TEXT PRIMARY KEY,
      studentName TEXT NOT NULL,
      studentTeacherID TEXT NOT NULL
    )
  `);

  // Subjects table (optional, could also just store in scores)
  db.run(`
    CREATE TABLE IF NOT EXISTS subjects (
      subjectID INTEGER PRIMARY KEY AUTOINCREMENT,
      subjectTeacherID TEXT NOT NULL,
      subjectName TEXT NOT NULL
    )
  `);

  // Scores table
  db.run(`
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
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        adminUsername TEXT UNIQUE NOT NULL,
        adminPassword TEXT NOT NULL
    )
    `);

    db.run(`
    CREATE TABLE IF NOT EXISTS codes (
        codeID INTEGER PRIMARY KEY AUTOINCREMENT,
        codeTeacherID TEXT NOT NULL,
        codeText TEXT NOT NULL,
        codeCreatedDate DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);    
});

module.exports = db;
