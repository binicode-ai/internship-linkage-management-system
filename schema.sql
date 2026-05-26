-- Internship & Industry Linkage Management System
-- Database Schema

CREATE TABLE IF NOT EXISTS universities (
  university_id   SERIAL PRIMARY KEY,
  university_name VARCHAR(255) NOT NULL UNIQUE,
  location        VARCHAR(255) NOT NULL,
  contact_email   VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  student_id    SERIAL PRIMARY KEY,
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  department    VARCHAR(255) NOT NULL,
  year_of_study INT NOT NULL,
  university_id INT NOT NULL REFERENCES universities(university_id)
);

CREATE TABLE IF NOT EXISTS companies (
  company_id    SERIAL PRIMARY KEY,
  company_name  VARCHAR(255) NOT NULL,
  industry_type VARCHAR(255) NOT NULL,
  location      VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL UNIQUE,
  phone_number  VARCHAR(50)  NOT NULL
);

CREATE TABLE IF NOT EXISTS internships (
  internship_id   SERIAL PRIMARY KEY,
  company_id      INT NOT NULL REFERENCES companies(company_id),
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  duration_months INT NOT NULL,
  start_date      DATE NOT NULL,
  stipend         NUMERIC(10,2)
);

CREATE TABLE IF NOT EXISTS applications (
  application_id   SERIAL PRIMARY KEY,
  student_id       INT NOT NULL REFERENCES students(student_id),
  internship_id    INT NOT NULL REFERENCES internships(internship_id),
  application_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status           VARCHAR(20) NOT NULL DEFAULT 'Pending'
                   CHECK (status IN ('Pending','Accepted','Rejected')),
  UNIQUE (student_id, internship_id)
);

CREATE TABLE IF NOT EXISTS university_supervisors (
  supervisor_id  SERIAL PRIMARY KEY,
  application_id INT NOT NULL REFERENCES applications(application_id),
  full_name      VARCHAR(255) NOT NULL,
  email          VARCHAR(255) NOT NULL,
  phone_number   VARCHAR(50),
  university_id  INT NOT NULL REFERENCES universities(university_id),
  UNIQUE (application_id)
);

CREATE TABLE IF NOT EXISTS company_supervisors (
  supervisor_id  SERIAL PRIMARY KEY,
  application_id INT NOT NULL REFERENCES applications(application_id),
  full_name      VARCHAR(255) NOT NULL,
  email          VARCHAR(255) NOT NULL,
  phone_number   VARCHAR(50),
  job_title      VARCHAR(255) NOT NULL,
  company_id     INT NOT NULL REFERENCES companies(company_id),
  UNIQUE (application_id)
);

CREATE TABLE IF NOT EXISTS recommendation_letters (
  letter_id      SERIAL PRIMARY KEY,
  application_id INT NOT NULL UNIQUE REFERENCES applications(application_id),
  generated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evaluations (
  evaluation_id    SERIAL PRIMARY KEY,
  application_id   INT NOT NULL UNIQUE REFERENCES applications(application_id),
  technical_skills INT NOT NULL CHECK (technical_skills BETWEEN 1 AND 5),
  communication    INT NOT NULL CHECK (communication BETWEEN 1 AND 5),
  teamwork         INT NOT NULL CHECK (teamwork BETWEEN 1 AND 5),
  overall_score    INT NOT NULL CHECK (overall_score BETWEEN 1 AND 5),
  comments         TEXT
);

-- ── Student Accounts (Portal Login) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_accounts (
  account_id    SERIAL PRIMARY KEY,
  student_id    INT NOT NULL UNIQUE REFERENCES students(student_id),
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Complaints ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS complaints (
  complaint_id   SERIAL PRIMARY KEY,
  student_id     INT NOT NULL REFERENCES students(student_id),
  application_id INT REFERENCES applications(application_id),
  subject        VARCHAR(255) NOT NULL,
  message        TEXT NOT NULL,
  admin_reply    TEXT,
  status         VARCHAR(20) NOT NULL DEFAULT 'Open'
                 CHECK (status IN ('Open','Resolved')),
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Session Store ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR NOT NULL COLLATE "default",
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);
