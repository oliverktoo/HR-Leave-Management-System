# FleetOS Integration Blueprint
## Vehicle & Fleet Management Module for FKF HR System

**Version:** 1.0  
**Date:** March 10, 2026  
**Status:** Pre-Development  
**Author:** Development Team  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Phase 1: Core Booking System](#4-phase-1-core-booking-system)
5. [Phase 2: Anti-Fraud & Fuel Management](#5-phase-2-anti-fraud--fuel-management)
6. [Phase 3: Operations & Compliance](#6-phase-3-operations--compliance)
7. [Phase 4: Analytics & Reporting](#7-phase-4-analytics--reporting)
8. [Database Schema](#8-database-schema)
9. [API Endpoints](#9-api-endpoints)
10. [UI/UX Components](#10-uiux-components)
11. [Integration Points](#11-integration-points)
12. [Security Considerations](#12-security-considerations)
13. [Testing Strategy](#13-testing-strategy)
14. [Deployment Plan](#14-deployment-plan)

---

## 1. Executive Summary

### 1.1 Purpose
Integrate a comprehensive Fleet Management System (FleetOS) into the existing FKF HR System to:
- Eliminate fuel fraud through GPS verification and receipt documentation
- Streamline trip request and approval workflows
- Provide real-time operational control over the vehicle fleet
- Enable cost tracking and allocation by department

### 1.2 Key Benefits
| Benefit | Target Metric |
|---------|---------------|
| Reduce fuel fraud | 20% reduction in fuel waste within 6 months |
| Improve efficiency | 50% faster trip request processing |
| Better visibility | 100% trip tracking with GPS breadcrumbs |
| Cost allocation | Accurate per-department vehicle costs |

### 1.3 Integration Advantage
By integrating with the existing HR system, we gain:
- **Single Sign-On**: Use existing employee authentication
- **Role Inheritance**: HODs automatically approve for their departments
- **Leave Integration**: Block requests from employees on leave
- **Department Structure**: Automatic cost allocation
- **Existing Infrastructure**: Same Supabase backend, React frontend

---

## 2. System Overview

### 2.1 Module Structure
```
HR System
├── Existing Modules
│   ├── User Management
│   ├── Leave Management
│   ├── Attendance
│   └── Documents
│
└── NEW: Fleet Management
    ├── Vehicle Registry
    ├── Trip Requests
    ├── Trip Execution
    ├── Fuel Management
    ├── Maintenance Tracking
    └── Fleet Analytics
```

### 2.2 User Journey Flow
```
┌─────────────────────────────────────────────────────────────────┐
│                     TRIP REQUEST WORKFLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Staff          HOD/Admin        Fleet Manager      Driver       │
│    │                │                  │              │          │
│    ▼                │                  │              │          │
│ [Submit Request]    │                  │              │          │
│    │                ▼                  │              │          │
│    └──────────► [Approve/Reject]       │              │          │
│                     │                  ▼              │          │
│                     └──────────► [Assign Vehicle     │          │
│                                   & Driver]          │          │
│                                        │             ▼          │
│                                        └──────► [Start Trip]    │
│                                                      │          │
│                                                      ▼          │
│                                               [Log Fuel/GPS]    │
│                                                      │          │
│                                                      ▼          │
│                                                [End Trip]       │
│                                                      │          │
│                                                      ▼          │
│                                            [Auto-Generate       │
│                                              Reports]           │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Technical Stack
| Component | Technology | Notes |
|-----------|------------|-------|
| Frontend | React 19 + TypeScript | Existing stack |
| Backend | Supabase (PostgreSQL) | Existing infrastructure |
| Auth | Supabase Auth | Single sign-on with HR |
| Storage | Supabase Storage | Fuel receipt photos |
| Maps | Leaflet / Mapbox | GPS visualization |
| Mobile | Capacitor | iOS & Android apps |
| Notifications | Supabase + FCM | Push notifications |

---

## 3. User Roles & Permissions

### 3.1 Role Matrix

| Permission | Employee | Driver | HOD | Fleet Manager | HR Admin | Super Admin |
|------------|:--------:|:------:|:---:|:-------------:|:--------:|:-----------:|
| **Trip Requests** |
| Submit trip request | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View own requests | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cancel own request | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approve dept requests | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| Approve all requests | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **Trip Execution** |
| View assigned trips | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ |
| Start/End trips | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Log fuel | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Pre-trip inspection | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Vehicle Management** |
| View all vehicles | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Add/Edit vehicles | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Assign drivers | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Schedule maintenance | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **Driver Management** |
| View driver profiles | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Add/Update drivers | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Verify licenses | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Analytics** |
| View own trip history | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View dept analytics | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| View fleet analytics | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Export reports | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |

### 3.2 New Role: Fleet Manager
```sql
-- Add to existing roles enum
ALTER TYPE user_role ADD VALUE 'fleet_manager';
```

### 3.3 Driver Attribute
Rather than a separate role, "Driver" is an **attribute** on user_profiles:
```sql
-- Driver is an attribute, not a role
-- An employee can be both HOD and a Driver
ALTER TABLE user_profiles ADD COLUMN is_driver BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN driver_license_number VARCHAR(50);
ALTER TABLE user_profiles ADD COLUMN driver_license_expiry DATE;
ALTER TABLE user_profiles ADD COLUMN driver_license_class VARCHAR(10);
```

---

## 4. Phase 1: Core Booking System

### 4.1 Overview
**Duration:** 2-3 weeks  
**Goal:** Enable staff to request trips, HODs to approve, and fleet managers to assign vehicles & drivers

### 4.2 Features

#### 4.2.1 Vehicle Registry
- Add/Edit/Deactivate vehicles
- Track vehicle details (plate, model, capacity, fuel type)
- Assign vehicles to departments (optional)
- View vehicle availability calendar

#### 4.2.2 Trip Request Submission
- Select travel date/time range
- Enter destination (single or multi-stop)
- Add purpose and business justification
- Add passengers (from employee list)
- View vehicle availability
- Request specific vehicle (optional)

#### 4.2.3 Request Approval Workflow
- HOD receives notification on new request
- View requester details, leave status, department
- Approve, Reject, or Request More Info
- Add comments/conditions
- Auto-approve rules (optional, e.g., <50km = auto-approve)

#### 4.2.4 Vehicle & Driver Assignment
- Fleet manager views approved requests
- Check vehicle availability
- Check driver availability (not on leave, license valid)
- Assign vehicle and driver
- Notify all parties (requester, driver, passengers)

### 4.3 User Stories

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| P1-01 | Staff | Submit a trip request | I can book a vehicle for work travel |
| P1-02 | Staff | See my request status | I know if my trip is approved |
| P1-03 | Staff | Cancel a pending request | I can change my plans |
| P1-04 | HOD | See pending requests for my dept | I can approve/reject them |
| P1-05 | HOD | Approve with conditions | I can add special instructions |
| P1-06 | Fleet Mgr | See all approved requests | I can assign vehicles |
| P1-07 | Fleet Mgr | Check vehicle availability | I don't double-book |
| P1-08 | Fleet Mgr | Assign driver to trip | The trip can proceed |
| P1-09 | Driver | See my assigned trips | I know my schedule |
| P1-10 | Driver | Get push notification | I'm alerted to new assignments |

### 4.4 Database Tables (Phase 1)

```sql
-- Table: fleet_vehicles
CREATE TABLE fleet_vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate_number VARCHAR(20) NOT NULL UNIQUE,
    make VARCHAR(50) NOT NULL,
    model VARCHAR(50) NOT NULL,
    year INTEGER,
    color VARCHAR(30),
    fuel_type VARCHAR(20) DEFAULT 'petrol', -- petrol, diesel, electric, hybrid
    seating_capacity INTEGER DEFAULT 5,
    current_odometer DECIMAL(10,1) DEFAULT 0,
    assigned_department_id UUID REFERENCES departments(id),
    status VARCHAR(20) DEFAULT 'active', -- active, maintenance, retired
    insurance_expiry DATE,
    next_service_date DATE,
    next_service_odometer DECIMAL(10,1),
    fuel_card_number VARCHAR(50),
    photo_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Table: trip_requests
CREATE TABLE trip_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES auth.users(id),
    department_id UUID REFERENCES departments(id),
    
    -- Trip Details
    purpose TEXT NOT NULL,
    destination TEXT NOT NULL,
    multi_stop_destinations JSONB, -- [{address, order}]
    start_datetime TIMESTAMPTZ NOT NULL,
    end_datetime TIMESTAMPTZ NOT NULL,
    estimated_distance_km DECIMAL(8,1),
    
    -- Passengers
    passengers JSONB, -- [{user_id, name}]
    passenger_count INTEGER DEFAULT 1,
    
    -- Vehicle Preference
    preferred_vehicle_id UUID REFERENCES fleet_vehicles(id),
    vehicle_requirements TEXT, -- e.g., "Need 4x4", "Wheelchair accessible"
    
    -- Approval
    status VARCHAR(20) DEFAULT 'pending', 
    -- pending, approved, rejected, assigned, in_progress, completed, cancelled
    
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    approval_comments TEXT,
    rejection_reason TEXT,
    
    -- Assignment (after approval)
    assigned_vehicle_id UUID REFERENCES fleet_vehicles(id),
    assigned_driver_id UUID REFERENCES auth.users(id),
    assigned_by UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: driver_profiles (extends user_profiles)
-- This adds driver-specific fields to existing users
CREATE TABLE driver_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id),
    
    license_number VARCHAR(50) NOT NULL,
    license_class VARCHAR(10), -- e.g., BCE
    license_expiry DATE NOT NULL,
    license_photo_url TEXT,
    
    is_active BOOLEAN DEFAULT TRUE,
    driver_rating DECIMAL(3,2) DEFAULT 5.00, -- 1.00 to 5.00
    total_trips INTEGER DEFAULT 0,
    total_distance_km DECIMAL(12,1) DEFAULT 0,
    
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.5 UI Components (Phase 1)

| Component | Location | Description |
|-----------|----------|-------------|
| FleetDashboard | /fleet | Overview of fleet status, pending requests |
| VehicleList | /fleet/vehicles | List all vehicles with filters |
| VehicleDetail | /fleet/vehicles/:id | Single vehicle view with calendar |
| VehicleForm | /fleet/vehicles/new | Add/Edit vehicle form |
| TripRequestForm | /fleet/requests/new | Multi-step trip request form |
| MyTripRequests | /fleet/my-requests | Staff view of their requests |
| PendingApprovals | /fleet/approvals | HOD view of pending requests |
| TripAssignment | /fleet/assign | Fleet manager assignment view |
| DriverQueue | /fleet/driver | Driver's assigned trips |

### 4.6 API Endpoints (Phase 1)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | /api/fleet/vehicles | List all vehicles | Fleet Mgr+ |
| GET | /api/fleet/vehicles/:id | Get vehicle details | Fleet Mgr+ |
| POST | /api/fleet/vehicles | Create vehicle | Fleet Mgr+ |
| PUT | /api/fleet/vehicles/:id | Update vehicle | Fleet Mgr+ |
| GET | /api/fleet/vehicles/:id/availability | Check availability | All |
| POST | /api/fleet/requests | Submit trip request | All |
| GET | /api/fleet/requests | List requests (filtered) | All |
| GET | /api/fleet/requests/:id | Get request details | Owner/HOD/Mgr |
| PUT | /api/fleet/requests/:id/approve | Approve request | HOD/Fleet Mgr |
| PUT | /api/fleet/requests/:id/reject | Reject request | HOD/Fleet Mgr |
| PUT | /api/fleet/requests/:id/assign | Assign vehicle/driver | Fleet Mgr |
| GET | /api/fleet/drivers | List available drivers | Fleet Mgr |
| GET | /api/fleet/drivers/:id | Get driver profile | Fleet Mgr/HR |

### 4.7 Notifications (Phase 1)

| Event | Recipients | Channel |
|-------|------------|---------|
| New trip request | HOD | Push, Email |
| Request approved | Requester | Push, Email |
| Request rejected | Requester | Push, Email |
| Driver assigned | Driver, Requester | Push, Email |
| Trip reminder (1 day before) | Driver, Requester | Push |

---

## 5. Phase 2: Anti-Fraud & Fuel Management

### 5.1 Overview
**Duration:** 2-3 weeks  
**Goal:** Implement fuel logging with fraud prevention, GPS tracking, and variance detection

### 5.2 Features

#### 5.2.1 Trip Execution (Driver)
- Start trip (capture odometer, GPS location)
- GPS breadcrumb recording during trip
- End trip (capture odometer, GPS location)
- Auto-calculate distance traveled

#### 5.2.2 Fuel Logging with Verification
- Log fuel amount and cost
- Mandatory receipt photo upload
- GPS capture at fuel station
- **Geofence verification**: Check if at authorized station
- Odometer reading capture
- Expected consumption calculation
- **Variance alert**: Flag if >20% deviation from expected

#### 5.2.3 Pre-Trip Inspection
- Digital checklist (tires, lights, oil, etc.)
- Photo capture of any damage
- Sign-off before starting trip
- Historical inspection records

### 5.3 User Stories

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| P2-01 | Driver | Start trip with odometer photo | Trip distance is accurately recorded |
| P2-02 | Driver | See GPS navigation to destination | I can find my way |
| P2-03 | Driver | Log fuel with receipt photo | Fuel expenses are documented |
| P2-04 | Driver | Complete pre-trip inspection | Vehicle issues are documented |
| P2-05 | Fleet Mgr | See fuel variance alerts | I can investigate fraud |
| P2-06 | Fleet Mgr | View GPS breadcrumbs for any trip | I can audit driver routes |
| P2-07 | Fleet Mgr | See list of authorized fuel stations | I can verify fueling locations |
| P2-08 | Admin | Add authorized fuel stations | Geofencing works correctly |

### 5.4 Database Tables (Phase 2)

```sql
-- Table: trips (execution records)
CREATE TABLE trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES trip_requests(id),
    driver_id UUID NOT NULL REFERENCES auth.users(id),
    vehicle_id UUID NOT NULL REFERENCES fleet_vehicles(id),
    
    -- Start
    start_time TIMESTAMPTZ,
    start_odometer DECIMAL(10,1),
    start_odometer_photo_url TEXT,
    start_gps_coords POINT,
    start_location_name TEXT,
    
    -- End
    end_time TIMESTAMPTZ,
    end_odometer DECIMAL(10,1),
    end_odometer_photo_url TEXT,
    end_gps_coords POINT,
    end_location_name TEXT,
    
    -- Calculated
    actual_distance_km DECIMAL(8,1),
    duration_minutes INTEGER,
    
    -- GPS Tracking
    gps_breadcrumbs JSONB, -- [{lat, lng, timestamp, speed}]
    route_polyline TEXT, -- Encoded polyline for map display
    
    -- Inspection
    pre_trip_inspection JSONB, -- {items: [{name, status, notes, photo}], completed_at}
    post_trip_notes TEXT,
    damage_reported BOOLEAN DEFAULT FALSE,
    damage_photos JSONB, -- [{url, description}]
    
    -- Status
    status VARCHAR(20) DEFAULT 'not_started',
    -- not_started, in_progress, completed, cancelled
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: fuel_logs
CREATE TABLE fuel_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES trips(id),
    vehicle_id UUID NOT NULL REFERENCES fleet_vehicles(id),
    driver_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Fuel Details
    fuel_amount_liters DECIMAL(8,2) NOT NULL,
    cost DECIMAL(10,2) NOT NULL,
    price_per_liter DECIMAL(6,2),
    fuel_type VARCHAR(20),
    
    -- Verification
    receipt_photo_url TEXT NOT NULL,
    odometer_reading DECIMAL(10,1) NOT NULL,
    odometer_photo_url TEXT,
    
    -- Location
    station_name TEXT,
    station_gps_coords POINT NOT NULL,
    is_authorized_station BOOLEAN,
    station_id UUID REFERENCES fuel_stations(id),
    
    -- Fraud Detection
    expected_consumption_liters DECIMAL(8,2),
    variance_percentage DECIMAL(5,2),
    variance_flag BOOLEAN DEFAULT FALSE, -- True if >20% variance
    variance_reviewed BOOLEAN DEFAULT FALSE,
    variance_notes TEXT,
    reviewed_by UUID REFERENCES auth.users(id),
    
    -- Payment
    fuel_card_used BOOLEAN DEFAULT FALSE,
    fuel_card_transaction_id VARCHAR(50),
    payment_method VARCHAR(20), -- card, cash, fuel_card
    
    logged_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: fuel_stations (authorized stations for geofencing)
CREATE TABLE fuel_stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    brand VARCHAR(50),
    address TEXT,
    gps_coords POINT NOT NULL,
    geofence_radius_meters INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: inspection_templates
CREATE TABLE inspection_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    items JSONB NOT NULL, -- [{name, required, photo_required}]
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.5 Anti-Fraud Logic

```typescript
// Fuel Variance Calculation
function calculateFuelVariance(
    fuelAdded: number,       // liters
    distanceSinceLastFill: number,  // km
    vehicleFuelEfficiency: number   // km per liter (average for vehicle)
): { expected: number; variance: number; flagged: boolean } {
    
    const expected = distanceSinceLastFill / vehicleFuelEfficiency;
    const variance = ((fuelAdded - expected) / expected) * 100;
    const flagged = Math.abs(variance) > 20; // Flag if >20% variance
    
    return { expected, variance, flagged };
}

// Geofence Check
function isAtAuthorizedStation(
    currentCoords: { lat: number; lng: number },
    stations: FuelStation[]
): { authorized: boolean; station: FuelStation | null } {
    
    for (const station of stations) {
        const distance = calculateDistance(currentCoords, station.gps_coords);
        if (distance <= station.geofence_radius_meters) {
            return { authorized: true, station };
        }
    }
    return { authorized: false, station: null };
}
```

### 5.6 UI Components (Phase 2)

| Component | Location | Description |
|-----------|----------|-------------|
| TripExecution | /fleet/trip/:id | Driver's trip execution screen |
| StartTripForm | /fleet/trip/:id/start | Capture start odometer, GPS |
| PreTripInspection | /fleet/trip/:id/inspect | Inspection checklist |
| FuelLogForm | /fleet/trip/:id/fuel | Log fuel with receipt |
| EndTripForm | /fleet/trip/:id/end | End trip with final odometer |
| TripMap | /fleet/trip/:id/map | GPS breadcrumb visualization |
| FuelVarianceReport | /fleet/reports/fuel-variance | Admin view of flagged entries |
| FuelStationManager | /fleet/admin/stations | Manage authorized stations |

---

## 6. Phase 3: Operations & Compliance

### 6.1 Overview
**Duration:** 2-3 weeks  
**Goal:** Add maintenance scheduling, driver license tracking, insurance management

### 6.2 Features

#### 6.2.1 Maintenance Management
- Schedule routine maintenance (by date or odometer)
- Track maintenance history
- Automatic service due alerts
- Mark vehicle as "In Maintenance" status
- Log maintenance costs

#### 6.2.2 Driver License Compliance
- Track license numbers and expiry dates
- Automatic expiry alerts (30, 14, 7 days)
- Block assignment if license expired
- License verification workflow

#### 6.2.3 Insurance & Registration Tracking
- Insurance expiry tracking with alerts
- Registration renewal tracking
- Document storage for certificates
- Compliance dashboard

#### 6.2.4 Vehicle Documents
- Store all vehicle documents (insurance, registration, inspection certificates)
- Expiry alerts for all tracked documents
- Document approval workflow

### 6.3 User Stories

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| P3-01 | Fleet Mgr | Schedule vehicle maintenance | Vehicles stay in good condition |
| P3-02 | Fleet Mgr | Get alerts when service is due | I don't miss maintenance dates |
| P3-03 | Fleet Mgr | See driver license expiry dates | I ensure compliance |
| P3-04 | Fleet Mgr | Block expired-license drivers | We stay legally compliant |
| P3-05 | HR Admin | Verify driver licenses | New drivers are properly vetted |
| P3-06 | Fleet Mgr | Track insurance renewals | Vehicles are always insured |
| P3-07 | Driver | Upload my license renewal | My records stay current |
| P3-08 | Admin | View compliance dashboard | I see overall fleet compliance |

### 6.4 Database Tables (Phase 3)

```sql
-- Table: vehicle_maintenance
CREATE TABLE vehicle_maintenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES fleet_vehicles(id),
    
    maintenance_type VARCHAR(50) NOT NULL, -- routine, repair, inspection, tire, oil_change
    description TEXT,
    
    -- Scheduling
    scheduled_date DATE,
    scheduled_odometer DECIMAL(10,1),
    
    -- Completion
    completed_date DATE,
    completed_odometer DECIMAL(10,1),
    completed_by VARCHAR(100),
    
    -- Cost
    cost DECIMAL(10,2),
    parts_cost DECIMAL(10,2),
    labor_cost DECIMAL(10,2),
    vendor VARCHAR(100),
    invoice_number VARCHAR(50),
    invoice_photo_url TEXT,
    
    -- Details
    work_performed TEXT,
    parts_replaced JSONB, -- [{part, quantity, cost}]
    next_service_date DATE,
    next_service_odometer DECIMAL(10,1),
    
    status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, in_progress, completed, cancelled
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Table: vehicle_documents
CREATE TABLE vehicle_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES fleet_vehicles(id),
    
    document_type VARCHAR(50) NOT NULL, -- insurance, registration, inspection, permit
    document_number VARCHAR(100),
    issuing_authority VARCHAR(100),
    
    issue_date DATE,
    expiry_date DATE NOT NULL,
    
    document_url TEXT NOT NULL,
    
    -- Approval
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected, expired
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Table: compliance_alerts
CREATE TABLE compliance_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    alert_type VARCHAR(50) NOT NULL, 
    -- license_expiry, insurance_expiry, service_due, registration_expiry
    
    entity_type VARCHAR(20) NOT NULL, -- vehicle, driver
    entity_id UUID NOT NULL,
    
    alert_date DATE NOT NULL,
    expiry_date DATE,
    
    days_until_expiry INTEGER,
    severity VARCHAR(20), -- info, warning, critical
    
    is_acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by UUID REFERENCES auth.users(id),
    acknowledged_at TIMESTAMPTZ,
    
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.5 Compliance Alert Rules

| Alert Type | Days Before | Severity | Action |
|------------|-------------|----------|--------|
| License Expiry | 30 | Info | Notify driver & fleet manager |
| License Expiry | 14 | Warning | Notify driver, fleet manager, HR |
| License Expiry | 7 | Critical | Block from assignments |
| License Expiry | 0 | Critical | Auto-deactivate driver |
| Insurance Expiry | 30 | Info | Notify fleet manager |
| Insurance Expiry | 14 | Warning | Escalate to admin |
| Insurance Expiry | 7 | Critical | Mark vehicle unavailable |
| Service Due | 500 km or 14 days | Warning | Notify fleet manager |
| Service Due | 100 km or 3 days | Critical | Schedule required |

---

## 7. Phase 4: Analytics & Reporting

### 7.1 Overview
**Duration:** 2 weeks  
**Goal:** Implement comprehensive dashboards, KPI tracking, and exportable reports

### 7.2 Features

#### 7.2.1 Fleet Dashboard
- Fleet utilization rate
- Active trips in real-time
- Vehicles by status (available, in-use, maintenance)
- Pending requests count
- Today's trip schedule

#### 7.2.2 Fuel Analytics
- Total fuel consumption (daily/weekly/monthly)
- Cost per kilometer by vehicle
- Fuel efficiency trends
- Fraud variance report
- Station usage breakdown

#### 7.2.3 Driver Performance
- Driver rating system
- Trips completed count
- Distance driven
- Fuel efficiency score
- Incident history

#### 7.2.4 Cost Allocation
- Department-wise trip costs
- Vehicle operating costs
- Cost per trip analysis
- Budget vs actual tracking
- Project code allocation

#### 7.2.5 Exportable Reports
- Monthly fleet utilization report
- Fuel consumption report
- Maintenance history report
- Compliance status report
- Carbon footprint report (CO2 emissions)

### 7.3 User Stories

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| P4-01 | Fleet Mgr | View fleet utilization metrics | I optimize vehicle usage |
| P4-02 | Fleet Mgr | See cost per km by vehicle | I identify inefficient vehicles |
| P4-03 | Fleet Mgr | View driver performance scores | I reward good drivers |
| P4-04 | HOD | See department trip costs | I manage my budget |
| P4-05 | Finance | Export monthly fuel report | I process reimbursements |
| P4-06 | Admin | View compliance dashboard | I ensure regulatory compliance |
| P4-07 | CEO | See carbon footprint report | We track ESG metrics |
| P4-08 | Fleet Mgr | Compare fuel consumption trends | I identify anomalies |

### 7.4 Dashboard Metrics

#### 7.4.1 Fleet Manager Dashboard
```
┌─────────────────────────────────────────────────────────────┐
│  FLEET OVERVIEW                                             │
├──────────────┬──────────────┬──────────────┬───────────────┤
│  Vehicles    │  In Use      │  Available   │  Maintenance  │
│     12       │     4        │     6        │      2        │
├──────────────┴──────────────┴──────────────┴───────────────┤
│                                                             │
│  TODAY'S TRIPS         │  PENDING REQUESTS                 │
│  ┌───────────────┐     │  ┌──────────────────────────┐     │
│  │ 08:00 KBA 123 │     │  │ Nairobi → Mombasa (HOD)  │     │
│  │ 09:30 KCA 456 │     │  │ Office → Airport (Mgr)   │     │
│  │ 14:00 KDA 789 │     │  └──────────────────────────┘     │
│  └───────────────┘     │                                   │
│                        │                                   │
├────────────────────────┴───────────────────────────────────┤
│  ALERTS                                                     │
│  ⚠️ KBA 123 service due in 3 days                          │
│  ⚠️ John's license expires in 14 days                      │
│  🔴 Fuel variance flagged for trip #TR-2024-0892           │
└─────────────────────────────────────────────────────────────┘
```

#### 7.4.2 Key Performance Indicators

| KPI | Formula | Target |
|-----|---------|--------|
| Fleet Utilization | (Active trip hours / Available hours) × 100 | >70% |
| Fuel Efficiency | Total km / Total liters | Varies by vehicle |
| Fuel Variance Rate | Flagged logs / Total logs × 100 | <5% |
| Request Approval Time | Avg time from request to approval | <4 hours |
| Driver Rating | Avg of all driver ratings | >4.0 |
| Compliance Score | Valid documents / Total documents × 100 | 100% |
| Carbon Emissions | Total liters × CO2 factor | Decreasing trend |

---

## 8. Database Schema

### 8.1 Complete ERD

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   auth.users    │       │  user_profiles  │       │   departments   │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK)         │◄──┐   │ id (PK)         │   ┌──►│ id (PK)         │
│ email           │   │   │ user_id (FK)────┼───┤   │ name            │
│ ...             │   │   │ department_id   │───┘   │ ...             │
└─────────────────┘   │   │ role            │       └─────────────────┘
                      │   │ ...             │
                      │   └─────────────────┘
                      │
┌─────────────────┐   │   ┌─────────────────┐       ┌─────────────────┐
│ driver_profiles │   │   │  trip_requests  │       │ fleet_vehicles  │
├─────────────────┤   │   ├─────────────────┤       ├─────────────────┤
│ id (PK)         │   │   │ id (PK)         │   ┌──►│ id (PK)         │
│ user_id (FK)────┼───┤   │ requester_id────┼───┤   │ plate_number    │
│ license_number  │   │   │ department_id   │   │   │ make/model      │
│ license_expiry  │   │   │ destination     │   │   │ status          │
│ ...             │   │   │ status          │   │   │ ...             │
└─────────────────┘   │   │ assigned_vehicle┼───┘   └─────────────────┘
                      │   │ assigned_driver─┼───┐           │
                      │   │ ...             │   │           │
                      │   └─────────────────┘   │           │
                      │           │             │           │
                      │           ▼             │           │
                      │   ┌─────────────────┐   │           │
                      │   │     trips       │   │           │
                      │   ├─────────────────┤   │           │
                      │   │ id (PK)         │   │           │
                      │   │ request_id (FK) │   │           │
                      └───┼─driver_id (FK)  │◄──┘           │
                          │ vehicle_id (FK)─┼───────────────┘
                          │ gps_breadcrumbs │
                          │ ...             │
                          └─────────────────┘
                                  │
                                  ▼
                          ┌─────────────────┐       ┌─────────────────┐
                          │   fuel_logs     │       │  fuel_stations  │
                          ├─────────────────┤       ├─────────────────┤
                          │ id (PK)         │   ┌──►│ id (PK)         │
                          │ trip_id (FK)    │   │   │ name            │
                          │ vehicle_id (FK) │   │   │ gps_coords      │
                          │ station_id (FK)─┼───┘   │ geofence_radius │
                          │ fuel_amount     │       │ ...             │
                          │ variance_flag   │       └─────────────────┘
                          │ ...             │
                          └─────────────────┘
```

### 8.2 RLS Policies

```sql
-- Vehicles: Read by anyone, write by fleet managers
CREATE POLICY "fleet_vehicles_select" ON fleet_vehicles
    FOR SELECT USING (true);

CREATE POLICY "fleet_vehicles_insert" ON fleet_vehicles
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid()
            AND role IN ('fleet_manager', 'super_admin')
        )
    );

-- Trip Requests: Users see own, HODs see department, Fleet Mgr sees all
CREATE POLICY "trip_requests_select" ON trip_requests
    FOR SELECT USING (
        requester_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.user_id = auth.uid()
            AND (
                up.role IN ('fleet_manager', 'super_admin')
                OR (up.role = 'hod' AND up.department_id = trip_requests.department_id)
            )
        )
        OR assigned_driver_id = auth.uid()
    );

-- Fuel Logs: Drivers see own, Fleet Mgr sees all
CREATE POLICY "fuel_logs_select" ON fuel_logs
    FOR SELECT USING (
        driver_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid()
            AND role IN ('fleet_manager', 'super_admin', 'hr_admin')
        )
    );
```

---

## 9. API Endpoints

### 9.1 Complete API Reference

#### Vehicles
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/fleet/vehicles | List vehicles (with filters) |
| GET | /api/fleet/vehicles/:id | Get vehicle details |
| POST | /api/fleet/vehicles | Create vehicle |
| PUT | /api/fleet/vehicles/:id | Update vehicle |
| DELETE | /api/fleet/vehicles/:id | Deactivate vehicle |
| GET | /api/fleet/vehicles/:id/availability | Check availability |
| GET | /api/fleet/vehicles/:id/history | Get trip history |
| GET | /api/fleet/vehicles/:id/maintenance | Get maintenance history |

#### Trip Requests
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/fleet/requests | List requests (filtered by role) |
| GET | /api/fleet/requests/:id | Get request details |
| POST | /api/fleet/requests | Submit new request |
| PUT | /api/fleet/requests/:id | Update request |
| DELETE | /api/fleet/requests/:id | Cancel request |
| PUT | /api/fleet/requests/:id/approve | Approve request |
| PUT | /api/fleet/requests/:id/reject | Reject request |
| PUT | /api/fleet/requests/:id/assign | Assign vehicle & driver |

#### Trips
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/fleet/trips | List trips |
| GET | /api/fleet/trips/:id | Get trip details |
| POST | /api/fleet/trips/:id/start | Start trip |
| POST | /api/fleet/trips/:id/end | End trip |
| POST | /api/fleet/trips/:id/fuel | Log fuel |
| POST | /api/fleet/trips/:id/inspection | Submit inspection |
| GET | /api/fleet/trips/:id/gps | Get GPS breadcrumbs |

#### Drivers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/fleet/drivers | List drivers |
| GET | /api/fleet/drivers/:id | Get driver profile |
| POST | /api/fleet/drivers | Create driver profile |
| PUT | /api/fleet/drivers/:id | Update driver profile |
| GET | /api/fleet/drivers/:id/availability | Check availability |

#### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/fleet/analytics/overview | Fleet overview stats |
| GET | /api/fleet/analytics/fuel | Fuel consumption report |
| GET | /api/fleet/analytics/costs | Cost analysis |
| GET | /api/fleet/analytics/drivers | Driver performance |
| GET | /api/fleet/analytics/compliance | Compliance status |
| GET | /api/fleet/reports/export | Export report (CSV/PDF) |

---

## 10. UI/UX Components

### 10.1 Navigation Structure

```
HR System Sidebar
├── Dashboard
├── Users
├── Leave Management
├── Attendance
├── Documents
├── Reports
│
└── Fleet Management (NEW)
    ├── Dashboard
    ├── Vehicles
    │   ├── All Vehicles
    │   ├── Add Vehicle
    │   └── Maintenance
    ├── Trip Requests
    │   ├── New Request
    │   ├── My Requests
    │   ├── Pending Approvals (HOD)
    │   └── All Requests (Fleet Mgr)
    ├── Trips
    │   ├── Active Trips
    │   ├── Driver Queue
    │   └── Trip History
    ├── Fuel
    │   ├── Fuel Logs
    │   ├── Variance Alerts
    │   └── Fuel Stations
    ├── Drivers
    │   ├── Driver List
    │   └── License Tracker
    └── Reports
        ├── Fleet Utilization
        ├── Fuel Consumption
        └── Compliance
```

### 10.2 Component Library

| Component | Purpose | Reusable? |
|-----------|---------|-----------|
| VehicleCard | Display vehicle summary | Yes |
| TripRequestCard | Display request summary | Yes |
| TripTimeline | Show trip progress | Yes |
| FuelLogForm | Capture fuel entry with photo | Yes |
| InspectionChecklist | Interactive inspection form | Yes |
| VehicleCalendar | Show bookings calendar | Yes |
| LiveMap | Real-time GPS map | Yes |
| VarianceAlert | Display fraud warning | Yes |
| ComplianceBadge | Show compliance status | Yes |
| DriverSelector | Pick available driver | Yes |

---

## 11. Integration Points

### 11.1 Existing HR System Integration

| Integration | Description |
|-------------|-------------|
| **Authentication** | Use existing Supabase auth - no new login |
| **User Profiles** | Extend with driver attributes, not separate users |
| **Departments** | Reuse for cost allocation and HOD approvals |
| **Leave System** | Check if requester/driver is on leave |
| **Notifications** | Extend existing notification service |
| **Documents** | Share upload infrastructure |

### 11.2 Leave Integration Logic

```typescript
// Block trip request if requester is on approved leave
async function canSubmitRequest(userId: string, tripDate: Date): Promise<boolean> {
    const { data: leaves } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .lte('start_date', tripDate)
        .gte('end_date', tripDate);
    
    return leaves?.length === 0;
}

// Block driver assignment if driver is on leave
async function canAssignDriver(driverId: string, tripDate: Date): Promise<boolean> {
    // Same check
}
```

### 11.3 Sidebar Integration

```tsx
// Add to AdminSidebar.tsx
{
    title: 'Fleet Management',
    icon: Truck,
    href: '/admin/fleet',
    roles: ['super_admin', 'hr_admin', 'hod', 'fleet_manager', 'employee'],
    subItems: [
        { title: 'Dashboard', href: '/admin/fleet', roles: ['fleet_manager', 'super_admin'] },
        { title: 'New Request', href: '/admin/fleet/requests/new', roles: ['all'] },
        { title: 'My Requests', href: '/admin/fleet/my-requests', roles: ['all'] },
        { title: 'Vehicles', href: '/admin/fleet/vehicles', roles: ['fleet_manager', 'super_admin'] },
        // ...
    ]
}
```

---

## 12. Security Considerations

### 12.1 Data Security

| Concern | Mitigation |
|---------|------------|
| Unauthorized access | Row Level Security (RLS) on all tables |
| Photo/document leaks | Signed URLs with expiration for uploads |
| GPS data privacy | Only authorized roles can view location data |
| Fuel fraud | Multi-factor verification (photo + GPS + odometer) |
| Driver identity | Link to verified HR employee record |

### 12.2 Input Validation

```typescript
// Example: Trip Request Validation
const tripRequestSchema = z.object({
    destination: z.string().min(5).max(500),
    purpose: z.string().min(10).max(1000),
    start_datetime: z.date().min(new Date()), // Must be future
    end_datetime: z.date(),
    passenger_count: z.number().int().min(1).max(50),
}).refine(data => data.end_datetime > data.start_datetime, {
    message: "End time must be after start time"
});
```

### 12.3 Audit Trail

All critical actions are logged:
- Trip request submissions
- Approvals/rejections with timestamp and user
- Vehicle assignments
- Fuel log entries
- GPS breadcrumbs (immutable)
- Document uploads

---

## 13. Testing Strategy

### 13.1 Test Categories

| Category | Scope | Tools |
|----------|-------|-------|
| Unit Tests | Services, utilities | Vitest |
| Component Tests | React components | Testing Library |
| Integration Tests | API endpoints | Vitest + Supabase |
| E2E Tests | Full workflows | Playwright |

### 13.2 Test Scenarios

#### Phase 1 Tests
- [ ] Submit trip request
- [ ] HOD approves request
- [ ] HOD rejects request with reason
- [ ] Fleet manager assigns vehicle
- [ ] Driver sees assigned trip
- [ ] Vehicle availability conflict detection

#### Phase 2 Tests
- [ ] Driver starts trip with GPS capture
- [ ] GPS breadcrumbs recorded
- [ ] Fuel log with photo upload
- [ ] Geofence verification
- [ ] Fuel variance calculation
- [ ] End trip with odometer

#### Phase 3 Tests
- [ ] License expiry alert creation
- [ ] Block expired license driver
- [ ] Maintenance scheduling
- [ ] Service due alerts

#### Phase 4 Tests
- [ ] Dashboard metrics calculation
- [ ] Report generation
- [ ] Export to CSV/PDF

---

## 14. Deployment Plan

### 14.1 Migration Strategy

```sql
-- Migration order is critical
-- 1. Run schema migrations (create tables)
-- 2. Add RLS policies
-- 3. Create database functions
-- 4. Insert seed data (fuel stations, inspection templates)
-- 5. Deploy frontend
```

### 14.2 Rollout Plan

| Phase | Duration | Scope |
|-------|----------|-------|
| Alpha | 1 week | Internal testing with mock data |
| Beta | 2 weeks | Pilot with 2-3 vehicles, select users |
| Soft Launch | 2 weeks | Full fleet, select departments |
| Full Launch | Ongoing | All users, all vehicles |

### 14.3 Monitoring

- Supabase dashboard for database metrics
- Error tracking with logging
- User feedback collection
- KPI dashboard for business metrics

---

## Appendices

### A. Glossary

| Term | Definition |
|------|------------|
| Trip Request | A formal request by staff to use a company vehicle |
| Trip | An approved request that has been assigned and is being executed |
| Geofencing | Geographic boundary check (e.g., fuel station verification) |
| Breadcrumbs | Sequential GPS coordinates recorded during a trip |
| Variance | Difference between expected and actual fuel consumption |
| Fleet Utilization | Percentage of time vehicles are in active use |

### B. Reference Documents

- Original FleetOS Blueprint (DOC-20260309-WA0122.docx)
- FKF HR System Documentation
- Supabase RLS Documentation
- Capacitor Geolocation Plugin Docs

### C. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 10, 2026 | Dev Team | Initial document |

---

**END OF DOCUMENT**
