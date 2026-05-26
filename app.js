const express = require("express");
const bodyParser = require("body-parser");
const methodOverride = require("method-override");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcrypt");
const db = require("./db");
const { sendAcceptanceEmail } = require("./mailer");

const app = express();

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static("public"));
app.use(session({
  store: new pgSession({ pool: db, tableName: "session" }),
  secret: process.env.SESSION_SECRET || "internlink-secret-2026",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

// ── Auth guards ───────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.redirect("/admin/login");
  next();
}
function requireStudent(req, res, next) {
  if (!req.session.studentId) return res.redirect("/portal/login");
  next();
}

// ── Admin login ───────────────────────────────────────────────────────────────
app.get("/admin/login", (req, res) => {
  if (req.session.isAdmin) return res.redirect("/");
  res.render("admin/login", { error: null });
});
app.post("/admin/login", (req, res) => {
  const adminPass = process.env.ADMIN_PASSWORD || "admin2026";
  if (req.body.password === adminPass) {
    req.session.isAdmin = true;
    return res.redirect("/");
  }
  res.render("admin/login", { error: "Incorrect password." });
});
app.get("/admin/logout", (req, res) => {
  req.session.isAdmin = false;
  res.redirect("/admin/login");
});

// ── Admin dashboard ───────────────────────────────────────────────────────────
app.get("/", requireAdmin, async (req, res, next) => {
  try {
    const [st, co, intern, apps, pend, acc, rej, evals, openC] = await Promise.all([
      db.query("SELECT COUNT(*) FROM students"),
      db.query("SELECT COUNT(*) FROM companies"),
      db.query("SELECT COUNT(*) FROM internships"),
      db.query("SELECT COUNT(*) FROM applications"),
      db.query("SELECT COUNT(*) FROM applications WHERE status='Pending'"),
      db.query("SELECT COUNT(*) FROM applications WHERE status='Accepted'"),
      db.query("SELECT COUNT(*) FROM applications WHERE status='Rejected'"),
      db.query("SELECT COUNT(*) FROM evaluations"),
      db.query("SELECT COUNT(*) FROM complaints WHERE status='Open'"),
    ]);
    res.render("index", {
      stats: {
        students:     parseInt(st.rows[0].count),
        companies:    parseInt(co.rows[0].count),
        internships:  parseInt(intern.rows[0].count),
        applications: parseInt(apps.rows[0].count),
        pending:      parseInt(pend.rows[0].count),
        accepted:     parseInt(acc.rows[0].count),
        rejected:     parseInt(rej.rows[0].count),
        evaluations:  parseInt(evals.rows[0].count),
        openComplaints: parseInt(openC.rows[0].count),
      }
    });
  } catch (e) { next(e); }
});

// ── Universities ──────────────────────────────────────────────────────────────
app.get("/universities", requireAdmin, async (req, res, next) => {
  try {
    const r = await db.query("SELECT * FROM universities ORDER BY university_name");
    res.render("viewUniversities", { universities: r.rows });
  } catch (e) { next(e); }
});
app.get("/universities/add", requireAdmin, (_req, res) => res.render("addUniversity", { error: null }));
app.post("/universities/add", requireAdmin, async (req, res, next) => {
  const { university_name, location, contact_email } = req.body;
  if (!university_name || !location || !contact_email)
    return res.status(400).render("addUniversity", { error: "All fields are required.", ...req.body });
  try {
    await db.query("INSERT INTO universities (university_name,location,contact_email) VALUES ($1,$2,$3)", [university_name, location, contact_email]);
    res.redirect("/universities");
  } catch (e) {
    if (e.code === "23505") return res.status(400).render("addUniversity", { error: "University name already exists.", ...req.body });
    next(e);
  }
});
app.delete("/universities/:id", requireAdmin, async (req, res, next) => {
  try {
    await db.query("DELETE FROM universities WHERE university_id=$1", [req.params.id]);
    res.redirect("/universities");
  } catch (e) {
    if (e.code === "23503") return res.status(400).render("error", { status: 400, message: "Cannot delete: students still associated." });
    next(e);
  }
});

// ── Students ──────────────────────────────────────────────────────────────────
app.get("/students", requireAdmin, async (req, res, next) => {
  try {
    const r = await db.query("SELECT s.*,u.university_name FROM students s JOIN universities u ON s.university_id=u.university_id ORDER BY s.last_name,s.first_name");
    res.render("viewStudents", { students: r.rows });
  } catch (e) { next(e); }
});
app.get("/students/add", requireAdmin, async (req, res, next) => {
  try {
    const u = await db.query("SELECT university_id,university_name FROM universities ORDER BY university_name");
    res.render("addStudent", { universities: u.rows, error: null });
  } catch (e) { next(e); }
});
app.post("/students/add", requireAdmin, async (req, res, next) => {
  const { first_name, last_name, email, department, year_of_study, university_id } = req.body;
  const getUnis = () => db.query("SELECT university_id,university_name FROM universities ORDER BY university_name");
  if (!first_name || !last_name || !email || !department || !year_of_study || !university_id) {
    const u = await getUnis();
    return res.status(400).render("addStudent", { universities: u.rows, error: "All fields are required.", ...req.body });
  }
  try {
    await db.query("INSERT INTO students (first_name,last_name,email,department,year_of_study,university_id) VALUES ($1,$2,$3,$4,$5,$6)", [first_name, last_name, email, department, year_of_study, university_id]);
    res.redirect("/students");
  } catch (e) {
    if (e.code === "23505") { const u = await getUnis(); return res.status(400).render("addStudent", { universities: u.rows, error: "Email already exists.", ...req.body }); }
    next(e);
  }
});
app.get("/students/:id", requireAdmin, async (req, res, next) => {
  try {
    const s = await db.query("SELECT s.*,u.university_name FROM students s JOIN universities u ON s.university_id=u.university_id WHERE s.student_id=$1", [req.params.id]);
    if (!s.rows.length) return res.status(404).render("error", { status: 404, message: "Student not found" });
    const a = await db.query("SELECT a.application_id,i.title AS internship_title,a.application_date,a.status FROM applications a JOIN internships i ON a.internship_id=i.internship_id WHERE a.student_id=$1 ORDER BY a.application_date DESC", [req.params.id]);
    res.render("studentDetail", { student: s.rows[0], applications: a.rows });
  } catch (e) { next(e); }
});

// ── Companies ─────────────────────────────────────────────────────────────────
app.get("/companies", requireAdmin, async (req, res, next) => {
  try {
    const r = await db.query("SELECT * FROM companies ORDER BY company_name");
    res.render("viewCompanies", { companies: r.rows });
  } catch (e) { next(e); }
});
app.get("/companies/add", requireAdmin, (_req, res) => res.render("addCompany", { error: null }));
app.post("/companies/add", requireAdmin, async (req, res, next) => {
  const { company_name, industry_type, location, contact_email, phone_number } = req.body;
  if (!company_name || !industry_type || !location || !contact_email || !phone_number)
    return res.status(400).render("addCompany", { error: "All fields are required.", ...req.body });
  try {
    await db.query("INSERT INTO companies (company_name,industry_type,location,contact_email,phone_number) VALUES ($1,$2,$3,$4,$5)", [company_name, industry_type, location, contact_email, phone_number]);
    res.redirect("/companies");
  } catch (e) {
    if (e.code === "23505") return res.status(400).render("addCompany", { error: "Email already exists.", ...req.body });
    next(e);
  }
});
app.delete("/companies/:id", requireAdmin, async (req, res, next) => {
  try {
    await db.query("DELETE FROM companies WHERE company_id=$1", [req.params.id]);
    res.redirect("/companies");
  } catch (e) {
    if (e.code === "23503") return res.status(400).render("error", { status: 400, message: "Cannot delete: internships still associated." });
    next(e);
  }
});

// ── Internships ───────────────────────────────────────────────────────────────
app.get("/internships", requireAdmin, async (req, res, next) => {
  try {
    const r = await db.query("SELECT i.*,c.company_name, CASE WHEN EXISTS (SELECT 1 FROM applications a WHERE a.internship_id=i.internship_id AND a.status='Accepted') THEN 'Filled' ELSE 'Open' END AS status FROM internships i JOIN companies c ON i.company_id=c.company_id ORDER BY i.start_date DESC");
    res.render("viewInternships", { internships: r.rows });
  } catch (e) { next(e); }
});
app.get("/internships/add", requireAdmin, async (req, res, next) => {
  try {
    const c = await db.query("SELECT company_id,company_name FROM companies ORDER BY company_name");
    res.render("addInternship", { companies: c.rows, error: null });
  } catch (e) { next(e); }
});
app.post("/internships/add", requireAdmin, async (req, res, next) => {
  const { company_id, title, description, duration_months, start_date, stipend } = req.body;
  if (!company_id || !title || !duration_months || !start_date) {
    const c = await db.query("SELECT company_id,company_name FROM companies ORDER BY company_name");
    return res.status(400).render("addInternship", { companies: c.rows, error: "Company, title, duration and start date are required.", ...req.body });
  }
  try {
    await db.query("INSERT INTO internships (company_id,title,description,duration_months,start_date,stipend) VALUES ($1,$2,$3,$4,$5,$6)", [company_id, title, description || null, duration_months, start_date, stipend || null]);
    res.redirect("/internships");
  } catch (e) { next(e); }
});
app.post("/internships/:id/update", requireAdmin, async (req, res, next) => {
  const { title, description, duration_months, start_date, stipend } = req.body;
  if (!title || !duration_months || !start_date) return res.status(400).send("Required fields missing.");
  try {
    await db.query("UPDATE internships SET title=$1,description=$2,duration_months=$3,start_date=$4,stipend=$5 WHERE internship_id=$6", [title, description || null, duration_months, start_date, stipend || null, req.params.id]);
    res.redirect("/internships");
  } catch (e) { next(e); }
});

// ── Applications ──────────────────────────────────────────────────────────────
app.get("/applications", requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.query;
    let q = "SELECT a.*,s.first_name,s.last_name,s.email AS student_email,i.title AS internship_title,i.start_date,i.duration_months,c.company_name FROM applications a JOIN students s ON a.student_id=s.student_id JOIN internships i ON a.internship_id=i.internship_id JOIN companies c ON i.company_id=c.company_id";
    const params = [];
    if (status && ["Pending","Accepted","Rejected"].includes(status)) { q += " WHERE a.status=$1"; params.push(status); }
    q += " ORDER BY a.application_date DESC";
    const r = await db.query(q, params);
    res.render("viewApplications", { applications: r.rows, filter: status || "" });
  } catch (e) { next(e); }
});
app.get("/applications/add", requireAdmin, async (req, res, next) => {
  try {
    const [s, i] = await Promise.all([db.query("SELECT student_id,first_name,last_name FROM students ORDER BY last_name"), db.query("SELECT internship_id,title FROM internships ORDER BY title")]);
    res.render("apply", { students: s.rows, internships: i.rows, error: null });
  } catch (e) { next(e); }
});
app.post("/applications/add", requireAdmin, async (req, res, next) => {
  const { student_id, internship_id } = req.body;
  const reload = async () => { const [s,i] = await Promise.all([db.query("SELECT student_id,first_name,last_name FROM students ORDER BY last_name"), db.query("SELECT internship_id,title FROM internships ORDER BY title")]); return { students: s.rows, internships: i.rows }; };
  if (!student_id || !internship_id) { const d = await reload(); return res.status(400).render("apply", { ...d, error: "Student and internship are required.", ...req.body }); }
  try {
    await db.query("INSERT INTO applications (student_id,internship_id) VALUES ($1,$2)", [student_id, internship_id]);
    res.redirect("/applications");
  } catch (e) {
    if (e.code === "23505") { const d = await reload(); return res.status(400).render("apply", { ...d, error: "Already applied.", ...req.body }); }
    next(e);
  }
});
app.post("/applications/:id/status", requireAdmin, async (req, res, next) => {
  const { status } = req.body;
  if (!["Pending","Accepted","Rejected"].includes(status)) return res.status(400).send("Invalid status.");
  try {
    await db.query("UPDATE applications SET status=$1 WHERE application_id=$2", [status, req.params.id]);
    if (status === "Accepted") {
      const r = await db.query("SELECT s.first_name||' '||s.last_name AS student_name,s.email,i.title AS internship_title,c.company_name,i.start_date,i.duration_months FROM applications a JOIN students s ON a.student_id=s.student_id JOIN internships i ON a.internship_id=i.internship_id JOIN companies c ON i.company_id=c.company_id WHERE a.application_id=$1", [req.params.id]);
      if (r.rows.length) {
        const d = r.rows[0];
        sendAcceptanceEmail(d.email, { studentName: d.student_name, internshipTitle: d.internship_title, companyName: d.company_name, startDate: d.start_date ? new Date(d.start_date).toISOString().slice(0,10) : "TBD", durationMonths: d.duration_months });
      }
    }
    res.redirect("/applications");
  } catch (e) { next(e); }
});

// ── Supervisors ───────────────────────────────────────────────────────────────
app.get("/supervisors", requireAdmin, async (req, res, next) => {
  try {
    const r = await db.query(`
      SELECT s.first_name||' '||s.last_name AS student_name,
             i.title AS internship_title,
             a.application_id,
             us.full_name AS uni_supervisor, us.email AS uni_email, us.phone_number AS uni_phone,
             cs.full_name AS company_supervisor, cs.email AS co_email, cs.phone_number AS co_phone, cs.job_title
      FROM applications a
      JOIN students s ON a.student_id=s.student_id
      JOIN internships i ON a.internship_id=i.internship_id
      LEFT JOIN university_supervisors us ON a.application_id=us.application_id
      LEFT JOIN company_supervisors cs ON a.application_id=cs.application_id
      WHERE a.status='Accepted' ORDER BY s.last_name`);
    res.render("viewSupervisors", { supervisors: r.rows });
  } catch (e) { next(e); }
});

// ── Sequential workflow: Step 1 — University Supervisor ───────────────────────
app.get("/supervisors/assign/:applicationId", requireAdmin, async (req, res, next) => {
  try {
    const appId = req.params.applicationId;
    const appR = await db.query(`
      SELECT a.application_id, a.status,
             s.first_name||' '||s.last_name AS student_name, s.university_id,
             i.title AS internship_title, i.company_id,
             u.university_name, c.company_name
      FROM applications a
      JOIN students s ON a.student_id=s.student_id
      JOIN internships i ON a.internship_id=i.internship_id
      JOIN universities u ON s.university_id=u.university_id
      JOIN companies c ON i.company_id=c.company_id
      WHERE a.application_id=$1`, [appId]);
    if (!appR.rows.length) return res.status(404).render("error", { status: 404, message: "Application not found." });
    const app_ = appR.rows[0];
    if (app_.status !== "Accepted") return res.status(400).render("error", { status: 400, message: "Supervisor assignment is only available for Accepted applications." });
    // Check if uni supervisor already assigned
    const existing = await db.query("SELECT * FROM university_supervisors WHERE application_id=$1", [appId]);
    const unis = await db.query("SELECT university_id,university_name FROM universities ORDER BY university_name");
    res.render("supervisors/assignUniversity", { application: app_, universities: unis.rows, existing: existing.rows[0] || null, error: null });
  } catch (e) { next(e); }
});

app.post("/supervisors/assign/:applicationId/university", requireAdmin, async (req, res, next) => {
  const { full_name, email, phone_number, university_id } = req.body;
  const appId = req.params.applicationId;
  if (!full_name || !email || !university_id) {
    const [appR, unis] = await Promise.all([
      db.query("SELECT a.*,s.first_name||' '||s.last_name AS student_name,i.title AS internship_title,u.university_name,c.company_name FROM applications a JOIN students s ON a.student_id=s.student_id JOIN internships i ON a.internship_id=i.internship_id JOIN universities u ON s.university_id=u.university_id JOIN companies c ON i.company_id=c.company_id WHERE a.application_id=$1", [appId]),
      db.query("SELECT university_id,university_name FROM universities ORDER BY university_name"),
    ]);
    return res.status(400).render("supervisors/assignUniversity", { application: appR.rows[0], universities: unis.rows, existing: null, error: "Full name, email and university are required." });
  }
  try {
    await db.query(
      "INSERT INTO university_supervisors (application_id,full_name,email,phone_number,university_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (application_id) DO UPDATE SET full_name=$2,email=$3,phone_number=$4,university_id=$5",
      [appId, full_name, email, phone_number || null, university_id]
    );
    // Proceed to step 2
    res.redirect(`/supervisors/assign/${appId}/company`);
  } catch (e) { next(e); }
});

// ── Sequential workflow: Step 2 — Company Supervisor ─────────────────────────
app.get("/supervisors/assign/:applicationId/company", requireAdmin, async (req, res, next) => {
  try {
    const appId = req.params.applicationId;
    const appR = await db.query(`
      SELECT a.application_id, a.status,
             s.first_name||' '||s.last_name AS student_name,
             i.title AS internship_title, i.company_id,
             c.company_name
      FROM applications a
      JOIN students s ON a.student_id=s.student_id
      JOIN internships i ON a.internship_id=i.internship_id
      JOIN companies c ON i.company_id=c.company_id
      WHERE a.application_id=$1`, [appId]);
    if (!appR.rows.length) return res.status(404).render("error", { status: 404, message: "Application not found." });
    const app_ = appR.rows[0];
    // Verify uni supervisor was assigned first
    const uniCheck = await db.query("SELECT 1 FROM university_supervisors WHERE application_id=$1", [appId]);
    if (!uniCheck.rows.length) return res.redirect(`/supervisors/assign/${appId}`);
    const existing = await db.query("SELECT * FROM company_supervisors WHERE application_id=$1", [appId]);
    const cos = await db.query("SELECT company_id,company_name FROM companies ORDER BY company_name");
    res.render("supervisors/assignCompany", { application: app_, companies: cos.rows, existing: existing.rows[0] || null, error: null });
  } catch (e) { next(e); }
});

app.post("/supervisors/assign/:applicationId/company", requireAdmin, async (req, res, next) => {
  const { full_name, email, phone_number, job_title, company_id } = req.body;
  const appId = req.params.applicationId;
  if (!full_name || !email || !job_title || !company_id) {
    const [appR, cos] = await Promise.all([
      db.query("SELECT a.*,s.first_name||' '||s.last_name AS student_name,i.title AS internship_title,c.company_name FROM applications a JOIN students s ON a.student_id=s.student_id JOIN internships i ON a.internship_id=i.internship_id JOIN companies c ON i.company_id=c.company_id WHERE a.application_id=$1", [appId]),
      db.query("SELECT company_id,company_name FROM companies ORDER BY company_name"),
    ]);
    return res.status(400).render("supervisors/assignCompany", { application: appR.rows[0], companies: cos.rows, existing: null, error: "Full name, email, job title and company are required." });
  }
  try {
    await db.query(
      "INSERT INTO company_supervisors (application_id,full_name,email,phone_number,job_title,company_id) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (application_id) DO UPDATE SET full_name=$2,email=$3,phone_number=$4,job_title=$5,company_id=$6",
      [appId, full_name, email, phone_number || null, job_title, company_id]
    );
    res.redirect("/supervisors");
  } catch (e) { next(e); }
});

// ── Legacy bulk add routes (kept for /supervisors/add page) ───────────────────
app.get("/supervisors/add", requireAdmin, async (req, res, next) => {
  try {
    const [apps, unis, cos] = await Promise.all([
      db.query("SELECT a.application_id,s.first_name||' '||s.last_name AS student_name,i.title AS internship_title FROM applications a JOIN students s ON a.student_id=s.student_id JOIN internships i ON a.internship_id=i.internship_id WHERE a.status='Accepted' ORDER BY s.last_name"),
      db.query("SELECT university_id,university_name FROM universities ORDER BY university_name"),
      db.query("SELECT company_id,company_name FROM companies ORDER BY company_name"),
    ]);
    res.render("addSupervisor", { acceptedApplications: apps.rows, universities: unis.rows, companies: cos.rows, error: null });
  } catch (e) { next(e); }
});
app.post("/supervisors/university/add", requireAdmin, async (req, res, next) => {
  const { application_id, full_name, email, phone_number, university_id } = req.body;
  if (!application_id || !full_name || !email || !university_id) return res.status(400).render("error", { status: 400, message: "All fields required." });
  try {
    const chk = await db.query("SELECT status FROM applications WHERE application_id=$1", [application_id]);
    if (!chk.rows.length || chk.rows[0].status !== "Accepted") return res.status(400).render("error", { status: 400, message: "Application must be Accepted." });
    await db.query("INSERT INTO university_supervisors (application_id,full_name,email,phone_number,university_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (application_id) DO UPDATE SET full_name=$2,email=$3,phone_number=$4,university_id=$5", [application_id, full_name, email, phone_number||null, university_id]);
    res.redirect("/supervisors");
  } catch (e) { next(e); }
});
app.post("/supervisors/company/add", requireAdmin, async (req, res, next) => {
  const { application_id, full_name, email, phone_number, job_title, company_id } = req.body;
  if (!application_id || !full_name || !email || !job_title || !company_id) return res.status(400).render("error", { status: 400, message: "All fields required." });
  try {
    const chk = await db.query("SELECT status FROM applications WHERE application_id=$1", [application_id]);
    if (!chk.rows.length || chk.rows[0].status !== "Accepted") return res.status(400).render("error", { status: 400, message: "Application must be Accepted." });
    await db.query("INSERT INTO company_supervisors (application_id,full_name,email,phone_number,job_title,company_id) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (application_id) DO UPDATE SET full_name=$2,email=$3,phone_number=$4,job_title=$5,company_id=$6", [application_id, full_name, email, phone_number||null, job_title, company_id]);
    res.redirect("/supervisors");
  } catch (e) { next(e); }
});

// ── Recommendations ───────────────────────────────────────────────────────────
app.get("/recommendations/:applicationId", requireAdmin, async (req, res, next) => {
  try {
    const r = await db.query("SELECT s.first_name||' '||s.last_name AS student_name,u.university_name,i.title AS internship_title,c.company_name,i.start_date,i.duration_months,a.application_id FROM applications a JOIN students s ON a.student_id=s.student_id JOIN universities u ON s.university_id=u.university_id JOIN internships i ON a.internship_id=i.internship_id JOIN companies c ON i.company_id=c.company_id WHERE a.application_id=$1 AND a.status='Accepted'", [req.params.applicationId]);
    if (!r.rows.length) return res.status(404).render("error", { status: 404, message: "Not found or not accepted." });
    await db.query("INSERT INTO recommendation_letters (application_id) VALUES ($1) ON CONFLICT (application_id) DO NOTHING", [req.params.applicationId]);
    res.render("recommendation", { letter: r.rows[0] });
  } catch (e) { next(e); }
});

// ── Evaluations ───────────────────────────────────────────────────────────────
const evalQ = "SELECT e.*,s.first_name||' '||s.last_name AS student_name,u.university_name,c.company_name,i.title AS internship_title,ROUND((e.technical_skills+e.communication+e.teamwork+e.overall_score)/4.0,2) AS average_score FROM evaluations e JOIN applications a ON e.application_id=a.application_id JOIN students s ON a.student_id=s.student_id JOIN universities u ON s.university_id=u.university_id JOIN internships i ON a.internship_id=i.internship_id JOIN companies c ON i.company_id=c.company_id";
app.get("/evaluations", requireAdmin, async (req, res, next) => {
  try {
    const { company, university } = req.query;
    let q = evalQ; const params = []; const conds = [];
    if (company)    { params.push(`%${company}%`);    conds.push(`c.company_name ILIKE $${params.length}`); }
    if (university) { params.push(`%${university}%`); conds.push(`u.university_name ILIKE $${params.length}`); }
    if (conds.length) q += " WHERE " + conds.join(" OR ");
    q += " ORDER BY s.last_name";
    const r = await db.query(q, params);
    res.render("viewEvaluation", { evaluations: r.rows, companyFilter: company||"", universityFilter: university||"", detail: false });
  } catch (e) { next(e); }
});
app.get("/evaluations/add", requireAdmin, async (req, res, next) => {
  try {
    const r = await db.query("SELECT a.application_id,s.first_name||' '||s.last_name AS student_name,i.title AS internship_title FROM applications a JOIN students s ON a.student_id=s.student_id JOIN internships i ON a.internship_id=i.internship_id WHERE a.status='Accepted' ORDER BY s.last_name");
    res.render("addEvaluation", { acceptedApplications: r.rows, error: null });
  } catch (e) { next(e); }
});
app.post("/evaluations/add", requireAdmin, async (req, res, next) => {
  const { application_id, technical_skills, communication, teamwork, overall_score, comments } = req.body;
  const getApps = () => db.query("SELECT a.application_id,s.first_name||' '||s.last_name AS student_name,i.title AS internship_title FROM applications a JOIN students s ON a.student_id=s.student_id JOIN internships i ON a.internship_id=i.internship_id WHERE a.status='Accepted' ORDER BY s.last_name");
  if (!application_id || !technical_skills || !communication || !teamwork || !overall_score) {
    const r = await getApps(); return res.status(400).render("addEvaluation", { acceptedApplications: r.rows, error: "All score fields required." });
  }
  const scores = [technical_skills, communication, teamwork, overall_score].map(Number);
  if (!scores.every(s => Number.isInteger(s) && s >= 1 && s <= 5)) {
    const r = await getApps(); return res.status(400).render("addEvaluation", { acceptedApplications: r.rows, error: "Scores must be integers 1–5." });
  }
  try {
    const chk = await db.query("SELECT status FROM applications WHERE application_id=$1", [application_id]);
    if (!chk.rows.length || chk.rows[0].status !== "Accepted") { const r = await getApps(); return res.status(400).render("addEvaluation", { acceptedApplications: r.rows, error: "Application must be Accepted." }); }
    await db.query("INSERT INTO evaluations (application_id,technical_skills,communication,teamwork,overall_score,comments) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (application_id) DO UPDATE SET technical_skills=$2,communication=$3,teamwork=$4,overall_score=$5,comments=$6", [application_id, scores[0], scores[1], scores[2], scores[3], comments||null]);
    res.redirect("/evaluations");
  } catch (e) { next(e); }
});
app.get("/evaluations/:applicationId", requireAdmin, async (req, res, next) => {
  try {
    const r = await db.query(evalQ + " WHERE e.application_id=$1", [req.params.applicationId]);
    if (!r.rows.length) return res.status(404).render("error", { status: 404, message: "Evaluation not found." });
    res.render("viewEvaluation", { evaluations: r.rows, detail: true, companyFilter: "", universityFilter: "" });
  } catch (e) { next(e); }
});
app.post("/evaluations/:applicationId/update", requireAdmin, async (req, res, next) => {
  const { technical_skills, communication, teamwork, overall_score, comments } = req.body;
  const scores = [technical_skills, communication, teamwork, overall_score].map(Number);
  if (!scores.every(s => Number.isInteger(s) && s >= 1 && s <= 5)) return res.status(400).render("error", { status: 400, message: "Scores must be integers 1–5." });
  try {
    await db.query("UPDATE evaluations SET technical_skills=$2,communication=$3,teamwork=$4,overall_score=$5,comments=$6 WHERE application_id=$1", [req.params.applicationId, scores[0], scores[1], scores[2], scores[3], comments||null]);
    res.redirect("/evaluations");
  } catch (e) { next(e); }
});

// ── Admin Complaints ──────────────────────────────────────────────────────────
app.get("/complaints", requireAdmin, async (req, res, next) => {
  try {
    const r = await db.query("SELECT cm.*,s.first_name||' '||s.last_name AS student_name,i.title AS internship_title,e.technical_skills,e.communication,e.teamwork,e.overall_score,ROUND((COALESCE(e.technical_skills,0)+COALESCE(e.communication,0)+COALESCE(e.teamwork,0)+COALESCE(e.overall_score,0))/4.0,2) AS avg_score FROM complaints cm JOIN students s ON cm.student_id=s.student_id LEFT JOIN applications a ON cm.application_id=a.application_id LEFT JOIN internships i ON a.internship_id=i.internship_id LEFT JOIN evaluations e ON a.application_id=e.application_id ORDER BY cm.created_at DESC");
    res.render("admin/viewComplaints", { complaints: r.rows });
  } catch (e) { next(e); }
});
app.post("/complaints/:id/reply", requireAdmin, async (req, res, next) => {
  const { admin_reply, status } = req.body;
  try {
    await db.query("UPDATE complaints SET admin_reply=$1,status=$2 WHERE complaint_id=$3", [admin_reply||null, status||"Open", req.params.id]);
    res.redirect("/complaints");
  } catch (e) { next(e); }
});

// ── Public Website ────────────────────────────────────────────────────────────
app.get("/public", async (req, res, next) => {
  try {
    const [internR, stR, coR, inR, uniR] = await Promise.all([
      db.query("SELECT i.*,c.company_name,c.location AS company_location, CASE WHEN EXISTS (SELECT 1 FROM applications a WHERE a.internship_id=i.internship_id AND a.status='Accepted') THEN 'Filled' ELSE 'Open' END AS status FROM internships i JOIN companies c ON i.company_id=c.company_id ORDER BY i.internship_id DESC LIMIT 6"),
      db.query("SELECT COUNT(*) FROM students"),
      db.query("SELECT COUNT(*) FROM companies"),
      db.query("SELECT COUNT(*) FROM internships"),
      db.query("SELECT COUNT(*) FROM universities"),
    ]);
    res.render("public/home", {
      internships: internR.rows,
      stats: { students: stR.rows[0].count, companies: coR.rows[0].count, internships: inR.rows[0].count, universities: uniR.rows[0].count }
    });
  } catch (e) { next(e); }
});
app.get("/public/internships", async (req, res, next) => {
  try {
    const { q, location, industry } = req.query;
    let query = "SELECT i.*,c.company_name,c.location AS company_location,c.industry_type, CASE WHEN EXISTS (SELECT 1 FROM applications a WHERE a.internship_id=i.internship_id AND a.status='Accepted') THEN 'Filled' ELSE 'Open' END AS status FROM internships i JOIN companies c ON i.company_id=c.company_id";
    const params = []; const conds = [];
    if (q)        { params.push(`%${q}%`);        conds.push(`(i.title ILIKE $${params.length} OR c.company_name ILIKE $${params.length})`); }
    if (location) { params.push(`%${location}%`); conds.push(`c.location ILIKE $${params.length}`); }
    if (industry) { params.push(`%${industry}%`); conds.push(`c.industry_type ILIKE $${params.length}`); }
    if (conds.length) query += " WHERE " + conds.join(" AND ");
    query += " ORDER BY i.start_date DESC";
    const r = await db.query(query, params);
    res.render("public/internships", { internships: r.rows, q: q||"", location: location||"", industry: industry||"" });
  } catch (e) { next(e); }
});
app.get("/public/internships/:id", async (req, res, next) => {
  try {
    const r = await db.query("SELECT i.*,c.company_name,c.location AS company_location,c.industry_type,c.contact_email,c.phone_number FROM internships i JOIN companies c ON i.company_id=c.company_id WHERE i.internship_id=$1", [req.params.id]);
    if (!r.rows.length) return res.status(404).render("error", { status: 404, message: "Internship not found." });
    res.render("public/internshipDetail", { internship: r.rows[0] });
  } catch (e) { next(e); }
});
app.get("/public/companies", async (req, res, next) => {
  try {
    const r = await db.query("SELECT * FROM companies ORDER BY company_name");
    res.render("public/companies", { companies: r.rows });
  } catch (e) { next(e); }
});
app.get("/public/about", (_req, res) => res.render("public/about"));

// ── /internships-public alias ─────────────────────────────────────────────────
app.get("/internships-public", async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT i.internship_id, i.title, i.description, i.duration_months, i.stipend,
             i.start_date, c.company_name, c.location
      FROM internships i
      JOIN companies c ON i.company_id = c.company_id
      ORDER BY i.start_date DESC
    `);
    res.render("internships-public", { internships: result.rows });
  } catch (err) {
    console.error(err);
    next(err);
  }
});
app.get("/public/universities", async (req, res, next) => {
  try {
    const r = await db.query("SELECT u.*,(SELECT COUNT(*) FROM students s WHERE s.university_id=u.university_id) AS student_count FROM universities u ORDER BY university_name");
    res.render("public/universities", { universities: r.rows });
  } catch (e) { next(e); }
});
app.get("/public/resources",       (_req, res) => res.render("public/resources"));
app.get("/public/success-stories", (_req, res) => res.render("public/successStories"));
app.get("/public/help",            (_req, res) => res.render("public/help"));
app.get("/public/contact",         (_req, res) => res.render("public/contact"));

// ── Student Portal ────────────────────────────────────────────────────────────
app.get("/portal/login", (req, res) => {
  if (req.session.studentId) return res.redirect("/portal");
  res.render("portal/login", { error: null });
});
app.post("/portal/login", async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) return res.render("portal/login", { error: "Email and password required." });
  try {
    const r = await db.query("SELECT sa.*,s.student_id,s.first_name,s.last_name FROM student_accounts sa JOIN students s ON sa.student_id=s.student_id WHERE s.email=$1", [email]);
    if (!r.rows.length) return res.render("portal/login", { error: "Invalid email or password." });
    const match = await bcrypt.compare(password, r.rows[0].password_hash);
    if (!match) return res.render("portal/login", { error: "Invalid email or password." });
    req.session.studentId = r.rows[0].student_id;
    req.session.studentName = r.rows[0].first_name + " " + r.rows[0].last_name;
    const next_ = req.query.next || "/portal";
    res.redirect(next_);
  } catch (e) { next(e); }
});

// Self-registration: creates student record + account in one step
app.get("/portal/register", async (req, res, next) => {
  try {
    const unis = await db.query("SELECT university_id,university_name FROM universities ORDER BY university_name");
    res.render("portal/register", { universities: unis.rows, error: null, next: req.query.next || "" });
  } catch (e) { next(e); }
});
app.post("/portal/register", async (req, res, next) => {
  const { first_name, last_name, email, department, year_of_study, university_id, password } = req.body;
  if (!first_name || !last_name || !email || !department || !year_of_study || !university_id || !password) {
    const unis = await db.query("SELECT university_id,university_name FROM universities ORDER BY university_name");
    return res.status(400).render("portal/register", { universities: unis.rows, error: "All fields are required.", next: req.body.next || "" });
  }
  try {
    // Insert student record
    const studentResult = await db.query(
      "INSERT INTO students (first_name,last_name,email,department,year_of_study,university_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING student_id",
      [first_name, last_name, email, department, year_of_study, university_id]
    );
    const studentId = studentResult.rows[0].student_id;
    // Create login account
    const hash = await bcrypt.hash(password, 10);
    await db.query("INSERT INTO student_accounts (student_id,password_hash) VALUES ($1,$2)", [studentId, hash]);
    // Auto-login
    req.session.studentId = studentId;
    req.session.studentName = first_name + " " + last_name;
    const redirectTo = req.body.next || "/portal";
    res.redirect(redirectTo);
  } catch (e) {
    const unis = await db.query("SELECT university_id,university_name FROM universities ORDER BY university_name");
    if (e.code === "23505") {
      return res.status(400).render("portal/register", { universities: unis.rows, error: "An account with that email already exists.", next: req.body.next || "" });
    }
    next(e);
  }
});
app.get("/portal/logout", (req, res) => { req.session.destroy(() => res.redirect("/portal/login")); });

// Dashboard — applications + evaluations + supervisors
app.get("/portal", requireStudent, async (req, res, next) => {
  try {
    const [appsR, evalsR] = await Promise.all([
      db.query(`SELECT a.*,i.title AS internship_title,c.company_name,c.location AS company_location,
        i.start_date,i.duration_months,
        us.full_name AS uni_supervisor, us.email AS uni_supervisor_email, us.phone_number AS uni_supervisor_phone,
        cs.full_name AS company_supervisor, cs.job_title AS company_supervisor_title, cs.email AS co_supervisor_email, cs.phone_number AS co_supervisor_phone
        FROM applications a
        JOIN internships i ON a.internship_id=i.internship_id
        JOIN companies c ON i.company_id=c.company_id
        LEFT JOIN university_supervisors us ON a.application_id=us.application_id
        LEFT JOIN company_supervisors cs ON a.application_id=cs.application_id
        WHERE a.student_id=$1 ORDER BY a.application_date DESC`, [req.session.studentId]),
      db.query(`SELECT e.*,i.title AS internship_title,c.company_name,
        ROUND((e.technical_skills+e.communication+e.teamwork+e.overall_score)/4.0,2) AS average_score
        FROM evaluations e
        JOIN applications a ON e.application_id=a.application_id
        JOIN internships i ON a.internship_id=i.internship_id
        JOIN companies c ON i.company_id=c.company_id
        WHERE a.student_id=$1 ORDER BY a.application_id DESC`, [req.session.studentId]),
    ]);
    res.render("portal/dashboard", {
      applications: appsR.rows,
      evaluations: evalsR.rows,
      studentName: req.session.studentName
    });
  } catch (e) { next(e); }
});
app.get("/portal/apply", requireStudent, async (req, res, next) => {
  try {
    const r = await db.query("SELECT i.*,c.company_name FROM internships i JOIN companies c ON i.company_id=c.company_id ORDER BY i.title");
    res.render("portal/apply", { internships: r.rows, error: null, studentName: req.session.studentName });
  } catch (e) { next(e); }
});
app.post("/portal/apply", requireStudent, async (req, res, next) => {
  const { internship_id } = req.body;
  if (!internship_id) {
    const r = await db.query("SELECT i.*,c.company_name FROM internships i JOIN companies c ON i.company_id=c.company_id ORDER BY i.title");
    return res.status(400).render("portal/apply", { internships: r.rows, error: "Please select an internship.", studentName: req.session.studentName });
  }
  try {
    await db.query("INSERT INTO applications (student_id,internship_id) VALUES ($1,$2)", [req.session.studentId, internship_id]);
    res.redirect("/portal");
  } catch (e) {
    if (e.code === "23505") {
      const r = await db.query("SELECT i.*,c.company_name FROM internships i JOIN companies c ON i.company_id=c.company_id ORDER BY i.title");
      return res.status(400).render("portal/apply", { internships: r.rows, error: "You already applied for this internship.", studentName: req.session.studentName });
    }
    next(e);
  }
});
app.get("/portal/complaints", requireStudent, async (req, res, next) => {
  try {
    const [c, a, e] = await Promise.all([
      db.query(`SELECT cm.*,i.title AS internship_title,
        ev.technical_skills,ev.communication,ev.teamwork,ev.overall_score,ev.comments AS eval_comments,
        ROUND((COALESCE(ev.technical_skills,0)+COALESCE(ev.communication,0)+COALESCE(ev.teamwork,0)+COALESCE(ev.overall_score,0))/4.0,2) AS avg_score
        FROM complaints cm
        LEFT JOIN applications a ON cm.application_id=a.application_id
        LEFT JOIN internships i ON a.internship_id=i.internship_id
        LEFT JOIN evaluations ev ON a.application_id=ev.application_id
        WHERE cm.student_id=$1 ORDER BY cm.created_at DESC`, [req.session.studentId]),
      db.query("SELECT a.application_id,i.title AS internship_title FROM applications a JOIN internships i ON a.internship_id=i.internship_id WHERE a.student_id=$1", [req.session.studentId]),
      db.query(`SELECT e.*,i.title AS internship_title,ROUND((e.technical_skills+e.communication+e.teamwork+e.overall_score)/4.0,2) AS avg_score
        FROM evaluations e JOIN applications a ON e.application_id=a.application_id
        JOIN internships i ON a.internship_id=i.internship_id
        WHERE a.student_id=$1`, [req.session.studentId]),
    ]);
    res.render("portal/complaints", { complaints: c.rows, applications: a.rows, evaluations: e.rows, error: null, studentName: req.session.studentName });
  } catch (e) { next(e); }
});
app.post("/portal/complaints", requireStudent, async (req, res, next) => {
  const { application_id, subject, message } = req.body;
  const reload = async () => {
    const [c, a, e] = await Promise.all([
      db.query("SELECT cm.*,i.title AS internship_title FROM complaints cm LEFT JOIN applications ap ON cm.application_id=ap.application_id LEFT JOIN internships i ON ap.internship_id=i.internship_id WHERE cm.student_id=$1 ORDER BY cm.created_at DESC", [req.session.studentId]),
      db.query("SELECT a.application_id,i.title AS internship_title FROM applications a JOIN internships i ON a.internship_id=i.internship_id WHERE a.student_id=$1", [req.session.studentId]),
      db.query("SELECT e.*,i.title AS internship_title,ROUND((e.technical_skills+e.communication+e.teamwork+e.overall_score)/4.0,2) AS avg_score FROM evaluations e JOIN applications a ON e.application_id=a.application_id JOIN internships i ON a.internship_id=i.internship_id WHERE a.student_id=$1", [req.session.studentId]),
    ]);
    return { complaints: c.rows, applications: a.rows, evaluations: e.rows };
  };
  if (!subject || !message) {
    const d = await reload();
    return res.status(400).render("portal/complaints", { ...d, error: "Subject and message are required.", studentName: req.session.studentName });
  }
  try {
    await db.query("INSERT INTO complaints (student_id,application_id,subject,message) VALUES ($1,$2,$3,$4)", [req.session.studentId, application_id||null, subject, message]);
    res.redirect("/portal/complaints");
  } catch (e) { next(e); }
});

// ── Error handling ────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).render("error", { status: 404, message: "Page not found" }));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).render("error", { status: 500, message: "An internal error occurred" }); });

if (require.main === module) app.listen(3000, () => console.log("Server running on port 3000"));
module.exports = app;
