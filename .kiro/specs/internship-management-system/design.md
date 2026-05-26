# Design Document

## Internship & Industry Linkage Management System

---

## Overview

The system is a full-stack web application that digitalizes the complete internship lifecycle for Ethiopian universities. It connects three actor types — university administrators, students, and company representatives — through a single web interface backed by a PostgreSQL relational database.

The existing partial implementation (app.js) provides skeleton routes for students, companies, internships, and applications. This design extends that foundation to cover all 12 requirements: university management, supervisor assignment, recommendation letter generation, evaluation submission and retrieval, and robust error handling.

Key design goals:
- Normalize the database to 3NF with full referential integrity
- Keep all business logic in Express route handlers (thin controllers, no separate service layer needed at this scale)
- Render all UI via EJS templates with shared header/footer partials
- Return user-friendly errors without exposing raw PostgreSQL messages

---

## Architecture

The system follows a classic three-tier architecture:

```
┌─────────────────────────────────────────────────────┐
│                  Presentation Tier                   │
│         EJS Templates + Static CSS (public/)         │
│  Views: index, add/view pages for each entity,       │
│         recommendation letter, error pages           │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP (Express routing)
┌──────────────────────▼──────────────────────────────┐
│                 Application Tier                     │
│              Node.js + Express.js (app.js)           │
│  Route handlers → SQL queries → response rendering  │
└──────────────────────┬──────────────────────────────┘
                       │ pg Pool (TCP)
┌──────────────────────▼──────────────────────────────┐
│                   Data Tier                          │
│           PostgreSQL (internship_db)                 │
│  9 tables with PK/FK constraints, unique indexes     │
└─────────────────────────────────────────────────────┘
```

Request flow:
1. Browser sends HTTP request to Express
2. Route handler validates input, executes parameterized SQL via `pg` pool
3. On success: redirect (POST) or render view (GET) with query results
4. On error: render error view with sanitized message and appropriate HTTP status

---

## Components and Interfaces

### Route Map

| Method | Path | Handler Purpose |
|--------|------|-----------------|
| GET | `/` | Dashboard |
| GET/POST | `/universities` / `/universities/add` | List / Register university |
| DELETE | `/universities/:id` | Delete university (with guard) |
| GET/POST | `/students` / `/students/add` | List / Register student |
| GET | `/students/:id` | Student detail + applications |
| GET/POST | `/companies` / `/companies/add` | List / Register company |
| DELETE | `/companies/:id` | Delete company (with guard) |
| GET/POST | `/internships` / `/internships/add` | List / Post internship |
| PUT | `/internships/:id` | Update internship |
| GET/POST | `/applications` / `/applications/add` | List (with filter) / Submit application |
| PUT | `/applications/:id/status` | Update application status |
| GET/POST | `/supervisors` / `/supervisors/university/add` | List / Assign university supervisor |
| POST | `/supervisors/company/add` | Assign company supervisor |
| GET | `/recommendations/:applicationId` | View/generate recommendation letter |
| GET/POST | `/evaluations` / `/evaluations/add` | List (with filter) / Submit evaluation |
| PUT | `/evaluations/:applicationId` | Update existing evaluation |
| GET | `/evaluations/:applicationId` | View evaluation detail |

### EJS Views

| View File | Purpose |
|-----------|---------|
| `index.ejs` | Dashboard with nav links |
| `addUniversity.ejs` / `viewUniversities.ejs` | University CRUD |
| `addStudent.ejs` / `viewStudents.ejs` | Student CRUD |
| `addCompany.ejs` / `viewCompanies.ejs` | Company CRUD |
| `addInternship.ejs` / `viewInternships.ejs` | Internship CRUD |
| `apply.ejs` / `viewApplications.ejs` | Application submission + list |
| `addSupervisor.ejs` / `viewSupervisors.ejs` | Supervisor assignment |
| `recommendation.ejs` | Printable recommendation letter |
| `addEvaluation.ejs` / `viewEvaluations.ejs` / `viewEvaluation.ejs` | Evaluation CRUD |
| `error.ejs` | Generic error page (status + message) |
| `partials/header.ejs` / `partials/footer.ejs` | Shared layout partials |

### Error Handling Middleware

A centralized error handler is registered after all routes:

```js
// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { status: 404, message: 'Page not found' });
});

// 500 handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { status: 500, message: 'An internal error occurred' });
});
```

Route handlers catch DB errors and call `next(err)` or render inline form errors depending on context.

---

## Data Models

### Entity-Relationship Overview

```
universities ──< students ──< applications >── internships >── companies
                                  │                                │
                    university_supervisors            company_supervisors
                                  │                                │
                         recommendation_letters              evaluations
```

### Table Definitions

#### universities
```sql
CREATE TABLE universities (
  university_id   SERIAL PRIMARY KEY,
  university_name VARCHAR(255) NOT NULL UNIQUE,
  location        VARCHAR(255) NOT NULL,
  contact_email   VARCHAR(255) NOT NULL
);
```

#### students
```sql
CREATE TABLE students (
  student_id    SERIAL PRIMARY KEY,
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  department    VARCHAR(255) NOT NULL,
  year_of_study INT NOT NULL,
  university_id INT NOT NULL REFERENCES universities(university_id)
);
```

#### companies
```sql
CREATE TABLE companies (
  company_id    SERIAL PRIMARY KEY,
  company_name  VARCHAR(255) NOT NULL,
  industry_type VARCHAR(255) NOT NULL,
  location      VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL UNIQUE,
  phone_number  VARCHAR(50)  NOT NULL
);
```

#### internships
```sql
CREATE TABLE internships (
  internship_id    SERIAL PRIMARY KEY,
  company_id       INT NOT NULL REFERENCES companies(company_id),
  title            VARCHAR(255) NOT NULL,
  description      TEXT,
  duration_months  INT NOT NULL,
  start_date       DATE NOT NULL,
  stipend          NUMERIC(10,2)
);
```

#### applications
```sql
CREATE TABLE applications (
  application_id  SERIAL PRIMARY KEY,
  student_id      INT NOT NULL REFERENCES students(student_id),
  internship_id   INT NOT NULL REFERENCES internships(internship_id),
  application_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status          VARCHAR(20) NOT NULL DEFAULT 'Pending'
                  CHECK (status IN ('Pending','Accepted','Rejected')),
  UNIQUE (student_id, internship_id)
);
```

#### university_supervisors
```sql
CREATE TABLE university_supervisors (
  supervisor_id   SERIAL PRIMARY KEY,
  application_id  INT NOT NULL REFERENCES applications(application_id),
  full_name       VARCHAR(255) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  university_id   INT NOT NULL REFERENCES universities(university_id)
);
```

#### company_supervisors
```sql
CREATE TABLE company_supervisors (
  supervisor_id   SERIAL PRIMARY KEY,
  application_id  INT NOT NULL REFERENCES applications(application_id),
  full_name       VARCHAR(255) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  job_title       VARCHAR(255) NOT NULL,
  company_id      INT NOT NULL REFERENCES companies(company_id)
);
```

#### recommendation_letters
```sql
CREATE TABLE recommendation_letters (
  letter_id        SERIAL PRIMARY KEY,
  application_id   INT NOT NULL UNIQUE REFERENCES applications(application_id),
  generated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### evaluations
```sql
CREATE TABLE evaluations (
  evaluation_id       SERIAL PRIMARY KEY,
  application_id      INT NOT NULL UNIQUE REFERENCES applications(application_id),
  technical_skills    INT NOT NULL CHECK (technical_skills BETWEEN 1 AND 5),
  communication       INT NOT NULL CHECK (communication BETWEEN 1 AND 5),
  teamwork            INT NOT NULL CHECK (teamwork BETWEEN 1 AND 5),
  overall_score       INT NOT NULL CHECK (overall_score BETWEEN 1 AND 5),
  comments            TEXT
);
```

### Key Integrity Rules

- `students.email` and `companies.contact_email` have UNIQUE constraints (Req 10.6)
- `universities.university_name` has a UNIQUE constraint (Req 1.3)
- `applications(student_id, internship_id)` composite UNIQUE prevents duplicate applications (Req 5.3)
- `recommendation_letters.application_id` UNIQUE ensures one letter per application (Req 7.5)
- `evaluations.application_id` UNIQUE ensures one evaluation per application (Req 8.5)
- All FK relationships use default `RESTRICT` on delete — parent deletion blocked when children exist (Req 10.5)
- Score columns use CHECK constraints to enforce 1–5 range at DB level (Req 8.3)

### Internship Status Derivation

Internship status is not stored as a column; it is derived at query time:

```sql
SELECT i.*,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM applications a
      WHERE a.internship_id = i.internship_id AND a.status = 'Accepted'
    ) THEN 'Filled'
    ELSE 'Open'
  END AS status
FROM internships i;
```

This avoids update anomalies and keeps the schema in 3NF (Req 4.4, 4.5).

### Average Score Derivation

Average score is computed at query time, not stored:

```sql
SELECT e.*,
  ROUND((e.technical_skills + e.communication + e.teamwork + e.overall_score) / 4.0, 2) AS average_score
FROM evaluations e;
```


---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Entity Creation Round-Trip

*For any* valid entity (university, student, company, internship, application, supervisor, or evaluation) submitted via a POST route, querying the database immediately after should return a record containing the submitted values.

**Validates: Requirements 1.2, 2.2, 3.2, 4.2, 5.2, 6.3, 8.2**

---

### Property 2: Duplicate University Name Rejection

*For any* university name already present in the database, submitting a registration form with that same name should be rejected with an error response and the total count of universities should remain unchanged.

**Validates: Requirements 1.3**

---

### Property 3: Duplicate Email Rejection

*For any* email address already present in the students or companies table, submitting a registration form with that same email should be rejected with an error response and the total record count should remain unchanged.

**Validates: Requirements 2.3, 3.3**

---

### Property 4: University Deletion Guard

*For any* university that has at least one associated student record, a DELETE request for that university should be rejected with an error response and the university record should remain in the database.

**Validates: Requirements 1.5**

---

### Property 5: Company Deletion Guard

*For any* company that has at least one associated internship record, a DELETE request for that company should be rejected with an error response and the company record should remain in the database.

**Validates: Requirements 3.5**

---

### Property 6: Internship Status Derivation

*For any* internship, if no application for that internship has status "Accepted" then the derived status should be "Open"; if at least one application has status "Accepted" then the derived status should be "Filled". These two cases are exhaustive and mutually exclusive.

**Validates: Requirements 4.4, 4.5**

---

### Property 7: Internship Update Round-Trip

*For any* existing internship and any valid update payload (description, duration, start date, or stipend), submitting the update and then querying the internship should return the updated values.

**Validates: Requirements 4.6**

---

### Property 8: Application Default Status is Pending

*For any* valid application submission, the inserted record should have status "Pending" regardless of the student or internship selected.

**Validates: Requirements 5.2**

---

### Property 9: Duplicate Application Rejection

*For any* (student_id, internship_id) pair already present in the applications table, submitting another application with the same pair should be rejected with an error response and the total application count should remain unchanged.

**Validates: Requirements 5.3**

---

### Property 10: Application Status Update Round-Trip

*For any* existing application and any valid status value ("Accepted" or "Rejected"), submitting a status update and then querying the application should return the new status value.

**Validates: Requirements 5.5, 5.6**

---

### Property 11: Application List Filter Correctness

*For any* status filter value ("Pending", "Accepted", or "Rejected"), all applications returned by the filtered list endpoint should have exactly that status value, and no application with a different status should appear in the results.

**Validates: Requirements 5.7**

---

### Property 12: Supervisor Assignment Requires Accepted Status

*For any* application that does not have status "Accepted", attempting to assign either a university supervisor or a company supervisor to that application should be rejected with an error response and no supervisor record should be inserted.

**Validates: Requirements 6.4, 8.4**

---

### Property 13: Supervisor Reassignment Idempotence

*For any* accepted application, assigning a supervisor multiple times should result in exactly one supervisor record for that application (the most recent assignment), not multiple duplicate records.

**Validates: Requirements 6.6**

---

### Property 14: Recommendation Letter Content Completeness

*For any* accepted application, the generated recommendation letter should contain the student's full name, university name, internship title, company name, start date, and duration — all sourced from the database records associated with that application.

**Validates: Requirements 7.2**

---

### Property 15: Recommendation Letter Generation Idempotence

*For any* accepted application, requesting recommendation letter generation multiple times should result in exactly one recommendation_letters record in the database, and subsequent requests should return the same letter rather than creating duplicates.

**Validates: Requirements 7.3, 7.5**

---

### Property 16: Evaluation Score Range Validation

*For any* evaluation submission where any score field (technical_skills, communication, teamwork, or overall_score) contains a value outside the range [1, 5], the submission should be rejected with a validation error and no evaluation record should be inserted.

**Validates: Requirements 8.3**

---

### Property 17: Evaluation Upsert Idempotence

*For any* accepted application, submitting an evaluation multiple times should result in exactly one evaluation record in the database, with the most recent submission's values stored.

**Validates: Requirements 8.5**

---

### Property 18: Evaluation Average Score Calculation

*For any* evaluation record, the computed average score should equal exactly (technical_skills + communication + teamwork + overall_score) / 4.0, rounded to two decimal places.

**Validates: Requirements 9.4**

---

### Property 19: Evaluation Retrieval by Application ID

*For any* evaluation record in the database, querying by its associated application_id should return all performance metrics, the intern's name, university, company, and internship title.

**Validates: Requirements 9.2, 9.5**

---

### Property 20: Evaluation List Filter Correctness

*For any* filter value (company name or university name), all evaluations returned by the filtered list endpoint should be associated with that company or university, and no evaluation from a different company or university should appear in the results.

**Validates: Requirements 9.3**

---

### Property 21: Unique Constraint Enforcement

*For any* pair of student records with the same email, or any pair of company records with the same contact email, the database should reject the second insertion with a unique constraint violation.

**Validates: Requirements 10.6**

---

### Property 22: Form Error Re-Render with Message

*For any* invalid form submission (duplicate, missing fields, constraint violation), the HTTP response should include an error message string that is non-empty and does not contain raw PostgreSQL error text.

**Validates: Requirements 11.3, 12.4**

---

### Property 23: Successful Form Submission Redirects

*For any* valid form submission, the HTTP response should be a redirect (3xx status) to the relevant list page, not a plain text or JSON response.

**Validates: Requirements 11.4**

---

### Property 24: DB Error Returns 500 with Sanitized Message

*For any* route handler that encounters a database error, the HTTP response should have status 500 and the response body should not contain raw PostgreSQL error messages or stack traces.

**Validates: Requirements 12.1, 12.4**

---

### Property 25: Missing Required Fields Returns 400

*For any* POST request body that is missing one or more required fields, the HTTP response should have status 400 and include a descriptive error message identifying the missing field(s).

**Validates: Requirements 12.3**

---

## Error Handling

### Strategy

All error handling follows a two-path approach:

1. **Inline form errors** — for user-correctable validation errors (duplicate email, missing fields, invalid scores). The route handler catches the error, maps it to a human-readable message, and re-renders the form view passing `{ error: message, ...previousValues }`. The form template displays the error inline and pre-fills fields.

2. **Centralized error middleware** — for unexpected errors (DB connection failures, unhandled exceptions). Route handlers call `next(err)` and the global error middleware renders `error.ejs` with a sanitized message.

### PostgreSQL Error Code Mapping

| PG Error Code | Meaning | User Message |
|---------------|---------|--------------|
| `23505` | Unique violation | "A record with that [field] already exists." |
| `23503` | Foreign key violation | "Cannot delete: dependent records exist." / "Invalid reference." |
| `23514` | Check constraint violation | "Score must be between 1 and 5." |
| `ECONNREFUSED` | Connection refused | "Database unavailable. Please try again later." |
| (other) | Unexpected error | "An internal error occurred." |

### Input Validation

Before executing any INSERT or UPDATE query, route handlers validate:
- Required fields are present and non-empty (400 if missing)
- Score fields are integers in [1, 5] (400 if out of range)
- Status values are one of the allowed enum values

Validation happens in the route handler before the DB call, so constraint errors at the DB level are a secondary safety net.

### 404 Handling

A catch-all route registered after all defined routes renders `error.ejs` with status 404.

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are required. They are complementary:
- Unit tests catch concrete bugs with specific known inputs
- Property tests verify general correctness across randomized inputs

### Property-Based Testing

**Library**: [fast-check](https://github.com/dubzzz/fast-check) (JavaScript/Node.js)

Install: `npm install --save-dev fast-check`

**Configuration**: Each property test runs a minimum of 100 iterations (`numRuns: 100`).

Each property test must be tagged with a comment referencing the design property:
```
// Feature: internship-management-system, Property N: <property_text>
```

Each correctness property defined above must be implemented by exactly one property-based test.

**Example property test structure**:
```js
const fc = require('fast-check');

// Feature: internship-management-system, Property 8: Application default status is Pending
test('application default status is Pending', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({ student_id: fc.integer({ min: 1 }), internship_id: fc.integer({ min: 1 }) }),
      async ({ student_id, internship_id }) => {
        // setup: ensure student and internship exist
        // act: POST /applications/add
        // assert: queried record has status === 'Pending'
      }
    ),
    { numRuns: 100 }
  );
});
```

### Unit Testing

**Library**: [Jest](https://jestjs.io/)

Install: `npm install --save-dev jest supertest`

Unit tests focus on:
- Specific examples demonstrating correct behavior (e.g., dashboard renders nav links — Property example from Req 11.1)
- Integration points between route handlers and the DB
- Edge cases: empty string fields, boundary score values (1 and 5 are valid, 0 and 6 are not)
- Error page rendering for 404 routes

**Example unit test**:
```js
const request = require('supertest');
const app = require('../app');

test('GET / renders dashboard with nav links', async () => {
  const res = await request(app).get('/');
  expect(res.status).toBe(200);
  expect(res.text).toContain('Universities');
  expect(res.text).toContain('Students');
});

test('GET /nonexistent returns 404', async () => {
  const res = await request(app).get('/nonexistent-route-xyz');
  expect(res.status).toBe(404);
});
```

### Test Coverage Targets

| Area | Approach |
|------|----------|
| Entity CRUD round-trips | Property tests (P1, P7, P10) |
| Duplicate/constraint rejection | Property tests (P2, P3, P9, P21) |
| Deletion guards | Property tests (P4, P5) |
| Status derivation logic | Property tests (P6, P8, P11, P12) |
| Idempotence (upsert/reassign) | Property tests (P13, P15, P17) |
| Score validation | Property tests (P16) |
| Average calculation | Property tests (P18) |
| Retrieval and filtering | Property tests (P19, P20) |
| Error handling (400, 500, sanitization) | Property tests (P22, P24, P25) |
| Redirect on success | Property tests (P23) |
| Dashboard rendering | Unit test (example) |
| 404 route | Unit test (example) |
