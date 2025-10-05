const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const bcrypt = require("bcrypt");

const db = require("./database"); // must be a better-sqlite3 Database instance
const app = express();
const PORT = process.env.PORT || 3000;

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
    const teachers = db
      .prepare(
        `SELECT t.teacherID, t.teacherName, s.schoolName AS schoolName
         FROM teachers t
         LEFT JOIN schools s ON t.teacherSchoolID = s.schoolID`
      )
      .all();
    res.render("index", { teachers });
  } catch (err) {
    console.error(err);
    res.render("index", { teachers: [] });
  }
});

// AJAX: students for teacher
app.get("/api/students/:teacherId", (req, res) => {
  const teacherId = req.params.teacherId;
  try {
    const rows = db
      .prepare(
        `SELECT studentID, studentName
         FROM students
         WHERE studentTeacherID = ?`
      )
      .all(teacherId);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/student-code", (req, res) => {
  const { code, studentId } = req.body;
  try {
    const row = db
      .prepare(
        `SELECT codeTeacherID, codeText, codeCreatedDate
         FROM codes
         WHERE codeText = ?
         ORDER BY codeCreatedDate DESC
         LIMIT 1`
      )
      .get(code);

    if (!row) return res.status(401).send("Invalid code");

    const createdAt = new Date(row.codeCreatedDate);
    const now = new Date();
    const diffHours = (now - createdAt) / (1000 * 60 * 60);
    if (diffHours > 24) return res.status(401).send("Code expired");

    // bind student to session and go to entry
    req.session.studentId = studentId;
    res.redirect(`/entry/${studentId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// ENTRY PAGE
// ────────────────────────────────────────────────────────────────────────────────
app.get("/entry/:studentId", requireStudentAccess, (req, res) => {
  const studentId = req.params.studentId;

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
    scoreValue = parseFloat(percentScore);
    scoreActual = scoreValue / 100.0;
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
      .prepare(
        `SELECT t.teacherID, t.teacherName, s.schoolName
         FROM teachers t
         LEFT JOIN schools s ON t.teacherSchoolId = s.schoolID`
      )
      .all();

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
  const { id, name, schoolId, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.prepare(
      `INSERT INTO teachers (teacherID, teacherName, teacherSchoolID, teacherPassword)
       VALUES (?, ?, ?, ?)`
    ).run(id, name, schoolId, hashedPassword);
    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    res.send("Error adding teacher.");
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
        `SELECT t.teacherID, t.teacherName, s.schoolName AS schoolName
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
