const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");

const db = new sqlite3.Database("./students.db");


// Initialize tables
db.serialize(() => {

    db.run(`
    CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        adminUsername TEXT UNIQUE NOT NULL,
        adminPassword TEXT NOT NULL
    )
    `);

});

async function addAdmin(username, plainPassword) {
  const hashedPassword = await bcrypt.hash(plainPassword, 10);
  db.run(`INSERT INTO admins (adminUsername, adminPassword) VALUES (?, ?)`, [username, hashedPassword], (err) => {
    if (err) {
      console.error(err);
    } else {
      console.log("Admin added successfully.");
    }
    db.close();
  });
}

addAdmin("brice", "Starf1shing0!");