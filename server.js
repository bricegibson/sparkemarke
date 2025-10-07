const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const bcrypt = require("bcrypt");

const { db, migrateDatabase } = require("./database");
migrateDatabase();

const app = express();
const PORT = process.env.PORT || 3000;

process.env.TZ = "America/Denver";

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

app.use(
  session({
    secret: "thelifeofashowgirl", // change this to something strong
    resave: false,
    saveUninitialized: false,
  })
);

app.use((req, res, next) => {
  res.locals.loggedInName = req.session.teacherName || null;
  res.locals.loggedInTeacherId = req.session.teacherId || null;
  next();
});

app.use((req, res, next) => {
  res.locals.getScoreColor = getScoreColor;
  next();
});

app.use(express.json());

// ────────────────────────────────────────────────────────────────────────────────
// Middleware
// ────────────────────────────────────────────────────────────────────────────────
function requireTeacherAccess(req, res, next) {
  if (!req.session.teacherId) {
    return res.redirect("/teacher-login");
  }
  const requestedTeacherId = req.params.teacherId;
  if (requestedTeacherId !== req.session.teacherId) {
    return res.redirect("/teacher-login");
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) {
    return res.redirect("/admin-login");
  }
  next();
}

function requireStudentAccess(req, res, next) {
  const { studentId } = req.params;

  // ✅ Allow access if teacher is logged in
  if (req.session.teacherId) {
    return next();
  }

  // Otherwise, require student session
  if (!req.session.studentId || req.session.studentId != studentId) {
    return res.redirect("/");
  }

  next();
}

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────────
function generateCode(length = 5) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Assign Bootstrap classes based on score percentage (0–1)
function getScoreColor(avg, options = { background: false }) {
  if (avg == null) {
    return options.background ? "bg-light text-muted" : "text-muted";
  }
  const pct = avg * 100;

  if (pct >= 90) {
    return options.background
      ? "bg-success bg-opacity-25 text-success fw-bold"
      : "text-success fw-bold";
  }
  if (pct >= 70) {
    return options.background
      ? "bg-warning bg-opacity-25 text-warning fw-bold"
      : "text-warning fw-bold";
  }
  return options.background
    ? "bg-danger bg-opacity-25 text-danger fw-bold"
    : "text-danger fw-bold";
}

// ────────────────────────────────────────────────────────────────────────────────
// ADMIN LOGIN
// ────────────────────────────────────────────────────────────────────────────────
app.get("/admin-login", (req, res) => {
  res.render("admin-login");
});

app.post("/admin-login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const admin = db
      .prepare("SELECT * FROM admins WHERE adminUsername = ?")
      .get(username);
    if (!admin) return res.status(401).send("Invalid credentials");

    const match = await bcrypt.compare(password, admin.adminPassword);
    if (!match) return res.status(401).send("Invalid credentials");

    req.session.isAdmin = true;
    req.session.adminUsername = admin.adminUsername;
    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

app.get("/admin-logout", (req, res) => {
  req.session.destroy(() => res.redirect("/admin-login"));
});

// ────────────────────────────────────────────────────────────────────────────────
// TEACHER LOGIN
// ────────────────────────────────────────────────────────────────────────────────
app.get("/teacher-login", (req, res) => {
  res.render("teacher-login");
});

app.post("/teacher-login", async (req, res) => {
  const { teacherId, password } = req.body;
  
  // clear any student session
  req.session.studentId = null;
  req.session.studentTeacherId = null; 

  try {
    const teacher = db
      .prepare("SELECT * FROM teachers WHERE teacherID = ?")
      .get(teacherId);
    if (!teacher) return res.status(401).send("Invalid credentials");

    const match = await bcrypt.compare(password, teacher.teacherPassword);
    if (!match) return res.status(401).send("Invalid credentials");

    req.session.teacherId = teacher.teacherID;
    req.session.teacherName = teacher.teacherName;
    
    res.redirect(`/teacher/${teacher.teacherID}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

app.get("/teacher-logout", (req, res) => {
  req.session.destroy(() => res.redirect("/teacher-login"));
});

// ────────────────────────────────────────────────────────────────────────────────
// HOME + STUDENT CODE
// ────────────────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  try {
    // --- Load all teachers ---
    const teacherSql = `
      SELECT t.teacherID, t.teacherName, s.schoolName
      FROM teachers t
      LEFT JOIN schools s ON t.teacherSchoolID = s.schoolID
    `;
    const teachers = db.prepare(teacherSql).all();

    // --- Build leaderboard data ---
    const leaderboardSql = `
      SELECT
        sub.subjectID,
        sub.subjectName,
        stu.studentName,
        sch.schoolName,
        AVG(sc.scoreActual) * 100 AS avgScore
      FROM scores sc
      JOIN students stu ON sc.scoreStudentID = stu.studentID
      JOIN teachers t ON sc.scoreTeacherID = t.teacherID
      JOIN schools sch ON t.teacherSchoolID = sch.schoolID
      JOIN subjects sub ON sc.scoreSubjectID = sub.subjectID
      GROUP BY sub.subjectID, stu.studentID
      ORDER BY sub.subjectName, avgScore DESC
    `;
    const allScores = db.prepare(leaderboardSql).all();

    // --- Group top 5 students per subject ---
    const leaderboards = {};
    for (const row of allScores) {
      if (!leaderboards[row.subjectName]) leaderboards[row.subjectName] = [];
      if (leaderboards[row.subjectName].length < 5) {
        leaderboards[row.subjectName].push(row);
      }
    }

    // --- Render ---
    res.render("index", { teachers, leaderboards });

  } catch (err) {
    console.error("Error loading index:", err);
    res.status(500).send("Internal server error");
  }
});

// check if code is valid and not expired
app.post("/api/check-code", (req, res) => {
  const { code } = req.body;

  try {
    const row = db.prepare(`
      SELECT c.codeTeacherID, c.codeText, c.codeCreatedDate, t.teacherName
      FROM codes c
      JOIN teachers t ON c.codeTeacherID = t.teacherID
      WHERE c.codeText = ?
      ORDER BY c.codeCreatedDate DESC
      LIMIT 1
    `).get(code);

    if (!row) return res.json({ valid: false, message: "Invalid code" });

    const createdAt = new Date(row.codeCreatedDate);
    const now = new Date();
    const diffHours = (now - createdAt) / (1000 * 60 * 60);
    if (diffHours > 24) return res.json({ valid: false, message: "Code expired" });

    // Get students for that teacher
    const students = db.prepare(`
      SELECT studentID, studentName
      FROM students
      WHERE studentTeacherID = ?
      ORDER BY studentName
    `).all(row.codeTeacherID);

    res.json({
      valid: true,
      teacherId: row.codeTeacherID,
      teacherName: row.teacherName,
      students
    });
  } catch (err) {
    console.error(err);
    res.json({ valid: false, message: "Server error" });
  }
});


// Student login with selected student and teacher
app.post("/student-login", (req, res) => {
  const { code, studentId } = req.body;
  req.session.teacherId = null; 

  try {
    // 1) Look up code (sync)
    const row = db.prepare(`
      SELECT c.codeTeacherID, c.codeText, c.codeCreatedDate
      FROM codes c
      WHERE c.codeText = ?
      ORDER BY c.codeCreatedDate DESC
      LIMIT 1
    `).get((code || "").trim().toUpperCase());

    if (!row) return res.status(401).send("Invalid code");

    // 2) Expiry check (24h)
    const createdAt = new Date(row.codeCreatedDate);
    const diffHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
    if (diffHours > 24) return res.status(401).send("Code expired");

    // 3) (Optional but recommended) ensure student belongs to this teacher
    const owns = db.prepare(`
      SELECT 1
      FROM students
      WHERE studentID = ? AND studentTeacherID = ?
    `).get(studentId, row.codeTeacherID);
    if (!owns) return res.status(403).send("Student not in this class.");

    // 4) Set session and go
    
    req.session.studentId = studentId;
    req.session.studentTeacherId = row.codeTeacherID;  // distinct name

    res.redirect(`/entry/${studentId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});


// STUDENT LOGOUT
app.get("/student-logout", (req, res) => {
  // Only clear student info — keep teacherId for context
  req.session.studentId = null;
  res.redirect("/");
});

// ────────────────────────────────────────────────────────────────────────────────
// ENTRY PAGE
// ────────────────────────────────────────────────────────────────────────────────
app.get("/entry/:studentId", requireStudentAccess, (req, res) => {
  const studentId = req.params.studentId;
  const teacherId = req.session.teacherId || req.session.studentTeacherId;

  // only allow if teacher owns the student
  if (req.session.teacherId) {
    const ownsStudent = db.prepare(
      `SELECT 1 FROM students WHERE studentID = ? AND studentTeacherID = ?`
    ).get(studentId, teacherId);

    if (!ownsStudent) {
      return res.status(403).send("Access denied: student not in your class.");
    }
  }

  try {
    const studentInfo = db
      .prepare(
        `SELECT s.studentID, s.studentName, t.teacherID, t.teacherName, sch.schoolName
         FROM students s
         JOIN teachers t ON s.studentTeacherID = t.teacherID
         JOIN schools sch ON t.teacherSchoolID = sch.schoolID
         WHERE s.studentID = ?`
      )
      .get(studentId);
    if (!studentInfo) return res.status(404).send("Student not found");

    const subjects = db
      .prepare(
        `SELECT subjectID, subjectName
         FROM subjects
         WHERE subjectTeacherID = ?
         ORDER BY subjectName`
      )
      .all(studentInfo.teacherID);

      //goals
      const goals = db.prepare(`
        SELECT studentSubjectID, studentGoal
        FROM studentGoals
        WHERE studentID = ?
      `).all(studentId);

      // Map goals to subject objects
      subjects.forEach(subj => {
        const goalRow = goals.find(g => g.studentSubjectID === subj.subjectID);
        subj.goal = goalRow ? goalRow.studentGoal : null;
      });

    const allScores = db
      .prepare(
        `SELECT *
         FROM scores
         WHERE scoreStudentID = ?
         ORDER BY scoreDate DESC`
      )
      .all(studentId);

    const scoresBySubject = {};
    for (const s of allScores) {
      if (!scoresBySubject[s.scoreSubjectID]) scoresBySubject[s.scoreSubjectID] = [];
      scoresBySubject[s.scoreSubjectID].push(s);
    }

    const averages = {};
    for (const subj of subjects) {
      const list = scoresBySubject[subj.subjectID] || [];
      if (list.length > 0) {
        const sum = list.reduce((acc, r) => acc + (r.scoreActual || 0), 0);
        averages[subj.subjectID] = sum / list.length;
      } else {
        averages[subj.subjectID] = null;
      }
    }

    res.render("entry", {
      studentInfo,
      subjects,
      scoresBySubject,
      averages,
    });
  } catch (err) {
    console.error("Error loading entry page:", err);
    res.status(500).send("Error loading entry page");
  }
});

app.post("/set-goal", (req, res) => {
  const { studentId, subjectId, studentGoal } = req.body;
  let goalValue = parseFloat(studentGoal);

  // ✅ Convert whole numbers to decimals automatically
  if (goalValue > 1) {
    goalValue = goalValue / 100;
  }

  // ✅ Sanity check: must be between 0 and 1
  if (isNaN(goalValue) || goalValue < 0 || goalValue > 1) {
    return res.status(400).send("Invalid goal value (must be between 0 and 1, or 0–100%).");
  }

  try {
    db.prepare(`
      INSERT INTO studentGoals (studentID, studentSubjectID, studentGoal)
      VALUES (?, ?, ?)
      ON CONFLICT(studentID, studentSubjectID)
      DO UPDATE SET studentGoal = excluded.studentGoal
    `).run(studentId, subjectId, goalValue);

    res.redirect(`/entry/${studentId}`);
  } catch (err) {
    console.error("Error saving goal:", err);
    res.status(500).send("Database error saving goal.");
  }
});

app.get("/logout-student", (req, res) => {
  req.session.studentId = null;
  res.redirect("/");
});

app.post("/submit-score", (req, res) => {
  const {
    studentId,
    teacherId,
    subjectId,
    scoreDate,
    percentScore,
    pointsEarned,
    pointsPossible,
  } = req.body;

  let scoreValue = 0;
  let scorePossible = null;
  let scoreActual = null;

  if (percentScore && !pointsEarned && !pointsPossible) {
    let raw = parseFloat(percentScore);

    // if user entered fraction (like .47), convert to percent
    if (raw > 0 && raw <= 1) {
      raw = raw * 100;
    }

    // normalize to two decimal places
    scoreValue = parseFloat(raw.toFixed(2));
    scoreActual = parseFloat((scoreValue / 100).toFixed(4));
  }

  if (pointsEarned && pointsPossible) {
    const pe = parseFloat(pointsEarned);
    const pp = parseFloat(pointsPossible);
    scoreValue = pe;
    scorePossible = pp;
    scoreActual = pp > 0 ? pe / pp : null;
  }

  try {
    db.prepare(
      `INSERT INTO scores
       (scoreStudentID, scoreTeacherID, scoreSubjectID, scoreDate, scoreValue, scorePossible, scoreActual)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      studentId,
      teacherId,
      subjectId,
      scoreDate || new Date().toISOString().slice(0, 10),
      scoreValue,
      scorePossible,
      scoreActual
    );

    res.redirect(`/entry/${studentId}`);
  } catch (err) {
    console.error("Error saving score:", err);
    res.status(500).send("Database error");
  }
});

app.post("/delete-score", (req, res) => {
  const { scoreId, studentId } = req.body;

  // Only teachers can delete
  if (!req.session.teacherId) {
    return res.status(403).send("Unauthorized");
  }

  try {
    // Ensure the score belongs to one of this teacher’s students
    const result = db.prepare(`
      DELETE FROM scores
      WHERE scoreID = ?
      AND scoreTeacherID = ?
    `).run(scoreId, req.session.teacherId);

    if (result.changes === 0) {
      return res.status(403).send("Cannot delete this score.");
    }

    res.redirect(`/entry/${studentId}`);
  } catch (err) {
    console.error("Error deleting score:", err);
    res.status(500).send("Database error");
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// STATS PAGE
// ────────────────────────────────────────────────────────────────────────────────
app.get("/stats/:studentId", requireStudentAccess, (req, res) => {
  const { studentId } = req.params;

  try {
    const studentInfo = db
      .prepare(
        `SELECT s.studentID, s.studentName,
                t.teacherID, t.teacherName,
                sch.schoolName
         FROM students s
         JOIN teachers t ON s.studentTeacherID = t.teacherID
         JOIN schools sch ON t.teacherSchoolID = sch.schoolID
         WHERE s.studentID = ?`
      )
      .get(studentId);
    if (!studentInfo) return res.status(404).send("Student not found");

    const rows = db
      .prepare(
        `SELECT sc.scoreActual, sc.scoreDate, sub.subjectName
         FROM scores sc
         JOIN subjects sub ON sc.scoreSubjectID = sub.subjectID
         WHERE sc.scoreStudentID = ?
         ORDER BY sub.subjectName, date(sc.scoreDate)`
      )
      .all(studentId);

    if (!rows || rows.length === 0) {
      return res.render("stats", {
        studentInfo,
        subjectChanges: [],
        graphs: [],
        boxPlots: [],
        message: "Not enough data yet.",
      });
    }

    // Group by subject for line graphs and improvement
    const subjects = {};
    for (const r of rows) {
      if (!subjects[r.subjectName]) subjects[r.subjectName] = { dates: [], scores: [] };
      subjects[r.subjectName].dates.push(r.scoreDate);
      subjects[r.subjectName].scores.push(Math.round(r.scoreActual * 100));
    }

    const graphs = Object.entries(subjects).map(([subjectName, data]) => ({
      subjectName,
      dates: data.dates,
      scores: data.scores,
    }));


    const goals = db.prepare(`
      SELECT studentSubjectID, studentGoal
      FROM studentGoals
      WHERE studentID = ?
    `).all(studentId);

    // Map subject IDs to goal values
    const goalMap = {};
    goals.forEach(g => goalMap[g.studentSubjectID] = g.studentGoal);

    // Add goals to graph objects
    graphs.forEach(g => {
      const subjectRow = db.prepare("SELECT subjectID FROM subjects WHERE subjectName = ?").get(g.subjectName);
      if (subjectRow && goalMap[subjectRow.subjectID]) {
        g.goal = goalMap[subjectRow.subjectID] * 100; // convert to %
      } else {
        g.goal = null;
      }
    });

    const subjectChanges = Object.entries(subjects).map(([subjectName, data]) => {
      if (data.scores.length < 2) return { subjectName, change: 0, direction: "no change" };
      const first = data.scores[0];
      const last = data.scores[data.scores.length - 1];
      const change = ((last - first) / first) * 100;
      return {
        subjectName,
        change: Math.round(change),
        direction: change >= 0 ? "improved" : "declined",
      };
    });

    // Class comparison (box plots)
    const allScores = db
      .prepare(
        `SELECT sub.subjectName, sc.scoreActual, sc.scoreStudentID
         FROM scores sc
         JOIN subjects sub ON sc.scoreSubjectID = sub.subjectID
         WHERE sub.subjectTeacherID = ?
         ORDER BY sub.subjectName`
      )
      .all(studentInfo.teacherID);

    const bySubject = {};
    for (const r of allScores) {
      if (!bySubject[r.subjectName]) bySubject[r.subjectName] = [];
      bySubject[r.subjectName].push({ value: r.scoreActual, studentID: r.scoreStudentID });
    }

    const boxPlots = Object.entries(bySubject).map(([subjectName, list]) => {
      const values = list.map((v) => v.value * 100);
      const studentVals = list
        .filter((v) => v.studentID === studentId)
        .map((v) => v.value * 100);
      const studentAvg =
        studentVals.length > 0
          ? studentVals.reduce((a, b) => a + b, 0) / studentVals.length
          : null;
      return { subjectName, allScores: values, studentAvg };
    });

    res.render("stats", {
      studentInfo,
      subjectChanges,
      graphs,
      boxPlots,
      message: null,
    });
  } catch (err) {
    console.error("Error building stats:", err);
    res.status(500).send("Error loading scores");
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// ADMIN PANEL
// ────────────────────────────────────────────────────────────────────────────────
app.get("/admin", requireAdmin, (req, res) => {
  try {
    const schools = db.prepare(`SELECT * FROM schools`).all();

    const teachers = db
      .prepare(`
        SELECT 
          t.teacherID, 
          t.teacherName, 
          t.teacherGradeLevel,
          t.teacherEmail,
          s.schoolName
        FROM teachers t
        LEFT JOIN schools s ON t.teacherSchoolId = s.schoolID
        ORDER BY s.schoolName, t.teacherName
      `).all();

    const subjects = db
      .prepare(
        `SELECT subj.subjectID, subj.subjectName, subj.subjectTeacherID,
                t.teacherName, s.schoolName
         FROM subjects subj
         LEFT JOIN teachers t ON subj.subjectTeacherID = t.teacherID
         LEFT JOIN schools s ON t.teacherSchoolId = s.schoolID`
      )
      .all();

    res.render("admin", {
      schools,
      teachers,
      subjects,
      adminUser: req.session.adminUser,
    });
  } catch (err) {
    console.error(err);
    res.send("Error loading admin data.");
  }
});

app.post("/admin/schools", requireAdmin, (req, res) => {
  const { id, name } = req.body;
  try {
    db.prepare(`INSERT INTO schools (schoolID, schoolName) VALUES (?, ?)`).run(id, name);
    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    res.send("Error adding school.");
  }
});

app.post("/admin/teachers", requireAdmin, async (req, res) => {
  const { id, name, schoolId, password, gradeLevel, email } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.prepare(`
      INSERT INTO teachers (teacherID, teacherName, teacherSchoolID, teacherPassword, teacherGradeLevel, teacherEmail)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, schoolId, hashedPassword, gradeLevel, email);
    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    res.send("Error adding teacher.");
  }
});

// update teacher
app.post("/admin/teachers/update", requireAdmin, async (req, res) => {
  const { teacherID, teacherName, teacherGradeLevel, teacherEmail, newPassword } = req.body;

  try {
    db.prepare(`
      UPDATE teachers
      SET teacherName = ?, teacherGradeLevel = ?, teacherEmail = ?
      WHERE teacherID = ?
    `).run(teacherName, teacherGradeLevel, teacherEmail, teacherID);

    if (newPassword && newPassword.trim() !== "") {
      const hashed = await bcrypt.hash(newPassword.trim(), 10);
      db.prepare(`UPDATE teachers SET teacherPassword = ? WHERE teacherID = ?`).run(hashed, teacherID);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error updating teacher:", err);
    res.status(500).json({ success: false });
  }
});

// 🗑️ Delete teacher
app.post("/admin/teachers/:teacherId/delete", requireAdmin, (req, res) => {
  const { teacherId } = req.params;
  try {
    db.prepare(`DELETE FROM teachers WHERE teacherID = ?`).run(teacherId);
    res.redirect("/admin");
  } catch (err) {
    console.error("Error deleting teacher:", err);
    res.status(500).send("Error deleting teacher");
  }
});

app.post("/admin/subjects", requireAdmin, (req, res) => {
  const { name, teacherId } = req.body;
  try {
    db.prepare(`INSERT INTO subjects (subjectName, subjectTeacherID) VALUES (?, ?)`)
      .run(name, teacherId);
    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    res.send("Error adding subject.");
  }
});

// ────────────────────────────────────────────────────────────────────────────────
app.get("/teacher", (req, res) => {
  req.session.teacherId = null;
  res.redirect("/teacher-login");
});

app.get("/teacher/:teacherId", requireTeacherAccess, (req, res) => {
  const teacherId = req.params.teacherId;

  try {
    const teacher = db
      .prepare(
        `SELECT t.teacherID, t.teacherName, t.teacherGradeLevel, t.teacherEmail, s.schoolName
         FROM teachers t
         LEFT JOIN schools s ON t.teacherSchoolID = s.schoolID
         WHERE t.teacherID = ?`
      )
      .get(teacherId);
    if (!teacher) return res.status(404).send("Teacher not found");

    const students = db
      .prepare(`SELECT * FROM students WHERE studentTeacherID = ?`)
      .all(teacherId);

    const codes = db
      .prepare(
        `SELECT * FROM codes
         WHERE codeTeacherID = ?
         ORDER BY codeCreatedDate DESC
         LIMIT 5`
      )
      .all(teacherId);

    res.render("teacher", {
      teacher,
      students,
      codes,
      loggedInName: req.session.teacherName,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading teacher dashboard");
  }
});

app.post("/teacher/:teacherId/add-student", requireTeacherAccess, (req, res) => {
  const teacherId = req.params.teacherId;
  const { studentId, studentName } = req.body;

  if (!studentId || !studentName) {
    return res.status(400).send("Missing student data.");
  }
  try {
    db.prepare(
      `INSERT INTO students (studentID, studentName, studentTeacherID)
       VALUES (?, ?, ?)
       ON CONFLICT(studentID)
       DO UPDATE SET studentName = excluded.studentName,
                     studentTeacherID = excluded.studentTeacherID`
    ).run(studentId, studentName, teacherId);

    res.redirect(`/teacher/${teacherId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

app.post("/teacher/:teacherId/delete-student/:studentId", requireTeacherAccess, (req, res) => {
  const { teacherId, studentId } = req.params;
  try {
    db.prepare(`DELETE FROM students WHERE studentID = ? AND studentTeacherID = ?`)
      .run(studentId, teacherId);
    res.redirect(`/teacher/${teacherId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error deleting student");
  }
});

app.post("/teacher/:teacherId/new-code", requireTeacherAccess, (req, res) => {
  const teacherId = req.params.teacherId;
  const code = generateCode();

  try {
    const deleteStmt = db.prepare(`DELETE FROM codes WHERE codeTeacherID = ?`);
    const insertStmt = db.prepare(`INSERT INTO codes (codeTeacherID, codeText) VALUES (?, ?)`);

    const setNewCode = db.transaction((tid, c) => {
      deleteStmt.run(tid);
      insertStmt.run(tid, c);
    });

    setNewCode(teacherId, code);
    res.redirect(`/teacher/${teacherId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating new code");
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// TEACHER PASSWORD UPDATE
// ────────────────────────────────────────────────────────────────────────────────
app.get("/teacher/:teacherId/password", requireTeacherAccess, (req, res) => {
  const teacherId = req.params.teacherId;
  try {
    const teacher = db.prepare(`SELECT * FROM teachers WHERE teacherID = ?`).get(teacherId);
    if (!teacher) return res.status(404).send("Teacher not found");
    res.render("teacher-password", { teacher });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading password page");
  }
});

app.post("/teacher/:teacherId/password", requireTeacherAccess, async (req, res) => {
  const teacherId = req.params.teacherId;
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
    return res.status(400).send("New passwords do not match.");
  }

  try {
    const row = db
      .prepare(`SELECT teacherPassword FROM teachers WHERE teacherID = ?`)
      .get(teacherId);
    if (!row) return res.status(404).send("Teacher not found.");

    const match = await bcrypt.compare(currentPassword, row.teacherPassword);
    if (!match) return res.status(401).send("Current password is incorrect.");

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.prepare(`UPDATE teachers SET teacherPassword = ? WHERE teacherID = ?`)
      .run(hashedPassword, teacherId);

    res.redirect(`/teacher/${teacherId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating password.");
  }
});

// ────────────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
