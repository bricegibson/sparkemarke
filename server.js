const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const bcrypt = require("bcrypt");

const db = require("./database");
const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

app.use(session({
  secret: "thelifeofashowgirl", // change this to something strong
  resave: false,
  saveUninitialized: false
}));

app.use((req, res, next) => {
  res.locals.loggedInName = req.session.teacherName || null;
  res.locals.loggedInTeacherId = req.session.teacherId || null;
  next();
});

app.use((req, res, next) => {
  res.locals.getScoreColor = getScoreColor;
  next();
});

// Teacher require login Middleware function
function requireTeacherAccess(req, res, next) {
  if (!req.session.teacherId) {
    // Not logged in
    return res.redirect("/teacher-login");
  }

  const requestedTeacherId = req.params.teacherId;
  if (requestedTeacherId !== req.session.teacherId) {
    return res.redirect("/teacher-login");
  }


  next();
}

// Admin require login Middleware function
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

function generateCode(length = 5) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper: Assign Bootstrap classes based on score percentage
function getScoreColor(avg, options = { background: false }) {
  if (avg == null) {
    return options.background ? "bg-light text-muted" : "text-muted";
  }

  const pct = avg * 100;

  // High score
  if (pct >= 90) {
    return options.background
      ? "bg-success bg-opacity-25 text-success fw-bold"
      : "text-success fw-bold";
  }

  // Medium score
  if (pct >= 70) {
    return options.background
      ? "bg-warning bg-opacity-25 text-warning fw-bold"
      : "text-warning fw-bold";
  }

  // Low score
  return options.background
    ? "bg-danger bg-opacity-25 text-danger fw-bold"
    : "text-danger fw-bold";
}


// ************************** ADMIN LOGIN ROUTINE **********************************//
// Admin login page
app.get("/admin-login", (req, res) => {
  res.render("admin-login");
});

// Handle admin login
app.post("/admin-login", (req, res) => {
  const { username, password } = req.body;

  db.get("SELECT * FROM admins WHERE adminUsername = ?", [username], async (err, admin) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Database error");
    }
    if (!admin) {
      return res.status(401).send("Invalid credentials");
    }

    // Compare hashed password
    const match = await bcrypt.compare(password, admin.adminPassword);
    if (!match) {
      return res.status(401).send("Invalid credentials");
    }

    req.session.isAdmin = true;
    req.session.adminUsername = admin.adminUsername;
    res.redirect("/admin");
  });
});

// Admin logout
app.get("/admin-logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin-login");
  });
});
// ************************** ADMIN LOGIN ROUTINE **********************************//

// handle teacher Login form
app.get("/teacher-login", (req, res) => {
  res.render("teacher-login");
});

// Handle teacher login
app.post("/teacher-login", (req, res) => {
  const { teacherId, password } = req.body;

  db.get("SELECT * FROM teachers WHERE teacherID = ?", [teacherId], async (err, teacher) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Database error");
    }
    if (!teacher) {
      return res.status(401).send("Invalid credentials");
    }

    // Compare hashed password
    const match = await bcrypt.compare(password, teacher.teacherPassword);
    if (!match) {
      return res.status(401).send("Invalid credentials");
    }

    req.session.teacherId = teacher.teacherID;
    req.session.teacherName = teacher.teacherName;
    res.redirect(`/teacher/${teacher.teacherID}`);
  });
});


// handle teacher Logout
app.get("/teacher-logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/teacher-login");
  });
});

// ************* STUDENT SCORE ENTRY & RESULTS ************* //
// Handle student code submission
// Home page - list all teachers
app.get("/", (req, res) => {
  const teacherSql = `
    SELECT t.teacherID, t.teacherName, s.schoolName AS schoolName
    FROM teachers t
    LEFT JOIN schools s ON t.teacherSchoolID = s.schoolID
  `;

  db.all(teacherSql, [], (err, teachers) => {
    if (err) {
      console.error(err);
      return res.render("index", { teachers: [] });
    }

    // ✅ no need for studentsByTeacher anymore
    res.render("index", { teachers });
  });
});


// Get students for a specific teacher (AJAX)
app.get("/api/students/:teacherId", (req, res) => {
  const teacherId = req.params.teacherId;

  db.all(`SELECT studentID, studentName FROM students WHERE studentTeacherID = ?`, [teacherId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

app.post("/student-code", (req, res) => {
  const { code, studentId } = req.body;
  const sql = `
    SELECT codeTeacherID, codeText, codeCreatedDate
    FROM codes
    WHERE codeText = ?
    ORDER BY codeCreatedDate DESC
    LIMIT 1
  `;

  db.get(sql, [code], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Database error");
    }
    if (!row) {
      return res.status(401).send("Invalid code");
    }

    // Check if code is still valid (24 hours)
    const createdAt = new Date(row.codeCreatedDate);
    const now = new Date();
    const diffHours = (now - createdAt) / (1000 * 60 * 60);

    if (diffHours > 24) {
      return res.status(401).send("Code expired");
    }

    // ✅ Save student session so only they can access entry
    req.session.studentId = studentId;

    // Redirect to student entry page
    res.redirect(`/entry/${studentId}`);
  });
});



// Show student entry form for a specific teacher
app.get("/entry/:studentId", requireStudentAccess, (req, res) => {
  const studentId = req.params.studentId;

  // 1️⃣ Get the student, their teacher, and the teacher's school
  const studentSql = `
    SELECT s.studentID,
           s.studentName,
           t.teacherID,
           t.teacherName,
           sch.schoolName
    FROM students s
    JOIN teachers t ON s.studentTeacherID = t.teacherID
    JOIN schools sch ON t.teacherSchoolID = sch.schoolID
    WHERE s.studentID = ?
  `;

  db.get(studentSql, [studentId], (err, studentInfo) => {
    if (err || !studentInfo) {
      console.error("Error loading student info:", err);
      return res.status(404).send("Student not found");
    }

    // 2️⃣ Get all subjects for this teacher
    const subjectSql = `
      SELECT subjectID, subjectName
      FROM subjects
      WHERE subjectTeacherID = ?
      ORDER BY subjectName
    `;

    db.all(subjectSql, [studentInfo.teacherID], (err2, subjects) => {
      if (err2) {
        console.error("Error loading subjects:", err2);
        return res.status(500).send("Error loading subjects");
      }

      // 3️⃣ Get all scores for this student
      const scoreSql = `
        SELECT *
        FROM scores
        WHERE scoreStudentID = ?
        ORDER BY scoreDate DESC
      `;

      db.all(scoreSql, [studentId], (err3, scores) => {
        if (err3) {
          console.error("Error loading scores:", err3);
          return res.status(500).send("Error loading scores");
        }

        // 4️⃣ Group scores by subject ID
        const scoresBySubject = {};
        scores.forEach((s) => {
          if (!scoresBySubject[s.scoreSubjectID]) {
            scoresBySubject[s.scoreSubjectID] = [];
          }
          scoresBySubject[s.scoreSubjectID].push(s);
        });

        // 5️⃣ Compute averages per subject
        const averages = {};
        subjects.forEach((subj) => {
          const subjScores = scoresBySubject[subj.subjectID] || [];
          if (subjScores.length > 0) {
            const sum = subjScores.reduce((acc, s) => acc + (s.scoreActual || 0), 0);
            averages[subj.subjectID] = sum / subjScores.length;
          } else {
            averages[subj.subjectID] = null;
          }
        });

        // 6️⃣ Render the entry page
        res.render("entry", {
          studentInfo,
          subjects,
          scoresBySubject,
          averages
        });
      });
    });
  });
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
    pointsPossible
  } = req.body;

  let scoreValue = 0;
  let scorePossible = null;
  let scoreActual = null;

  // If using percent
  if (percentScore && !pointsEarned && !pointsPossible) {
    scoreValue = parseFloat(percentScore);
    scoreActual = scoreValue / 100.0;
  }

  // If using points
  if (pointsEarned && pointsPossible) {
    scoreValue = parseFloat(pointsEarned);
    scorePossible = parseFloat(pointsPossible);
    scoreActual = scorePossible > 0 ? scoreValue / scorePossible : null;
  }

  const sql = `
    INSERT INTO scores (
      scoreStudentID,
      scoreTeacherID,
      scoreSubjectID,
      scoreDate,
      scoreValue,
      scorePossible,
      scoreActual
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(
    sql,
    [
      studentId,
      teacherId,
      subjectId,
      scoreDate || new Date().toISOString().slice(0, 10),
      scoreValue,
      scorePossible,
      scoreActual
    ],
    (err) => {
      if (err) {
        console.error("Error saving score:", err);
        return res.status(500).send("Database error");
      }

      res.redirect(`/entry/${studentId}`);
    }
  );
});

app.get("/stats/:studentId", requireStudentAccess, (req, res) => {
  const { studentId } = req.params;

  // 1️⃣ Get student info
  const infoSql = `
    SELECT s.studentID, s.studentName,
           t.teacherID, t.teacherName,
           sch.schoolName
    FROM students s
    JOIN teachers t ON s.studentTeacherID = t.teacherID
    JOIN schools sch ON t.teacherSchoolID = sch.schoolID
    WHERE s.studentID = ?
  `;

  db.get(infoSql, [studentId], (err, studentInfo) => {
    if (err || !studentInfo) {
      console.error("Error loading student info:", err);
      return res.status(404).send("Student not found");
    }

    // 2️⃣ Query all scores for this student
    const scoreSql = `
      SELECT sc.scoreActual, sc.scoreDate, sub.subjectName
      FROM scores sc
      JOIN subjects sub ON sc.scoreSubjectID = sub.subjectID
      WHERE sc.scoreStudentID = ?
      ORDER BY sub.subjectName, date(sc.scoreDate)
    `;

    db.all(scoreSql, [studentId], (err2, rows) => {
      if (err2) {
        console.error("Error loading student scores:", err2);
        return res.status(500).send("Error loading scores");
      }

      if (!rows || rows.length === 0) {
        return res.render("stats", {
          studentInfo,
          subjectChanges: [],
          graphs: [],
          boxPlots: [],
          message: "Not enough data yet."
        });
      }

      // 3️⃣ Group by subject
      const subjects = {};
      rows.forEach((r) => {
        if (!subjects[r.subjectName]) subjects[r.subjectName] = { dates: [], scores: [] };
        subjects[r.subjectName].dates.push(r.scoreDate);
        subjects[r.subjectName].scores.push(Math.round(r.scoreActual * 100)); // convert to %
      });

      // 4️⃣ Build line graph data
      const graphs = Object.entries(subjects).map(([subjectName, data]) => ({
        subjectName,
        dates: data.dates,
        scores: data.scores
      }));

      // 5️⃣ Build improvement summary
      const subjectChanges = Object.entries(subjects).map(([subjectName, data]) => {
        if (data.scores.length < 2) {
          return { subjectName, change: 0, direction: "no change" };
        }
        const first = data.scores[0];
        const last = data.scores[data.scores.length - 1];
        const change = ((last - first) / first) * 100;
        return {
          subjectName,
          change: Math.round(change),
          direction: change >= 0 ? "improved" : "declined"
        };
      });

      // 6️⃣ Build box plot comparison (class vs student)
      const teacherId = studentInfo.teacherID;
      const boxSql = `
        SELECT sub.subjectName, sc.scoreActual, sc.scoreStudentID
        FROM scores sc
        JOIN subjects sub ON sc.scoreSubjectID = sub.subjectID
        WHERE sub.subjectTeacherID = ?
        ORDER BY sub.subjectName
      `;

      db.all(boxSql, [teacherId], (err3, allScores) => {
        if (err3) {
          console.error("Error loading class data:", err3);
          return res.status(500).send("Error loading class data");
        }

        // Helper: percentile calculation
        function percentile(arr, p) {
          if (arr.length === 0) return 0;
          const idx = (p / 100) * (arr.length - 1);
          const lower = Math.floor(idx);
          const upper = Math.ceil(idx);
          const weight = idx - lower;
          return arr[lower] + weight * (arr[upper] - arr[lower]);
        }

        // Group by subject for box plots
        const bySubject = {};
        allScores.forEach((r) => {
          if (!bySubject[r.subjectName]) bySubject[r.subjectName] = [];
          bySubject[r.subjectName].push({
            value: r.scoreActual,
            studentID: r.scoreStudentID
          });
        });

        const boxPlots = Object.entries(bySubject).map(([subjectName, list]) => {
          const values = list.map((v) => v.value * 100); // convert decimals to %
          const studentVals = list
            .filter((v) => v.studentID === studentId)
            .map((v) => v.value * 100);
          const studentAvg =
            studentVals.length > 0
              ? studentVals.reduce((a, b) => a + b, 0) / studentVals.length
              : null;

          return { subjectName, allScores: values, studentAvg };
        });

        // 7️⃣ Render the full stats page
        res.render("stats", {
          studentInfo,
          subjectChanges,
          graphs,
          boxPlots,
          message: null
        });
      });
    });
  });
});


// ************* STUDENT SCORE ENTRY & RESULTS ************* END//


// Show admin page to add teachers, schools, subjects
app.get("/admin", requireAdmin, (req, res) => {
  db.all(`SELECT * FROM schools`, (err, schools) => {
    if (err) return res.send("Error loading schools.");

    db.all(`SELECT t.teacherID, t.teacherName, s.schoolName 
            FROM teachers t LEFT JOIN schools s ON t.teacherSchoolId = s.schoolID`, (err2, teachers) => {
      if (err2) return res.send("Error loading teachers.");

      db.all(`SELECT subj.subjectID, subj.subjectName, subj.subjectTeacherID, t.teacherName, s.schoolName
              FROM subjects subj
              LEFT JOIN teachers t ON subj.subjectTeacherID = t.teacherID
              LEFT JOIN schools s ON t.teacherSchoolId = s.schoolID`, (err3, subjects) => {
        if (err3) return res.send("Error loading subjects.");
        res.render("admin", { 
          schools, teachers, subjects, 
          adminUser: req.session.adminUser
        });
      });
    });
  });
});

// Handle school creation
app.post("/admin/schools", requireAdmin, (req, res) => {
  const { id, name } = req.body;
  db.run(`INSERT INTO schools (schoolID, schoolName) VALUES (?, ?)`, [id, name], (err) => {
    if (err) {
      console.error(err);
      return res.send("Error adding school.");
    }
    res.redirect("/admin");
  });
});

// Handle teacher creation
app.post("/admin/teachers", requireAdmin, async (req, res) => {
  const { id, name, schoolId, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10); // hash with salt rounds = 10
    db.run(
      `INSERT INTO teachers (teacherID, teacherName, teacherSchoolID, teacherPassword) VALUES (?, ?, ?, ?)`,
      [id, name, schoolId, hashedPassword],
      (err) => {
        if (err) {
          console.error(err);
          return res.send("Error adding teacher.");
        }
        res.redirect("/admin");
      }
    );
  } catch (err) {
    console.error(err);
    res.status(500).send("Error hashing password.");
  }
});

// handle subject creation
app.post("/admin/subjects", requireAdmin, (req, res) => {
  const { name, teacherId } = req.body;
  db.run(`INSERT INTO subjects (subjectName, subjectTeacherID) VALUES (?, ?)`, [name, teacherId], (err) => {
    if (err) {
      console.error(err);
      return res.send("Error adding subject.");
    }
    res.redirect("/admin");
  });
});

// ************* TEACHER DASHBOARD & STUDENT MANAGEMENT ************* //
// Teacher shortcut
app.get("/teacher", (req, res) => {
  req.session.teacherId = null;
  res.redirect("/teacher-login");
});

// Teacher dashboard
app.get("/teacher/:teacherId", requireTeacherAccess, (req, res) => {
  const teacherId = req.params.teacherId;

  const teacherSql = `
    SELECT t.teacherID, t.teacherName, s.schoolName AS schoolName
    FROM teachers t
    LEFT JOIN schools s ON t.teacherSchoolID = s.schoolID
    WHERE t.teacherID = ?
  `;

  db.get(teacherSql, [teacherId], (err, teacher) => {
    if (err || !teacher) {
      console.error(err);
      return res.status(404).send("Teacher not found");
    }

    db.all(`SELECT * FROM students WHERE studentTeacherID = ?`, [teacherId], (err2, students) => {
      if (err2) {
        console.error(err2);
        return res.status(500).send("Error loading students");
      }

      db.all(`SELECT * FROM codes WHERE codeTeacherID = ? ORDER BY codeCreatedDate DESC LIMIT 5`,
        [teacherId],
        (err3, codes) => {
          if (err3) {
            console.error(err3);
            return res.status(500).send("Error loading codes");
          }

          res.render("teacher", {
            teacher,
            students,
            codes,
            loggedInName: req.session.teacherName
          });
        }
      );
    });
  });
});

// Add student
app.post("/teacher/:teacherId/add-student", requireTeacherAccess, (req, res) => {
  const teacherId = req.params.teacherId;
  const { studentId, studentName } = req.body;

  if (!studentId || !studentName) {
    return res.status(400).send("Missing student data.");
  }

  const sql = `
    INSERT INTO students (studentID, studentName, studentTeacherID)
    VALUES (?, ?, ?)
    ON CONFLICT(studentID) DO UPDATE SET studentName = excluded.studentName, studentTeacherID = excluded.studentTeacherID
  `;

  db.run(sql, [studentId, studentName, teacherId], function (err) {
    if (err) {
      console.error(err);
      return res.status(500).send("Database error");
    }
    res.redirect(`/teacher/${teacherId}`);
  });
});

// Delete student
app.post("/teacher/:teacherId/delete-student/:studentId", requireTeacherAccess, (req, res) => {
  const { teacherId, studentId } = req.params;

  const sql = `DELETE FROM students WHERE studentID = ? AND studentTeacherID = ?`;

  db.run(sql, [studentId, teacherId], function (err) {
    if (err) {
      console.error(err);
      return res.status(500).send("Database error deleting student");
    }
    res.redirect(`/teacher/${teacherId}`);
  });
});

// Teacher generates a new student access code
app.post("/teacher/:teacherId/new-code", requireTeacherAccess, (req, res) => {
  const teacherId = req.params.teacherId;
  const code = generateCode();

  const deleteSql = `DELETE FROM codes WHERE codeTeacherID = ?`;
  const insertSql = `INSERT INTO codes (codeTeacherID, codeText) VALUES (?, ?)`;
  
  db.serialize(() => {
    db.run(deleteSql, [teacherId], function (err) {
      if (err) {
        console.error(err);
        return res.status(500).send("Error deleting old code");
      }

      db.run(insertSql, [teacherId, code], function (err2) {
        if (err2) {
          console.error(err2);
          return res.status(500).send("Error generating new code");
        }

        res.redirect(`/teacher/${teacherId}`);
      });
    });
  });    
  
});

// ************* TEACHER DASHBOARD & STUDENT MANAGEMENT ************* //



// *************************** TEACHER PASSWORD UPDATE ROUTINE ************************** //
// Show password update form
app.get("/teacher/:teacherId/password", requireTeacherAccess, (req, res) => {
  const teacherId = req.params.teacherId;
  db.get(`SELECT * FROM teachers WHERE teacherID = ?`, [teacherId], (err, teacher) => {
    if (err || !teacher) {
      console.error(err);
      return res.status(404).send("Teacher not found");
    }
    res.render("teacher-password", { teacher });
  });
});

// Handle password update
app.post("/teacher/:teacherId/password", requireTeacherAccess, (req, res) => {
  const teacherId = req.params.teacherId;
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
    return res.status(400).send("New passwords do not match.");
  }

  db.get(`SELECT teacherPassword FROM teachers WHERE teacherID = ?`, [teacherId], async (err, row) => {
    if (err || !row) {
      console.error(err);
      return res.status(404).send("Teacher not found.");
    }

    const match = await bcrypt.compare(currentPassword, row.teacherPassword);
    if (!match) {
      return res.status(401).send("Current password is incorrect.");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    db.run(`UPDATE teachers SET teacherPassword = ? WHERE teacherID = ?`, [hashedPassword, teacherId], (err2) => {
      if (err2) {
        console.error(err2);
        return res.status(500).send("Error updating password.");
      }
      res.redirect(`/teacher/${teacherId}`);
    });
  });
});

// *************************** TEACHER PASSWORD UPDATE ROUTINE ************************** //

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
