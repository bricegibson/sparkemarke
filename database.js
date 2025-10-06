const Database = require("better-sqlite3");

// Open or create the database file synchronously
const db = new Database("/var/data/students.db");

// Log a confirmation message once opened
console.log("✅ Connected to SQLite database (better-sqlite3).");


    db.prepare(`
      CREATE TABLE IF NOT EXISTS studentGoals (
        studentID TEXT NOT NULL,
        studentSubjectID INTEGER NOT NULL,
        studentGoal REAL NOT NULL,
        PRIMARY KEY (studentID, studentSubjectID)
      )
    `).run();
    
module.exports = db;
