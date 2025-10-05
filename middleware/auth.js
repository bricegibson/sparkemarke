function requireStudentAccess(req, res, next) {
  const { studentId } = req.params;
  if (!req.session.studentId || req.session.studentId != studentId) {
    return res.redirect("/");
  }
  next();
}

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
    return res.redirect("/admin/login");
  }
  next();
}

// Helper function to format date as dd-MMM
function formatDate(dateStr) {
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, "0");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${day}-${months[date.getMonth()]}`;
}

function generateCode(length = 5) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Export all middlewares together
module.exports = {
  requireTeacherAccess,
  requireStudentAccess,
  requireAdmin,
  formatDate,
  generateCode
};