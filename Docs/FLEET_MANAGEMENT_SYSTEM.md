# Fleet Management System — Full Documentation

**Project:** FKF HR System
**Module:** Fleet Management
**Last Updated:** March 2026
**Phases Completed:** 4 (fully implemented)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [User Roles & Permissions](#2-user-roles--permissions)
3. [Phase 1 — Core Booking System](#3-phase-1--core-booking-system)
4. [Phase 2 — Trip Execution & Operations](#4-phase-2--trip-execution--operations)
5. [Phase 3 — Compliance & Licensing](#5-phase-3--compliance--licensing)
6. [Phase 4 — GPS, Reports, Budget & Driver App](#6-phase-4--gps-reports-budget--driver-app)
7. [Database Schema Reference](#7-database-schema-reference)
8. [Frontend Pages & Routes](#8-frontend-pages--routes)
9. [Trip Lifecycle (End-to-End)](#9-trip-lifecycle-end-to-end)
10. [SQL Migrations Run Order](#10-sql-migrations-run-order)

---

## 1. System Overview

The Fleet Management System manages the full lifecycle of organizational vehicle usage — from trip requests through approval, driver assignment, execution with GPS tracking, fuel/expense recording, and reporting.

### Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Backend | Supabase (PostgreSQL + RLS + RPCs) |
| Mobile | Capacitor 6 (iOS/Android) |
| GPS Tracking | `@capacitor/geolocation` + Leaflet maps |
| Notifications | `@capacitor/push-notifications` + `@capacitor/local-notifications` |
| PDF Export | jsPDF + jspdf-autotable |

### Key Services (frontend)

| File | Responsibility |
|------|---------------|
| `services/fleetService.ts` | Vehicles, drivers, trip requests, approvals, assignments |
| `services/fleetPhase2Service.ts` | Trip execution, fuel records, maintenance, expenses, inspections |
| `services/complianceService.ts` | Vehicle documents, driver licenses, compliance alerts |
| `services/gpsService.ts` | GPS waypoint logging, offline queue, route tracking |
| `services/fleetReportService.ts` | Report generation, CSV/PDF export, budgets, TCO |
| `services/pushNotificationService.ts` | Device push token registration, local notifications |

---

## 2. User Roles & Permissions

```
super_admin → hr_admin → hod → fleet_manager → driver → employee
```

| Role | Fleet Access |
|------|-------------|
| `super_admin` | Full access to all fleet features |
| `hr_admin` | Full access to all fleet features |
| `fleet_manager` | Manages vehicles, drivers, assignments, fuel, maintenance, compliance, reports, budget |
| `hod` | Approves trip requests for their department, views department trips |
| `driver` | Sees assigned trips, executes trips, logs GPS, records fuel during trips |
| `employee` | Submits trip requests, views own requests |

### RLS (Row Level Security) Rules — Summary

- **fleet_vehicles**: Read by all authenticated; write by fleet_manager/hr_admin/super_admin
- **trip_requests**: Employees create own; fleet staff see all; drivers see assigned trips
- **fuel_records**: Drivers/fleet_managers insert; fleet staff see all
- **maintenance_records**: fleet_manager/hr_admin/super_admin only
- **vehicle_documents**: fleet_manager/hr_admin/super_admin only
- **compliance_alerts**: fleet_manager/hr_admin/super_admin only
- **trip_gps_logs**: Drivers insert their own; fleet staff + requester can read

---

## 3. Phase 1 — Core Booking System

**Migration:** `010_fleet_management_phase1.sql`
**Types:** `types/fleet.ts`

### What it does
Establishes the foundational vehicle fleet, driver registry, and trip request workflow.

### Database Tables

#### `fleet_vehicles`
Stores the vehicle fleet.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `plate_number` | TEXT | Unique registration plate |
| `make` / `model` / `year` | TEXT/INT | Vehicle identity |
| `fuel_type` | ENUM | petrol, diesel, electric, hybrid |
| `seating_capacity` | SMALLINT | Max passengers |
| `status` | ENUM | available, in_use, maintenance, retired |
| `current_odometer` | NUMERIC | Last recorded odometer reading (km) |
| `insurance_expiry_date` | DATE | Triggers compliance alert when near expiry |
| `next_service_date` | DATE | Triggers maintenance alert when near |
| `assigned_department_id` | UUID | Optional department assignment |

#### `trip_requests`
The central table driving the entire booking workflow.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `request_number` | TEXT | Auto-generated: `TR-2026-0001` |
| `requester_id` | UUID → users_profile | Who submitted the request |
| `department_id` | UUID → departments | Requester's department |
| `destination` | TEXT | Where the trip goes |
| `purpose` | TEXT | Business justification |
| `passenger_count` | SMALLINT | Number of passengers |
| `start_datetime` | TIMESTAMPTZ | Planned departure |
| `end_datetime` | TIMESTAMPTZ | Planned return |
| `status` | ENUM | See trip lifecycle below |
| `assigned_vehicle_id` | UUID → fleet_vehicles | Set during assignment |
| `assigned_driver_id` | UUID → users_profile | Set during assignment |
| `approved_by` | UUID → users_profile | HOD or fleet_manager who approved |

**Trip Request Number:** Auto-generated by a `SECURITY DEFINER` trigger on insert — format `TR-YYYY-NNNN`, reset each year.

#### `driver_profiles` (extended `users_profile`)
Phase 1 adds driver-specific columns directly to `users_profile`:
- `license_number`, `license_class`, `license_expiry_date`
- `driver_rating` (avg from completed trips)
- `total_trips_completed`, `total_distance_driven`
- `emergency_contact_name`, `emergency_contact_phone`

### Trip Status Lifecycle

```
pending → approved → assigned → in_progress → completed
                  ↘ rejected
                              ↘ cancelled
```

| Status | Who Sets It | How |
|--------|-------------|-----|
| `pending` | Auto on create | Employee submits request |
| `approved` | HOD / fleet_manager | Via Trip Approvals page |
| `rejected` | HOD / fleet_manager | Via Trip Approvals page with reason |
| `assigned` | fleet_manager | Via Assignments page — picks vehicle + driver |
| `in_progress` | Driver | Via Trip Execution page — enters start odometer |
| `completed` | Driver | Via Trip Execution page — enters end odometer + rating |
| `cancelled` | Requester / admin | Can cancel before `in_progress` |

### Availability Checks (PostgreSQL Functions)

- **`is_vehicle_available(vehicle_id, start_dt, end_dt)`** — checks no other `assigned`/`in_progress` trip overlaps
- **`is_driver_available(driver_id, start_dt, end_dt)`** — same check for drivers
- **`is_user_on_leave(user_id, start_dt, end_dt)`** — checks leave_requests table to prevent assigning drivers on leave

### Frontend Components (Phase 1)

| Component | Route | Who Uses It |
|-----------|-------|-------------|
| `FleetDashboard` | `/fleet/dashboard` | fleet_manager, hr_admin, super_admin |
| `VehicleList` | `/fleet/vehicles` | fleet_manager+ |
| `VehicleForm` | `/fleet/vehicles/new`, `/fleet/vehicles/:id/edit` | fleet_manager+ |
| `DriverList` | `/fleet/drivers` | fleet_manager+ |
| `MyTripRequests` | `/fleet/my-trips` | All roles |
| `TripRequestForm` | `/fleet/trip-request/new` | All roles |
| `TripApprovals` | `/fleet/trip-approvals` | hod, fleet_manager+ |
| `TripAssignments` | `/fleet/assignments` | fleet_manager+ |
| `AllTripRequests` | `/fleet/requests` | fleet_manager+ |

---

## 4. Phase 2 — Trip Execution & Operations

**Migration:** `011_fleet_management_phase2.sql`
**Types:** `types/fleetPhase2.ts`
**Service:** `services/fleetPhase2Service.ts`

### What it does
Adds the operational layer — what happens during and after a trip is assigned. Drivers can start/end trips, record fuel stops, log expenses, and submit vehicle inspections.

### New Database Tables

#### `fuel_records`
Records every fuel purchase against a vehicle.

| Column | Description |
|--------|-------------|
| `vehicle_id` | Which vehicle was fuelled |
| `trip_request_id` | Optional — links fuel to a trip |
| `fuel_type` | petrol, diesel, electric, hybrid |
| `quantity_liters` | Litres filled |
| `cost_amount` | Total cost (KES) |
| `cost_per_liter` | Auto-calculated |
| `odometer_reading` | Km at time of refuel |
| `station_name` | Optional fuel station |
| `payment_method` | fuel_card, cash, mpesa, company_card |
| `is_verified` | fleet_manager marks verified |
| `refuel_datetime` | When the refuel happened |

#### `maintenance_records`
Tracks all servicing and repairs.

| Column | Description |
|--------|-------------|
| `vehicle_id` | Vehicle being serviced |
| `maintenance_type` | service, repair, inspection, tire_change, battery, body_work, other |
| `priority` | low, normal, high, critical |
| `status` | scheduled, in_progress, completed, cancelled |
| `description` | What was done |
| `labor_cost` / `parts_cost` / `total_cost` | Cost breakdown |
| `parts_replaced` | JSONB array of part names |
| `mechanic_name` / `service_center` | Who did the work |
| `scheduled_date` / `completed_date` | Timeline |
| `next_service_date` | When to service again |

#### `trip_expenses`
Records incidental costs during a trip (tolls, parking, meals, etc.).

| Column | Description |
|--------|-------------|
| `trip_request_id` | Which trip |
| `expense_type` | fuel, toll, parking, meals, accommodation, repairs, other |
| `amount` | Cost in KES |
| `expense_date` | When incurred |
| `receipt_url` | Optional document link |
| `is_approved` | Manager approval status |

#### `vehicle_inspections`
Structured pre/post-trip inspection checklists.

| Column | Description |
|--------|-------------|
| `inspection_type` | pre_trip, post_trip, periodic |
| `checklist` | JSONB — each item has `status`: pass/fail/na and optional `notes` |
| `overall_condition` | excellent, good, fair, poor |
| `damage_reported` | Boolean |
| `damage_description` / `damage_photos` | If damage found |
| `maintenance_priority` | Recommended priority if issues found |

#### `trip_logs`
Free-form activity log entries during a trip.

| Column | Description |
|--------|-------------|
| `trip_request_id` | Which trip |
| `log_type` | started, waypoint, break, refuel, incident, delay, completed, cancelled, note |
| `description` | What happened |
| `location` | Where (text) |
| `odometer_reading` | Km at this point |
| `duration_minutes` | Duration if applicable (e.g., break time) |

### Trip Execution Added Columns (on `trip_requests`)

| Column | Description |
|--------|-------------|
| `actual_start_datetime` | When driver pressed "Start Trip" |
| `actual_end_datetime` | When driver pressed "End Trip" |
| `start_odometer` | Odometer at trip start |
| `end_odometer` | Odometer at trip end |
| `actual_distance_km` | `end_odometer - start_odometer` |
| `trip_rating` | 1–5 star rating from driver |
| `trip_feedback` | Optional driver comment |

### Analytics Views (016_fleet_analytics_views.sql)

| View | Description |
|------|-------------|
| `fuel_efficiency_summary` | Per vehicle: total fuel cost, litres, km/litre, cost/km |
| `maintenance_cost_summary` | Per vehicle: total labour + parts cost, avg cost per service |
| `trip_statistics` | Per trip: planned vs actual times, distance, expenses, rating |

### Frontend Components (Phase 2)

| Component | Route | Who Uses It |
|-----------|-------|-------------|
| `TripExecution` | `/fleet/trip/:id/execute` | driver, fleet_manager |
| `TripDetails` | `/fleet/trip/:id/details` | driver, fleet_manager+ |
| `FuelManagement` | `/fleet/fuel` | driver, fleet_manager+ |
| `MaintenanceManagement` | `/fleet/maintenance` | fleet_manager+ |
| `VehicleInspections` | `/fleet/inspections` | driver, fleet_manager+ |
| `FleetAnalytics` | `/fleet/analytics` | fleet_manager+ |

---

## 5. Phase 3 — Compliance & Licensing

**Migration:** `017_compliance_tracking.sql`
**Types:** `types/fleetPhase3.ts`
**Service:** `services/complianceService.ts`
**Page:** `pages/CompliancePage.tsx`

### What it does
Tracks legal and regulatory compliance — vehicle documents (insurance, road tax, inspection certificates), driver licences, and auto-generates alerts when items approach expiry.

### New Database Tables

#### `vehicle_documents`
Stores all official vehicle paperwork.

| Column | Description |
|--------|-------------|
| `vehicle_id` | Which vehicle |
| `document_type` | insurance, road_tax, inspection_certificate, fire_extinguisher, first_aid_kit, other |
| `document_number` | Reference number |
| `issue_date` / `expiry_date` | Validity window |
| `document_status` | active, expired, expiring_soon, pending_renewal |
| `file_url` | Scanned document upload |
| `verified_by` | Who verified it |
| `verification_notes` | Verification comments |

#### `compliance_alerts`
Auto-generated and manual alerts for compliance issues.

| Column | Description |
|--------|-------------|
| `alert_type` | license_expiry, document_expiry, insurance_expiry, inspection_due, service_due, other |
| `alert_priority` | critical (≤7 days), high (≤14 days), medium (≤30 days), low (≤60 days) |
| `status` | active, acknowledged, resolved, dismissed |
| `title` / `description` | Human-readable alert text |
| `due_date` | When the item expires |
| `vehicle_id` / `driver_id` / `document_id` | What the alert is about |
| `acknowledged_by` / `resolved_by` | Who actioned it |
| `resolution_notes` | How it was resolved |

### Auto-Alert Generation

Two PostgreSQL functions automatically scan for upcoming expiries and create alerts:

- **`check_document_expiry_alerts()`** — scans `vehicle_documents` for items expiring within 60 days; inserts/updates `compliance_alerts` accordingly
- **`check_license_expiry_alerts()`** — scans `users_profile` for drivers with `license_expiry_date` within 60 days

These are called:
1. By the "Run Compliance Check" button in the `AlertsManager` UI
2. Can be scheduled via a Supabase cron job

### Driver Licence Columns Added to `users_profile`
```
license_number       TEXT
license_class        TEXT  (A, B, C, CE, etc.)
license_expiry_date  DATE
license_status       TEXT  (valid, expiring_soon, expired, suspended)
license_notes        TEXT
```

### Frontend Components (Phase 3)

All under `CompliancePage` at `/fleet/compliance` with 4 tabs:

| Tab Component | What it shows |
|---------------|---------------|
| `ComplianceDashboard` | Overview KPIs — expiring docs, expired licenses, active alerts |
| `DocumentManager` | Full CRUD for vehicle documents; filter by vehicle/type/status; upload documents |
| `LicenseTracker` | All driver licences with expiry status; edit licence details per driver |
| `AlertsManager` | All compliance alerts; acknowledge/resolve workflow; "Run Compliance Check" button |

---

## 6. Phase 4 — GPS, Reports, Budget & Driver App

**Migrations:** `018_gps_route_tracking.sql`, `019_fleet_budgets.sql`, `020_fleet_report_helpers.sql`
**Types:** `types/fleetPhase4.ts`

### 6.1 GPS Route Tracking

**Migration:** `018_gps_route_tracking.sql`
**Service:** `services/gpsService.ts`
**Component:** `components/fleet/RouteMap.tsx`

#### `trip_gps_logs` table

| Column | Description |
|--------|-------------|
| `trip_request_id` | Which trip this waypoint belongs to |
| `latitude` / `longitude` | GPS coordinates |
| `accuracy` | GPS fix accuracy in metres |
| `speed` | Speed in km/h (if available) |
| `heading` | Direction in degrees (if available) |
| `altitude` | Altitude in metres (if available) |
| `recorded_at` | Timestamp of waypoint |
| `is_offline_sync` | True if logged offline and synced later |

#### How GPS Tracking Works

1. **Trip Start** — `TripExecution` calls `startGpsTracking(tripId, 30000)` after a successful `startTrip()` call
2. **During Trip** — every 30 seconds, `@capacitor/geolocation` gets current position and calls `logGpsWaypoint()`
3. **Online** — waypoint inserts directly to Supabase `trip_gps_logs`
4. **Offline** — waypoint is pushed to `localStorage` queue (max 5,000 items, key: `fleet_gps_offline_queue`)
5. **Trip End** — `gpsStopFn()` stops the interval; `syncOfflineGpsQueue()` flushes the queue to Supabase with `is_offline_sync: true`
6. **View Route** — `TripDetails` Route Map tab renders a Leaflet map with polyline of all waypoints, green start / red end markers

#### GPS Distance Function (PostgreSQL)

`calculate_gps_distance_km(p_trip_id UUID)` — uses the Haversine formula across all waypoints for the trip. The Route Map compares this against the odometer distance to flag variance > 5 km.

#### Web vs Mobile

| Context | Behaviour |
|---------|-----------|
| Web browser | `startGpsTracking()` no-ops — Capacitor not available |
| iOS / Android | Uses `@capacitor/geolocation` with `enableHighAccuracy: true` |

---

### 6.2 Fleet Reports & Export

**Migration:** `020_fleet_report_helpers.sql`
**Service:** `services/fleetReportService.ts`
**Component:** `components/fleet/FleetReports.tsx`

#### Report Types

| Tab | Data Source | Filters Available |
|-----|-------------|-------------------|
| Trip History | `get_trip_history_report()` RPC | Date range, vehicle, driver, department |
| Fuel Costs | `get_fuel_cost_report()` RPC | Date range, vehicle |
| Maintenance | `maintenance_records` (client-side grouped) | Vehicle |
| Compliance Summary | `getComplianceSummary()` + `getComplianceAlerts()` | Active alerts only |

#### PostgreSQL Report Functions

**`get_trip_history_report(p_vehicle_id, p_driver_id, p_department_id, p_date_from, p_date_to)`**

Returns per-trip rows with: requester name, department, driver name, vehicle plate, destination, purpose, planned/actual times, distance (odometer), duration hours, total expenses, trip rating.

**`get_fuel_cost_report(p_vehicle_id, p_date_from, p_date_to)`**

Returns per-vehicle aggregated: total refills, total litres, total cost, avg cost/litre, distance (max-min odometer), fuel efficiency (km/litre), cost per km.

#### Export Options

| Format | How |
|--------|-----|
| CSV | `exportToCSV()` — creates UTF-8 BOM blob, triggers browser download |
| PDF | `exportToPDF()` — dynamically imports jsPDF + autoTable, generates table-based PDF |
| Print | CSS `@media print` hides sidebar and action buttons |

---

### 6.3 Cost & Budget Management

**Migration:** `019_fleet_budgets.sql`
**Service:** `services/fleetReportService.ts` (budget functions)
**Component:** `components/fleet/FleetBudget.tsx`

#### `fleet_budgets` table

| Column | Description |
|--------|-------------|
| `department_id` | Which department owns this budget |
| `category` | fuel, maintenance, insurance, other |
| `budget_year` | e.g. 2026 |
| `budget_month` | 1–12 (NULL = annual budget) |
| `budget_amount` | Budgeted spend in KES |
| `notes` | Optional context |

#### Views

**`fleet_budget_actuals`** — Joins `fleet_budgets` against actual fuel and maintenance spend per department per month:
- `budget_amount` vs `actual_fuel` + `actual_maintenance`
- Calculates `variance` and `utilisation_pct`

**`vehicle_tco` (Total Cost of Ownership)** — Per vehicle:
- `total_fuel_cost` — sum of all fuel records
- `total_maintenance_cost` — sum of all completed maintenance
- `total_cost` — combined
- `cost_per_km` — total cost ÷ distance driven
- `age_months` — vehicle age since manufacture year

#### Budget UI

`FleetBudget` has 2 tabs:
1. **Budget Management** — period selector (year + month), KPI cards (Total Budget / Total Actual / Variance / % Used), budget vs actuals table with progress bars and On Track / Over Budget badges, Add/Edit/Delete budget entries
2. **TCO Analysis** — all vehicles ranked by total cost descending, with cost/km and age, CSV export

---

### 6.4 Driver Mobile Experience

**Service:** `services/pushNotificationService.ts`
**Component:** `components/fleet/DriverDashboard.tsx`

#### Driver Dashboard (`/fleet/driver-dashboard`)

A mobile-optimised view exclusively for the `driver` role showing:

| Section | Content |
|---------|---------|
| Active Trip Banner | If a trip is `in_progress` — green banner with "Continue Trip" button |
| Offline GPS Banner | If offline queue has pending points — shows count + "Sync Now" button |
| Stats Row | Today's trips count, upcoming (7 days) count, active compliance alerts, licence expiry countdown |
| Today's Trips | Cards with destination, time, vehicle plate; "Start" button for assigned trips |
| Upcoming This Week | Table of next 7 days' assigned trips |
| Compliance Alerts | Active alerts for this driver (red/amber by priority) |

#### Push Notifications

On Driver Dashboard mount, `initPushNotifications()` is called:
1. Requests permission from device
2. Calls `PushNotifications.register()` (Capacitor)
3. On registration, saves the device token to `users_profile.push_token`
4. Listens for incoming notifications and action taps

`sendLocalNotification(title, body)` can fire immediate local device notifications (Capacitor only, no-op on web).

#### Navigation for Drivers

- **From `Dashboard.jsx`** (employee dashboard): shows "Driver Dashboard" + "My Trips" links instead of standard fleet links
- **`ProtectedRoute`** on `/fleet/driver-dashboard`: `allowedRoles={['driver']}` — non-drivers redirected to `/unauthorized`

---

## 7. Database Schema Reference

### Table Relationships

```
users_profile ──────────────────────────────────────────────┐
    │ (requester_id)                                         │
    │ (assigned_driver_id)                                   │
    ▼                                                        │
trip_requests ──────────────────────────────────────────────┤
    │ (trip_request_id)          (vehicle_id)               │
    ├──► trip_logs               fleet_vehicles ────────────┤
    ├──► trip_expenses               │ (vehicle_id)         │
    ├──► fuel_records ◄──────────────┤                      │
    ├──► vehicle_inspections         ├──► maintenance_records│
    └──► trip_gps_logs               ├──► vehicle_documents  │
                                     └──► compliance_alerts ─┘
                                                        │
departments ──────────────────────► fleet_budgets       │
    │                               fleet_budget_actuals│
    └──────────────────────────────────────────────────►┘
```

### All Fleet Tables

| Table | Phase | Purpose |
|-------|-------|---------|
| `fleet_vehicles` | 1 | Vehicle registry |
| `trip_requests` | 1 | Trip booking and execution (all phases add columns) |
| `fuel_records` | 2 | Fuel purchases per vehicle/trip |
| `maintenance_records` | 2 | Vehicle servicing and repairs |
| `trip_expenses` | 2 | Incidental trip costs |
| `vehicle_inspections` | 2 | Pre/post-trip inspection checklists |
| `trip_logs` | 2 | Timestamped activity log during trips |
| `vehicle_documents` | 3 | Insurance, road tax, certificates |
| `compliance_alerts` | 3 | Auto/manual compliance alerts |
| `trip_gps_logs` | 4 | GPS waypoints per trip |
| `fleet_budgets` | 4 | Monthly departmental budgets |

### Columns Added to Existing Tables

**`users_profile` additions across phases:**

| Column | Phase | Description |
|--------|-------|-------------|
| `license_number` | 1 | Driver's licence number |
| `license_class` | 1 | Licence class (A, B, C, CE…) |
| `license_expiry_date` | 3 | Licence expiry date |
| `license_status` | 3 | valid / expiring_soon / expired / suspended |
| `driver_rating` | 1 | Average trip rating |
| `total_trips_completed` | 1 | Lifetime trips |
| `total_distance_driven` | 1 | Lifetime km |
| `push_token` | 4 | Mobile push notification token |

---

## 8. Frontend Pages & Routes

### Fleet Routes in `App.tsx`

| Route | Component | Allowed Roles |
|-------|-----------|---------------|
| `/fleet/dashboard` | `FleetDashboard` | fleet_manager, hr_admin, super_admin |
| `/fleet/vehicles` | `VehicleList` | fleet_manager+ |
| `/fleet/vehicles/new` | `VehicleForm` | fleet_manager+ |
| `/fleet/vehicles/:id/edit` | `VehicleForm` | fleet_manager+ |
| `/fleet/drivers` | `DriverList` | fleet_manager+ |
| `/fleet/requests` | `AllTripRequests` | fleet_manager+ |
| `/fleet/my-trips` | `MyTripRequests` | All |
| `/fleet/trip-request/new` | `TripRequestForm` | All |
| `/fleet/assignments` | `TripAssignments` | fleet_manager+ |
| `/fleet/assignments/:id` | `TripAssignments` | fleet_manager+ |
| `/fleet/trip-approvals` | `TripApprovals` | hod, fleet_manager+ |
| `/fleet/trip/:id/execute` | `TripExecution` | All (RLS restricts data) |
| `/fleet/trip/:id/details` | `TripDetails` | All (RLS restricts data) |
| `/fleet/fuel` | `FuelManagement` | driver, fleet_manager+ |
| `/fleet/maintenance` | `MaintenanceManagement` | fleet_manager+ |
| `/fleet/inspections` | `VehicleInspections` | driver, fleet_manager+ |
| `/fleet/analytics` | `FleetAnalytics` | fleet_manager+ |
| `/fleet/compliance` | `CompliancePage` | fleet_manager+ |
| `/fleet/reports` | `FleetReports` | fleet_manager+ |
| `/fleet/budget` | `FleetBudget` | fleet_manager+ |
| `/fleet/driver-dashboard` | `DriverDashboard` | driver only |

### Sidebar Access

**`AdminSidebar.tsx`** — used on all fleet/admin pages, role-based menu groups:

| Role | Fleet Menu Items |
|------|-----------------|
| `driver` | My Dashboard, My Trips, Fuel Records, Inspections |
| `fleet_manager` | Dashboard, Vehicles, Drivers, Assignments, All Requests, Fuel, Maintenance, Inspections, Compliance, Analytics, Reports & Export, Budget & TCO |
| `hr_admin` / `super_admin` | Same as fleet_manager (within Fleet Management group) |

**`Dashboard.jsx`** — the employee landing page sidebar:
- `driver` role sees: Driver Dashboard, My Trips
- All other roles see: My Trip Requests, Request Trip (+ Trip Approvals for HODs)

---

## 9. Trip Lifecycle (End-to-End)

```
1. EMPLOYEE submits trip request
   → TripRequestForm → createTripRequest() → status: 'pending'
   → request_number auto-generated: TR-2026-0001

2. HOD / FLEET MANAGER approves
   → TripApprovals → approveTripRequest() → status: 'approved'
   (or rejectTripRequest() → status: 'rejected')

3. FLEET MANAGER assigns vehicle + driver
   → TripAssignments → assignTripRequest() → status: 'assigned'
   → Checks is_vehicle_available() and is_driver_available()
   → Checks is_user_on_leave() for driver

4. DRIVER starts trip
   → TripExecution → startTrip({ start_odometer }) → status: 'in_progress'
   → GPS tracking starts: startGpsTracking(tripId, 30000)
   → Offline GPS queue synced

5. DURING TRIP (optional)
   → Driver logs waypoints, fuel stops, incidents via TripDetails
   → GPS logs every 30s (or queued offline)

6. DRIVER ends trip
   → TripExecution → endTrip({ end_odometer, trip_rating, feedback }) → status: 'completed'
   → GPS tracking stops
   → Offline GPS queue flushed to Supabase

7. POST-TRIP (fleet manager)
   → View Route Map tab in TripDetails (GPS path on Leaflet map)
   → Review fuel records, expenses, inspection
   → Verify/approve expenses
   → compliance alerts auto-update if license/doc expiry near

8. REPORTING
   → FleetReports → Trip History / Fuel Costs / Maintenance / Compliance tabs
   → Export CSV or PDF
   → FleetBudget → compare actual spend vs budget by department
```

---

## 10. SQL Migrations Run Order

Run these in Supabase SQL Editor in order:

| Order | File | What it creates |
|-------|------|----------------|
| 1 | `migrations/010_fleet_management_phase1.sql` | Core tables: fleet_vehicles, trip_requests |
| 2 | `migrations/011_fleet_management_phase2.sql` | fuel_records, maintenance_records, trip_expenses, vehicle_inspections, trip_logs |
| 3 | `016_fleet_analytics_views.sql` | Views: fuel_efficiency_summary, maintenance_cost_summary, trip_statistics |
| 4 | `017_compliance_tracking.sql` | vehicle_documents, compliance_alerts, alert functions |
| 5 | `018_gps_route_tracking.sql` | trip_gps_logs, calculate_gps_distance_km() |
| 6 | `019_fleet_budgets.sql` | fleet_budgets, fleet_budget_actuals view, vehicle_tco view |
| 7 | `020_fleet_report_helpers.sql` | get_trip_history_report() RPC, get_fuel_cost_report() RPC |

> **Note:** Other numbered migrations (012–015, 017_fix_*) address RLS fixes and feature flags — run these if prompted by errors after the above.

---

*Document covers all 4 phases of the Fleet Management System as implemented in the FKF HR System codebase.*
