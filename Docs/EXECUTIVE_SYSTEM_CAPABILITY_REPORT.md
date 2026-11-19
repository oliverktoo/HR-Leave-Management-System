# HR Information System — Executive Capability Report

**Prepared for:** Executive Management
**System:** FKF HR Information System
**Report Date:** March 2026
**Classification:** Internal

---

## Executive Summary

The FKF HR Information System is a fully integrated, cloud-hosted Human Resource Management platform purpose-built for the organisation's operational requirements. The system covers the complete employee lifecycle — from recruitment onboarding through to exit — and extends into fleet operations, payroll compliance, and organisational intelligence. It is accessible on web browsers and Android/iOS mobile devices and is enforced by role-based access controls aligned to the organisation's management hierarchy.

This report documents all capabilities currently available in the system as at March 2026.

---

## System Architecture

| Component | Technology |
|---|---|
| Frontend | React 19 (Progressive Web App + Mobile App) |
| Backend / Database | Supabase (PostgreSQL) |
| Mobile App | Android & iOS via Capacitor |
| Hosting | Netlify (web) |
| Authentication | Supabase Auth (email + enforced password policy) |
| Data Security | Row-Level Security (RLS) — every table enforces access by role |

### Access Hierarchy

```
Super Admin → HR Admin → Head of Department → Fleet Manager → Driver → Employee
```

Every user sees only the data and actions permitted for their role. HODs see only their department. Employees see only their own records. Finance sees only payroll approvals. Fleet Managers see only fleet data.

---

## Module 1 — People & User Management

**Who uses it:** HR Admin, Super Admin

### Capabilities
- Create, edit, and deactivate employee accounts
- Assign primary and secondary roles (e.g. an employee who is also a fleet driver)
- Department assignment and management
- Employee ID auto-generation
- Password reset by HR on behalf of staff
- Email address update via secure admin RPC (bypasses standard auth flow)
- Bulk import of employee data
- Employee profile reports with filtering by department, role, and status

**Data held per employee:** Full name, employee ID, department, role, contact details, account status, joining date.

---

## Module 2 — Attendance Management

**Who uses it:** All staff (clock in/out), HR Admin (records + reports), HOD (department view + live dashboard)

### Sub-modules

#### Office Clock-In (Geofenced)
- GPS-based clock-in enforced within a configurable radius of registered office locations
- Minimum GPS accuracy threshold enforced (default 50m) to prevent spoofing
- Supports multiple office locations simultaneously
- Web and mobile clock-in paths (mobile uses native GPS, web uses browser GPS)
- Auto-checkout via scheduled job at end of business day if not manually clocked out
- Offline mobile clock-in queued and synced when connectivity restores

#### Field Clock-In
- Employees on approved field assignments clock in/out without geofence restriction
- Field assignment must be pre-created and approved before field clock-in is enabled
- Deliverables, activity log, and end-of-day reports captured per assignment
- Supervisors have a real-time view of all field staff status

#### Live Attendance Dashboard (HR Admin / HOD)
- Real-time KPI cards: Clocked In Now, On Approved Leave, On OOO Assignment, Not Yet In, Expected Today, Attendance Rate
- Live feed of clock-in events (updates every 60 seconds)
- Department-by-department breakdown table
- Weekly trend analysis (7-day chart)
- Flagged issues: late arrivals beyond grace period, missing clock-outs
- HODs are automatically scoped to their own department only

#### Attendance Reports
- Late arrivals report (by department, date range, minutes late)
- Attendance hours report (worked hours vs expected, variance, overtime/deficit)
- Absence calendar (colour-coded: present, late, absent, leave, field, off)

---

## Module 3 — Leave Management

**Who uses it:** All employees (apply), HOD (first approval), HR Admin (final approval)

### Capabilities
- Configurable leave types (Annual, Sick, Maternity, Paternity, Compassionate, Unpaid, etc.)
- Two-step approval: HOD approves → HR Admin approves
- Leave balance tracking per employee per leave type
- Carryforward days configuration per leave type
- Leave history with full audit trail
- Team calendar showing all approved leave across the organisation
- Public holiday configuration (excluded from leave day calculations)
- Bulk leave balance adjustment by HR
- Leave balance reports

---

## Module 4 — Out-of-Office (OOO) Assignments

**Who uses it:** HR Admin / HOD (create assignments), All employees (apply), HR + HOD (approve)

OOO is distinct from annual leave — it covers authorised absences for training, conferences, workshops, official duties, field visits, and secondments.

### Capabilities
- HR/HOD creates an OOO assignment (title, type, dates, location, max participants)
- Employees apply to attend; HOD does first review, HR does final approval
- Blackout periods configurable (dates when no OOO requests may be submitted)
- OOO approvals feed into the Live Attendance Dashboard (separate KPI card)
- Employee self-service: submit, track, and cancel own OOO requests

---

## Module 5 — Shift & Rota Management

**Who uses it:** HR Admin (create schedules + publish rosters), HOD (view + manage department roster), All employees (view own schedule)

### Capabilities
- Work schedule templates: Standard Office, Early Shift, Afternoon Shift, Field Day, Remote Work (configurable)
- Each schedule defines: start time, end time, expected hours, break minutes, grace period, colour code
- Weekly roster grid: HR/HOD assigns schedules to each employee for each day of the week
- Day-off marking per employee per date
- Bulk assign: select multiple employees + date range + schedule → apply in one action
- Employee self-service: view own schedule for previous, current, and next week with colour-coded day cards

---

## Module 6 — Payroll (Kenya-Compliant)

**Who uses it:** HR Admin (run payroll), Finance (approve), Super Admin (override), Employees (view payslips)

### Statutory Compliance (Kenya)
| Deduction | Status |
|---|---|
| PAYE (Income Tax) — KRA progressive bands | ✓ Calculated |
| NSSF Tier I (statutory) | ✓ Calculated |
| SHA (Social Health Authority) | ✓ Calculated |
| Housing Levy (1.5% employee / 1.5% employer) | ✓ Calculated |
| HELB deductions | ✓ Per employee profile |
| Personal Relief (KES 2,400/month) | ✓ Applied |
| Insurance Relief | ✓ Applied where configured |

### Payroll Workflow
1. HR Admin creates a payroll run (month, period)
2. System calculates gross, all statutory deductions, and net pay per employee
3. Multi-stage approval: HR Admin → Finance → Super Admin (configurable)
4. Payslips generated and visible to employees in self-service portal
5. KRA P9 and P10 export (iTax format)

### Additional Capabilities
- Leave deductions integrated with payroll (unpaid leave reduces gross pay)
- Employee payroll profiles (bank details, tax PIN, NSSF number, HELB reference)
- Payroll analytics dashboard

---

## Module 7 — Fleet Management

**Who uses it:** Fleet Manager (operations), HR Admin (oversight), Drivers (trips + inspections), All staff (trip requests)

### Phase 1 — Core Fleet
- Vehicle registry (make, model, registration, capacity, fuel type, status)
- Driver registry linked to employee profiles
- Trip request by any employee (purpose, date, passengers, destination)
- Two-step trip approval: HOD → Fleet Manager
- Trip assignment: Fleet Manager assigns vehicle and driver to approved trip
- Driver dashboard: view assigned trips, trip details, execute trips

### Phase 2 — Operations
- Trip execution: start/end odometer, actual departure/arrival times
- Fuel management: log fuel purchases, track consumption per vehicle
- Maintenance management: scheduled and unscheduled maintenance records
- Vehicle inspections: pre-trip and post-trip checklists

### Phase 3 — Intelligence
- Fleet analytics: utilisation rates, fuel efficiency, cost per km, trip statistics
- GPS route tracking (when enabled)
- Compliance tracking: vehicle documents, driving licences, insurance — with expiry alerts

### Phase 4 — Finance
- Fleet budget management: budget vs actual per vehicle and department
- Total Cost of Ownership (TCO) reporting
- Fleet reports and export

---

## Module 8 — Document Management

**Who uses it:** HR Admin (upload + manage), All employees (view own documents)

### Capabilities
- Upload, categorise, and manage employee documents (contracts, certificates, IDs, payslips, etc.)
- Document types with configurable expiry dates
- HR can mark documents as visible to the employee or HR-only
- Employees access their own documents in self-service
- Document storage via Supabase secure storage

---

## Module 9 — Employment Contracts & Onboarding

**Who uses it:** HR Admin (manage), HOD (read), Employees (view own contract)

### Capabilities
- Contract registry per employee: contract type, start date, end date, renewal date
- Contract type tracking: Permanent, Fixed-Term, Consultancy, Internship, Probation
- Onboarding checklists: 9-task default checklist per new hire (IT setup, induction, document submission, desk allocation, system access, etc.)
- Checklist task completion tracking with completion dates
- HODs can view contracts for their department members

---

## Module 10 — Performance Appraisals

**Who uses it:** HR Admin (create cycles + oversee), HOD (manager review), Employees (self-assessment)

### Capabilities
- Appraisal cycle creation: Annual, Mid-Year, Quarterly, or Probation cycles
- Employee enrolment: bulk enrol all staff into a cycle with one action
- KPI-based assessment: each appraisal contains configurable KPIs (title, description, weight %, target, actual)
- Four-stage workflow: Pending → Self-Assessment → Manager Review → HR Review → Completed
- Scoring: employee self-scores, manager scores, final HR score (all out of 5)
- Rating outcomes: Exceptional, Exceeds Expectations, Meets Expectations, Needs Improvement, Unsatisfactory
- Recommended actions: Salary Review, Promotion, PIP, Termination, None
- Probation reviews linked to employment contracts: Pass, Extend (weeks), Fail

---

## Module 11 — Disciplinary & Grievance

**Who uses it:** HR Admin (case management), Employees (grievance submission + view own cases)

### Disciplinary Cases
- Case creation by HR: category (Misconduct, Poor Performance, Attendance, Policy Violation, Insubordination, Fraud, Other)
- Action types: Verbal Warning, Written Warning, Final Warning, Suspension, Demotion, Dismissal, No Action
- Case status tracking: Open → Investigation → Hearing Scheduled → Hearing Done → Closed / Appealed
- Auto-generated case reference number (DC-XXXX)
- Incident date, case summary, outcome notes

### Grievance Cases
- Employees can submit their own grievance through self-service
- HR tracks: Submitted → Acknowledged → Investigation → Mediation → Resolved → Closed / Escalated
- Auto-generated reference (GR-XXXX)
- HR response and resolution notes per case

---

## Module 12 — Exit Management & Offboarding

**Who uses it:** Employees (resignation submission), HR Admin (process + clearance), HOD (view team exits)

### Capabilities
- Employee submits resignation or retirement through self-service portal
- Exit types: Resignation, Retirement, Redundancy, End of Contract, Dismissal, Death in Service
- Clearance checklist: IT Equipment, Access Cards, Financial Obligations, HR Documents, Departmental Handover, Exit Interview (configurable items, each with responsible department and completion status)
- Exit interview recording: structured questions with HR notes
- HOD visibility into pending exit requests from their department

---

## Module 13 — Training & Development

**Who uses it:** HR Admin (course catalog + records), Employees (view own training + skills)

### Capabilities
- Training course catalog: centralised library of courses (title, provider, category, duration)
- Course categories: Technical, Soft Skills, Compliance, Leadership, Health & Safety, IT, Finance, General
- Per-employee training records: course title, provider, training date, completion date, status, score, cost, certificate link
- Training status: Enrolled, In Progress, Completed, Failed, Cancelled
- Skills matrix: per-employee skills with proficiency rating (1–5 stars), certification tracking, expiry dates
- Skill categories: Technical, Soft Skills, Language, Certification, Other
- Employee self-service: view own training history and skill profile

---

## Module 14 — Benefits Administration

**Who uses it:** HR Admin (manage all), Employees (view own benefits)

### Benefits Tracked (Kenya-Specific)

| Benefit | Details Captured |
|---|---|
| Health Insurance | Scheme, insurer, cover level (individual/family), premium |
| NSSF Tier II | Voluntary top-up amount above statutory |
| HELB | Loan reference, monthly deduction, current balance |
| Group Life | Insurer, sum assured, expiry |
| Personal Accident | Insurer, cover amount, expiry |
| Pension | Provider, employee contribution %, employer contribution % |
| Other | Free-form custom benefits |

- Per-employee benefit records with effective and expiry dates
- HR summary dashboard: count of employees covered per benefit type
- Expiry alerts (orange badge ≤30 days, red = expired)
- Employee self-service: view own benefit entitlements

---

## Module 15 — Asset Management

**Who uses it:** HR Admin (registry + issue/return), Employees (view own issued assets)

### Capabilities
- Asset registry: Laptops, Phones, Tablets, Vehicle Keys, Access Cards, Uniforms, Equipment, Furniture
- Full asset details: asset tag, make, model, serial number, purchase date, cost
- Issue tracking: assign asset to employee with condition on issue (New/Good/Fair/Poor)
- Return tracking: condition on return, return notes, automatic status update
- Assignment history per asset
- Employee self-service: view all assets currently in their custody
- Accountability disclaimer displayed to employees

---

## Module 16 — Announcements & Internal Communications

**Who uses it:** HR Admin (publish), All employees (read)

### Capabilities
- Create announcements targeted to: All Staff, Specific Department, Specific Role
- Pin important announcements to top of feed
- Expiry date on announcements (auto-hidden after expiry)
- Read receipt tracking (HR can see how many have read each announcement)
- Employee self-service: personal feed showing only announcements relevant to them
- Unread count badge visible to employees

---

## Module 17 — Organisation Chart

**Who uses it:** HR Admin, HOD, Super Admin

### Capabilities
- Auto-generated visual org chart from live department and employee data
- Department cards showing: Department Name, HOD (with initials avatar), headcount badge
- Collapsible member lists per department
- Search: filter by employee name or ID across all departments
- View toggle: By Department (default) or By Role
- Leadership section for Super Admin and HR Admin roles
- Unassigned employees section
- Print-ready layout (browser print)

---

## Module 18 — Compliance Management

**Who uses it:** Fleet Manager, HR Admin

### Capabilities
- Fleet vehicle document compliance: Insurance, Road Licence, Inspection Certificate, Speed Governor, Fire Extinguisher, PSV Licence
- Driver compliance: Driving Licence (with class and PSV endorsement), Certificate of Good Conduct, Medical Certificate
- Expiry-based alerting: automated tracking of document expiry dates
- Compliance dashboard: vehicle-by-vehicle and driver-by-driver compliance status

---

## System Reporting & Analytics

### Available Reports

| Report | Who |
|---|---|
| Attendance Records (daily/monthly) | HR Admin, HOD |
| Late Arrivals Report | HR Admin, HOD |
| Attendance Hours & Variance | HR Admin, HOD |
| Employee Absence Calendar | HR Admin, HOD |
| Leave Balances (all staff) | HR Admin |
| Leave Usage by Type | HR Admin |
| Payroll Run Summary | HR Admin, Finance |
| KRA P9 Annual Tax Certificate | HR Admin |
| KRA P10 Monthly Returns | HR Admin |
| Fleet Utilisation Report | Fleet Manager, HR Admin |
| Fuel Consumption Report | Fleet Manager |
| Fleet Cost / TCO Report | Fleet Manager, HR Admin |
| Trip History Report | Fleet Manager |
| Employee Directory Report | HR Admin |
| Training Completion Report | HR Admin |
| Benefits Coverage Report | HR Admin |

---

## Security & Data Governance

| Control | Implementation |
|---|---|
| Authentication | Email/password with enforced reset on first login |
| Authorisation | PostgreSQL Row-Level Security — zero trust between roles |
| Data Isolation | Every query is filtered by the authenticated user's role |
| Audit Trail | Audit log table records sensitive admin actions |
| Storage | All files stored in Supabase secure storage (not public URLs) |
| Mobile Security | Device-bound push notification tokens |
| Session Management | Supabase JWT with expiry enforcement |

---

## What the System Does NOT Yet Handle

The following capabilities have been identified for future implementation phases:

| Gap | Priority |
|---|---|
| Email notifications (leave approved, payslip ready, trip assigned) | High |
| Payslip PDF generation (rendering engine) | High |
| Recruitment / Applicant Tracking System | Medium |
| Multi-entity / subsidiary structure | Low |
| Employee self-service personal details update (address, next of kin) | Medium |
| Bank details change request workflow | Medium |
| Automated compliance expiry email alerts | Medium |
| Employee engagement / pulse surveys | Low |

---

## Summary Statistics

| Dimension | Count |
|---|---|
| System modules | 18 |
| Database tables | 46+ |
| SQL migrations deployed | 46 |
| Application routes | 80+ |
| React components | 90+ |
| Service functions | 150+ |
| User roles | 7 |
| Supported platforms | Web, Android, iOS |

---

*This report was generated from the live codebase as at March 2026. All capabilities listed are deployed and functional in the production environment unless noted otherwise.*
