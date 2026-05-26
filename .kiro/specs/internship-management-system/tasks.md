# Implementation Plan: Internship & Industry Linkage Management System

## Overview

Extend the existing Express/EJS/PostgreSQL skeleton into a fully functional internship management system. Tasks proceed from database foundation → core CRUD routes → advanced features → error handling → tests.

## Tasks

- [ ] 1. Fix database connection and create schema
  - [x] 1.1 Fix db.js database name bug
    - Change `"DATABASE internship_db"` to `"internship_db"` in the Pool config
    - Export the pool correctly so all route handlers can import it
    - _Requirements: 10.1_

  - [x] 1.2 Create schema.sql with all 9 tables
    - Write `CREATE TABLE IF NOT EXISTS` statements for: universities, students, companies, internships, applications, university_supervisors, company_supervisors, recommendation_letters, evaluations
    - Include all PK, FK, UNIQUE, and CHECK constraints as defined in the design
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [ ] 2. Rewrite app.js foundation and dashboard
  - [x] 2.1 Rewrite app.js with clean route structure and export
    - Remove duplicate `/addStudent` GET route and dead code
    - Normalize all route paths to REST conventions (`/students`, `/students/add`, etc.)
    - Add `module.exports = app` at the bottom (required for supertest)
    - Move `app.listen` into a guard: `if (require.main === module) app.listen(3000, ...)`
    - _Requirements: 11.2, 12.1_

  - [x] 2.2 Implement GET `/` dashboard route and update index.ejs
    - Render `index.ejs` with navigation links to all 8 sections: Universities, Students, Companies, Internships, Applications, Supervisors, Evaluations, Recommendation Letters
    - _Requirements: 11.1_

- [ ] 3. University management routes and views
  - [x] 3.1 Implement GET `/universities` and POST `/universities/add` routes
    - GET: query all universities, render `viewUniversities.ejs`
    - POST: validate required fields, INSERT with duplicate-name guard (PG error 23505), redirect to `/universities` on success, re-render form with inline error on failure
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 3.2 Implement DELETE `/universities/:id` route
    - Attempt DELETE; catch FK violation (PG error 23503) and render error page with explanatory message
    - _Requirements: 1.5_

  - [x] 3.3 Create `addUniversity.ejs` and `viewUniversities.ejs` views
    - `addUniversity.ejs`: form with fields university_name, location, contact_email; display inline `error` variable if set
    - `viewUniversities.ejs`: table listing all universities with a delete button per row
    - _Requirements: 1.1, 1.4, 11.2, 11.3_

  - [ ]* 3.4 Write property test for university creation round-trip (Property 1)
    - **Property 1: Entity Creation Round-Trip**
    - **Validates: Requirements 1.2**

  - [ ]* 3.5 Write property test for duplicate university name rejection (Property 2)
    - **Property 2: Duplicate University Name Rejection**
    - **Validates: Requirements 1.3**

  - [ ]* 3.6 Write property test for university deletion guard (Property 4)
    - **Property 4: University Deletion Guard**
    - **Validates: Requirements 1.5**

- [ ] 4. Student management routes and views
  - [x] 4.1 Rewrite GET `/students/add` and POST `/students/add` routes
    - GET: fetch universities for dropdown, render `addStudent.ejs`
    - POST: validate all required fields, INSERT with duplicate-email guard (PG 23505), redirect to `/students` on success
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 4.2 Implement GET `/students` and GET `/students/:id` routes
    - GET `/students`: JOIN with universities, render `viewStudents.ejs`
    - GET `/students/:id`: fetch student + all their applications with status, render detail view (can reuse `viewStudents.ejs` or add a `studentDetail.ejs`)
    - _Requirements: 2.4, 2.5_

  - [x] 4.3 Update `addStudent.ejs` and `viewStudents.ejs` views
    - `addStudent.ejs`: fix template to use correct variable names, show inline error, pre-fill fields on error
    - `viewStudents.ejs`: show university name column, link to student detail
    - _Requirements: 2.4, 11.3_

  - [ ]* 4.4 Write property test for duplicate student email rejection (Property 3)
    - **Property 3: Duplicate Email Rejection**
    - **Validates: Requirements 2.3**

- [ ] 5. Company management routes and views
  - [x] 5.1 Rewrite GET `/companies/add` and POST `/companies/add` routes
    - POST: validate required fields, INSERT with duplicate-email guard, redirect to `/companies` on success
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 5.2 Implement GET `/companies` and DELETE `/companies/:id` routes
    - GET: query all companies, render `viewCompanies.ejs`
    - DELETE: attempt delete, catch FK violation (PG 23503), render error with message
    - _Requirements: 3.4, 3.5_

  - [x] 5.3 Update `addCompany.ejs` and `viewCompanies.ejs` views
    - Add inline error display and field pre-fill to `addCompany.ejs`
    - Add delete button to `viewCompanies.ejs`
    - _Requirements: 3.4, 11.3_

  - [ ]* 5.4 Write property test for company deletion guard (Property 5)
    - **Property 5: Company Deletion Guard**
    - **Validates: Requirements 3.5**

- [ ] 6. Internship management routes and views
  - [x] 6.1 Rewrite GET `/internships/add` and POST `/internships/add` routes
    - GET: fetch companies for dropdown, render `addInternship.ejs`
    - POST: validate required fields, INSERT, redirect to `/internships`
    - _Requirements: 4.1, 4.2_

  - [x] 6.2 Implement GET `/internships` and PUT `/internships/:id` routes
    - GET: use derived status SQL (CASE WHEN EXISTS accepted application THEN 'Filled' ELSE 'Open'), render `viewInternships.ejs`
    - PUT: validate fields, UPDATE internship record, redirect to `/internships`
    - _Requirements: 4.3, 4.4, 4.5, 4.6_

  - [x] 6.3 Update `addInternship.ejs` and `viewInternships.ejs` views
    - `addInternship.ejs`: populate company dropdown, show inline error
    - `viewInternships.ejs`: show derived status column, add edit form/button
    - _Requirements: 4.3, 4.4, 4.5, 11.3_

  - [ ]* 6.4 Write property test for internship status derivation (Property 6)
    - **Property 6: Internship Status Derivation**
    - **Validates: Requirements 4.4, 4.5**

  - [ ]* 6.5 Write property test for internship update round-trip (Property 7)
    - **Property 7: Internship Update Round-Trip**
    - **Validates: Requirements 4.6**

- [ ] 7. Application routes and views
  - [x] 7.1 Rewrite GET `/applications/add` and POST `/applications/add` routes
    - GET: fetch students and internships for dropdowns, render `apply.ejs`
    - POST: INSERT with duplicate-application guard (PG 23505), redirect to `/applications`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 7.2 Implement GET `/applications` with status filter and PUT `/applications/:id/status`
    - GET: accept optional `?status=` query param, filter results, render `viewApplications.ejs`
    - PUT: validate status value is one of Pending/Accepted/Rejected, UPDATE record, redirect to `/applications`
    - _Requirements: 5.4, 5.5, 5.6, 5.7_

  - [x] 7.3 Update `apply.ejs` and `viewApplications.ejs` views
    - `apply.ejs`: show inline error, pre-fill dropdowns on error
    - `viewApplications.ejs`: add status filter form, status update form per row, link to recommendation letter for Accepted applications
    - _Requirements: 5.4, 5.7, 7.1, 11.3_

  - [ ]* 7.4 Write property test for application default status (Property 8)
    - **Property 8: Application Default Status is Pending**
    - **Validates: Requirements 5.2**

  - [ ]* 7.5 Write property test for duplicate application rejection (Property 9)
    - **Property 9: Duplicate Application Rejection**
    - **Validates: Requirements 5.3**

  - [ ]* 7.6 Write property test for application status update round-trip (Property 10)
    - **Property 10: Application Status Update Round-Trip**
    - **Validates: Requirements 5.5, 5.6**

  - [ ]* 7.7 Write property test for application list filter correctness (Property 11)
    - **Property 11: Application List Filter Correctness**
    - **Validates: Requirements 5.7**

- [ ] 8. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Supervisor assignment routes and views
  - [x] 9.1 Implement POST `/supervisors/university/add` and POST `/supervisors/company/add` routes
    - Validate application exists and has status "Accepted" before inserting; return 400 error otherwise
    - Use INSERT ... ON CONFLICT (application_id) DO UPDATE for upsert behavior (idempotent reassignment)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6_

  - [x] 9.2 Implement GET `/supervisors` route
    - JOIN university_supervisors and company_supervisors with applications, students, internships
    - Render `viewSupervisors.ejs`
    - _Requirements: 6.5_

  - [x] 9.3 Implement GET `/supervisors/add` route
    - Fetch accepted applications for dropdown, render `addSupervisor.ejs`
    - _Requirements: 6.1, 6.2_

  - [x] 9.4 Create `addSupervisor.ejs` and `viewSupervisors.ejs` views
    - `addSupervisor.ejs`: two forms (university supervisor / company supervisor), accepted-applications dropdown, inline error display
    - `viewSupervisors.ejs`: table showing intern name, internship title, university supervisor, company supervisor
    - _Requirements: 6.1, 6.2, 6.5, 11.2, 11.3_

  - [ ]* 9.5 Write property test for supervisor assignment requires accepted status (Property 12)
    - **Property 12: Supervisor Assignment Requires Accepted Status**
    - **Validates: Requirements 6.4**

  - [ ]* 9.6 Write property test for supervisor reassignment idempotence (Property 13)
    - **Property 13: Supervisor Reassignment Idempotence**
    - **Validates: Requirements 6.6**

- [ ] 10. Recommendation letter route and view
  - [x] 10.1 Implement GET `/recommendations/:applicationId` route
    - Query application JOIN students, universities, internships, companies
    - Use INSERT ... ON CONFLICT (application_id) DO NOTHING to record generation (idempotent)
    - Render `recommendation.ejs` with all required fields
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 10.2 Create `recommendation.ejs` view
    - Printable HTML layout containing: student full name, university name, internship title, company name, start date, duration
    - Include a print button
    - _Requirements: 7.2, 7.4_

  - [ ]* 10.3 Write property test for recommendation letter content completeness (Property 14)
    - **Property 14: Recommendation Letter Content Completeness**
    - **Validates: Requirements 7.2**

  - [ ]* 10.4 Write property test for recommendation letter generation idempotence (Property 15)
    - **Property 15: Recommendation Letter Generation Idempotence**
    - **Validates: Requirements 7.3, 7.5**

- [ ] 11. Evaluation routes and views
  - [x] 11.1 Rewrite GET `/evaluations/add` and POST `/evaluations/add` routes
    - GET: fetch accepted applications for dropdown, render `addEvaluation.ejs`
    - POST: validate all score fields are integers in [1,5], validate application status is Accepted, use INSERT ... ON CONFLICT (application_id) DO UPDATE for upsert
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 11.2 Implement GET `/evaluations` with filter and GET `/evaluations/:applicationId`
    - GET `/evaluations`: accept optional `?company=` and `?university=` query params, compute average score in SQL, render `viewEvaluation.ejs`
    - GET `/evaluations/:applicationId`: JOIN with students, universities, companies, internships; render `viewEvaluation.ejs` (detail mode)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 11.3 Update `addEvaluation.ejs` and `viewEvaluation.ejs` views
    - `addEvaluation.ejs`: accepted-applications dropdown, score fields (1–5), comments; inline error display
    - `viewEvaluation.ejs`: show all metrics, computed average, intern/company/university/internship info; filter controls
    - _Requirements: 8.1, 9.1, 9.2, 9.3, 9.4, 11.3_

  - [ ]* 11.4 Write property test for evaluation score range validation (Property 16)
    - **Property 16: Evaluation Score Range Validation**
    - **Validates: Requirements 8.3**

  - [ ]* 11.5 Write property test for evaluation upsert idempotence (Property 17)
    - **Property 17: Evaluation Upsert Idempotence**
    - **Validates: Requirements 8.5**

  - [ ]* 11.6 Write property test for evaluation average score calculation (Property 18)
    - **Property 18: Evaluation Average Score Calculation**
    - **Validates: Requirements 9.4**

  - [ ]* 11.7 Write property test for evaluation retrieval by application ID (Property 19)
    - **Property 19: Evaluation Retrieval by Application ID**
    - **Validates: Requirements 9.2, 9.5**

  - [ ]* 11.8 Write property test for evaluation list filter correctness (Property 20)
    - **Property 20: Evaluation List Filter Correctness**
    - **Validates: Requirements 9.3**

- [ ] 12. Error handling middleware and error view
  - [x] 12.1 Add 404 and 500 error middleware to app.js
    - Register catch-all 404 handler after all routes
    - Register 4-argument error middleware for 500 errors
    - Both render `error.ejs` with `{ status, message }` — no raw PG messages exposed
    - _Requirements: 12.1, 12.2, 12.4_

  - [x] 12.2 Create `error.ejs` view
    - Display HTTP status code and user-friendly message
    - Include header/footer partials
    - _Requirements: 12.1, 12.2_

  - [ ]* 12.3 Write property test for form error re-render with message (Property 22)
    - **Property 22: Form Error Re-Render with Message**
    - **Validates: Requirements 11.3, 12.4**

  - [ ]* 12.4 Write property test for successful form submission redirects (Property 23)
    - **Property 23: Successful Form Submission Redirects**
    - **Validates: Requirements 11.4**

  - [ ]* 12.5 Write property test for DB error returns 500 with sanitized message (Property 24)
    - **Property 24: DB Error Returns 500 with Sanitized Message**
    - **Validates: Requirements 12.1, 12.4**

  - [ ]* 12.6 Write property test for missing required fields returns 400 (Property 25)
    - **Property 25: Missing Required Fields Returns 400**
    - **Validates: Requirements 12.3**

- [ ] 13. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Set up test infrastructure and write unit tests
  - [ ] 14.1 Install Jest, supertest, and fast-check; configure package.json test script
    - Run: `npm install --save-dev jest supertest fast-check`
    - Set `"test": "jest --runInBand"` in package.json scripts
    - Create `jest.config.js` with `testEnvironment: 'node'`
    - _Requirements: (testing infrastructure)_

  - [ ] 14.2 Write unit tests for dashboard and 404 route
    - Test GET `/` returns 200 and contains nav link text for all 8 sections
    - Test GET `/nonexistent-route-xyz` returns 404
    - _Requirements: 11.1, 12.2_

  - [ ]* 14.3 Write property tests for unique constraint enforcement (Property 21)
    - **Property 21: Unique Constraint Enforcement**
    - **Validates: Requirements 10.6**

- [ ] 15. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use fast-check with `numRuns: 100` and must include the comment: `// Feature: internship-management-system, Property N: <property_text>`
- The `module.exports = app` export (task 2.1) is required before any supertest-based tests can run
- schema.sql (task 1.2) must be applied to the DB before running the application or tests
