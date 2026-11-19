import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoadingScreen } from './components/LoadingScreen';
import ErrorBoundary from './components/ErrorBoundary';
import { MobileStatus } from './components/mobile/MobileStatus';
import { Capacitor } from '@capacitor/core';
import { pingPresenceIfAtOffice } from './services/attendanceService';
import { supabase } from './lib/supabaseClient';

// Runs app-wide so presence pings continue even when user navigates away from the attendance page.
function PresencePingManager() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const runPing = async () => {
      try {
        // Check if there's an open attendance record today before pinging
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
        const { data: record } = await supabase
          .from('attendance_records')
          .select('id, check_out_time')
          .eq('user_id', user.id)
          .eq('date', today)
          .maybeSingle();

        if (!record || record.check_out_time) return; // not checked in or already out

        // On web: skip if location permission not already granted (don't prompt)
        if (!Capacitor.isNativePlatform() && 'permissions' in navigator) {
          const status = await navigator.permissions.query({ name: 'geolocation' });
          if (status.state !== 'granted') return;
        }

        await pingPresenceIfAtOffice();
      } catch {
        // silent — never block the user
      }
    };

    // Delay first ping by 2 minutes, then every 10 minutes
    const firstPing = setTimeout(runPing, 2 * 60 * 1000);
    const interval = setInterval(runPing, 10 * 60 * 1000);
    return () => { clearTimeout(firstPing); clearInterval(interval); };
  }, [user]);

  return null;
}

// Lazy load components for better performance
const Login = lazy(() => import('./components/auth/Login').then(m => ({ default: m.Login })));
const ForgotPassword = lazy(() => import('./components/auth/ForgotPassword').then(m => ({ default: m.ForgotPassword })));
const ChangePassword = lazy(() => import('./components/auth/ChangePassword').then(m => ({ default: m.ChangePassword })));
const ResetPassword = lazy(() => import('./components/auth/ResetPassword').then(m => ({ default: m.ResetPassword })));
const Dashboard = lazy(() => import('./components/dashboard/Dashboard').then(m => ({ default: m.Dashboard })));
const LeaveRequestForm = lazy(() => import('./components/leave/LeaveRequestForm').then(m => ({ default: m.LeaveRequestForm })));
const LeaveHistory = lazy(() => import('./components/leave/LeaveHistory').then(m => ({ default: m.LeaveHistory })));
const Approvals = lazy(() => import('./components/approvals/Approvals').then(m => ({ default: m.Approvals })));
const TeamCalendar = lazy(() => import('./components/calendar/TeamCalendar').then(m => ({ default: m.TeamCalendar })));
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'));
const UserManagement = lazy(() => import('./components/admin/UserManagement'));
const LeaveTypeManagement = lazy(() => import('./components/admin/LeaveTypeManagement'));
const ReportsAnalytics = lazy(() => import('./components/admin/ReportsAnalytics'));
const HolidayManagement = lazy(() => import('./components/admin/HolidayManagement'));
const PolicySettings = lazy(() => import('./components/admin/PolicySettings'));
const BulkOperations = lazy(() => import('./components/admin/BulkOperations'));
const AnalyticsDashboard = lazy(() => import('./components/admin/AnalyticsDashboard'));
const StaffDocuments = lazy(() => import('./components/documents/StaffDocuments').then(m => ({ default: m.StaffDocuments })));
const AdminDocuments = lazy(() => import('./components/documents/AdminDocuments').then(m => ({ default: m.AdminDocuments })));
const StaffReports = lazy(() => import('./components/reports/StaffReports').then(m => ({ default: m.StaffReports })));
const EmployeeReports = lazy(() => import('./components/admin/EmployeeReports'));
const EmployeeProfile = lazy(() => import('./components/admin/EmployeeProfile').then(m => ({ default: m.EmployeeProfile })));
const EmployeeDirectory = lazy(() => import('./components/admin/EmployeeDirectory').then(m => ({ default: m.EmployeeDirectory })));
const LeaveBalanceManagement = lazy(() => import('./components/admin/LeaveBalanceManagement'));
const StaffAttendance = lazy(() => import('./components/attendance/StaffAttendance').then(m => ({ default: m.StaffAttendance })));
const AdminAttendance = lazy(() => import('./components/attendance/AdminAttendance').then(m => ({ default: m.AdminAttendance })));
const AdminAttendanceDashboard = lazy(() => import('./components/attendance/AdminAttendanceDashboard').then(m => ({ default: m.AdminAttendanceDashboard })));
const MissedCheckoutReport = lazy(() => import('./components/attendance/MissedCheckoutReport'));
const AttendanceReports = lazy(() => import('./components/attendance/AttendanceReports').then(m => ({ default: m.AttendanceReports })));
const GeofenceSettings = lazy(() => import('./components/admin/GeofenceSettings').then(m => ({ default: m.GeofenceSettings })));

// Attendance — OOO & Field Tracking
const OOORequestForm = lazy(() => import('./components/attendance/OOORequestForm').then(m => ({ default: m.OOORequestForm })));
const OOORequestList = lazy(() => import('./components/attendance/OOORequestList').then(m => ({ default: m.OOORequestList })));
const OOOApprovals = lazy(() => import('./components/attendance/OOOApprovals').then(m => ({ default: m.OOOApprovals })));
const OOOAssignmentManager = lazy(() => import('./components/attendance/OOOAssignmentManager').then(m => ({ default: m.OOOAssignmentManager })));
const FieldAssignmentManager = lazy(() => import('./components/attendance/FieldAssignmentManager').then(m => ({ default: m.FieldAssignmentManager })));
const FieldClockIn = lazy(() => import('./components/attendance/FieldClockIn').then(m => ({ default: m.FieldClockIn })));
const FieldSupervisorView = lazy(() => import('./components/attendance/FieldSupervisorView').then(m => ({ default: m.FieldSupervisorView })));
const FaceRegistration = lazy(() => import('./components/attendance/FaceRegistration').then(m => ({ default: m.FaceRegistration })));
const SelfieVerificationPage = lazy(() => import('./components/attendance/SelfieVerificationPage').then(m => ({ default: m.SelfieVerificationPage })));

// Fleet Management Components - Phase 1
const FleetDashboard = lazy(() => import('./components/fleet/FleetDashboard'));
const VehicleList = lazy(() => import('./components/fleet/VehicleList'));
const VehicleForm = lazy(() => import('./components/fleet/VehicleForm'));
const DriverList = lazy(() => import('./components/fleet/DriverList'));
const MyTripRequests = lazy(() => import('./components/fleet/MyTripRequests'));
const TripRequestForm = lazy(() => import('./components/fleet/TripRequestForm'));
const TripAssignments = lazy(() => import('./components/fleet/TripAssignments'));
const TripApprovals = lazy(() => import('./components/fleet/TripApprovals'));
const AllTripRequests = lazy(() => import('./components/fleet/AllTripRequests'));

// Fleet Management Components - Phase 2
const TripExecution = lazy(() => import('./components/fleet/TripExecution').then(m => ({ default: m.TripExecution })));
const TripDetails = lazy(() => import('./components/fleet/TripDetails').then(m => ({ default: m.TripDetails })));
const FuelManagement = lazy(() => import('./components/fleet/FuelManagement').then(m => ({ default: m.FuelManagement })));
const MaintenanceManagement = lazy(() => import('./components/fleet/MaintenanceManagement').then(m => ({ default: m.MaintenanceManagement })));
const VehicleInspections = lazy(() => import('./components/fleet/VehicleInspections').then(m => ({ default: m.VehicleInspections })));
const FleetAnalytics = lazy(() => import('./components/fleet/FleetAnalytics').then(m => ({ default: m.FleetAnalytics })));

// Fleet Management Components - Phase 3 (Compliance)
const CompliancePage = lazy(() => import('./pages/CompliancePage').then(m => ({ default: m.CompliancePage })));

// Fleet Management Components - Phase 4
const FleetReports = lazy(() => import('./components/fleet/FleetReports').then(m => ({ default: m.FleetReports })));
const FleetBudget = lazy(() => import('./components/fleet/FleetBudget').then(m => ({ default: m.FleetBudget })));
const DriverDashboard = lazy(() => import('./components/fleet/DriverDashboard').then(m => ({ default: m.DriverDashboard })));

// Payroll Module
const PayrollDashboard = lazy(() => import('./components/payroll/PayrollDashboard').then(m => ({ default: m.PayrollDashboard })));
const PayrollRunNew = lazy(() => import('./components/payroll/PayrollRunNew').then(m => ({ default: m.PayrollRunNew })));
const PayrollRunDetail = lazy(() => import('./components/payroll/PayrollRunDetail').then(m => ({ default: m.PayrollRunDetail })));
const EmployeePayrollProfiles = lazy(() => import('./components/payroll/EmployeePayrollProfiles').then(m => ({ default: m.EmployeePayrollProfiles })));
const MyPayslips = lazy(() => import('./components/payroll/MyPayslips').then(m => ({ default: m.MyPayslips })));
const PayrollKRAExports = lazy(() => import('./components/payroll/PayrollKRAExports').then(m => ({ default: m.PayrollKRAExports })));
const PayrollApprovals = lazy(() => import('./components/payroll/PayrollApprovals').then(m => ({ default: m.PayrollApprovals })));
const PayrollAnalytics = lazy(() => import('./components/payroll/PayrollAnalytics').then(m => ({ default: m.PayrollAnalytics })));
const GhostWorkerCheck = lazy(() => import('./components/payroll/GhostWorkerCheck').then(m => ({ default: m.GhostWorkerCheck })));
const SalaryChangeLog = lazy(() => import('./components/payroll/SalaryChangeLog').then(m => ({ default: m.SalaryChangeLog })));
const RemittancesOverview = lazy(() => import('./components/payroll/RemittancesOverview').then(m => ({ default: m.RemittancesOverview })));

// Staff Cards
const StaffCards = lazy(() => import('./components/admin/StaffCards').then(m => ({ default: m.StaffCards })));
const CardVerify = lazy(() => import('./components/verify/CardVerify').then(m => ({ default: m.CardVerify })));

// Kiosk
const KioskScanner = lazy(() => import('./components/kiosk/KioskScanner').then(m => ({ default: m.KioskScanner })));

// Org Chart
const OrgChart = lazy(() => import('./components/org/OrgChart').then(m => ({ default: m.OrgChart })));

// Rota / Shift Management
const RotaManagement = lazy(() => import('./components/rota/RotaManagement').then(m => ({ default: m.RotaManagement })));
const MySchedule = lazy(() => import('./components/rota/MySchedule').then(m => ({ default: m.MySchedule })));

// Training & Development
const TrainingManagement = lazy(() => import('./components/training/TrainingManagement').then(m => ({ default: m.TrainingManagement })));
const MyTraining = lazy(() => import('./components/training/MyTraining').then(m => ({ default: m.MyTraining })));

// Communications
const AnnouncementManager = lazy(() => import('./components/communications/AnnouncementManager').then(m => ({ default: m.AnnouncementManager })));
const AnnouncementFeed = lazy(() => import('./components/communications/AnnouncementFeed').then(m => ({ default: m.AnnouncementFeed })));

// Assets
const AssetManagement = lazy(() => import('./components/assets/AssetManagement').then(m => ({ default: m.AssetManagement })));
const MyAssets = lazy(() => import('./components/assets/MyAssets').then(m => ({ default: m.MyAssets })));

// Exit Management
const ExitManagement = lazy(() => import('./components/exit/ExitManagement').then(m => ({ default: m.ExitManagement })));
const ExitRequest = lazy(() => import('./components/exit/ExitRequest').then(m => ({ default: m.ExitRequest })));

// Contracts & Onboarding
const ContractManagement = lazy(() => import('./components/contracts/ContractManagement').then(m => ({ default: m.ContractManagement })));

// Disciplinary & Grievance
const DisciplinaryManagement = lazy(() => import('./components/disciplinary/DisciplinaryManagement').then(m => ({ default: m.DisciplinaryManagement })));

// Performance Appraisals
const AppraisalManagement = lazy(() => import('./components/performance/AppraisalManagement').then(m => ({ default: m.AppraisalManagement })));
const MyAppraisal = lazy(() => import('./components/performance/MyAppraisal').then(m => ({ default: m.MyAppraisal })));

// Benefits Administration
const BenefitsManagement = lazy(() => import('./components/benefits/BenefitsManagement').then(m => ({ default: m.BenefitsManagement })));
const MyBenefits = lazy(() => import('./components/benefits/MyBenefits').then(m => ({ default: m.MyBenefits })));

// Recruitment
const RecruitmentManagement = lazy(() => import('./components/recruitment/RecruitmentManagement').then(m => ({ default: m.RecruitmentManagement })));
const CareersPage = lazy(() => import('./components/recruitment/CareersPage').then(m => ({ default: m.CareersPage })));

// Landing
const LandingPage = lazy(() => import('./components/landing/LandingPage').then(m => ({ default: m.LandingPage })));

// Overtime
const OvertimeManagement = lazy(() => import('./components/overtime/OvertimeManagement').then(m => ({ default: m.OvertimeManagement })));

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <PresencePingManager />
          <MobileStatus />
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verify/:employeeId" element={<CardVerify />} />
              <Route path="/careers" element={<CareersPage />} />
              <Route path="/kiosk" element={<KioskScanner />} />
              <Route path="/change-password" element={
                <ProtectedRoute>
                  <ChangePassword />
                </ProtectedRoute>
              } />
            
              <Route
                path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/request-leave"
              element={
                <ProtectedRoute>
                  <LeaveRequestForm />
                </ProtectedRoute>
              }
            />
          
          <Route
            path="/leave-history"
            element={
              <ProtectedRoute>
                <LeaveHistory />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/documents"
            element={
              <ProtectedRoute>
                <StaffDocuments />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <StaffReports />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/attendance"
            element={
              <ProtectedRoute>
                <StaffAttendance />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/approvals"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <Approvals />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/team-calendar"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <TeamCalendar />
              </ProtectedRoute>
            }
          />
          
          {/* HR Admin Routes */}
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'hod', 'fleet_manager', 'finance', 'ceo', 'auditor']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <UserManagement />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/staff-cards"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin']}>
                <StaffCards />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/employees"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <EmployeeDirectory />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/leave-types"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <LeaveTypeManagement />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/leave-balances"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <LeaveBalanceManagement />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/reports"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <ReportsAnalytics />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/holidays"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <HolidayManagement />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <PolicySettings />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/geofence"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <GeofenceSettings />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/bulk-operations"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <BulkOperations />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/analytics"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <AnalyticsDashboard />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/documents"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <AdminDocuments />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/employees/:id"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <EmployeeProfile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/employee-reports"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <EmployeeReports />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/attendance"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <AdminAttendance />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/attendance/dashboard"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <AdminAttendanceDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/attendance/reports"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <AttendanceReports />
              </ProtectedRoute>
            }
          />

          {/* OOO & Field Attendance Routes */}
          <Route
            path="/attendance/ooo/new"
            element={
              <ProtectedRoute>
                <OOORequestForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance/ooo/my-requests"
            element={
              <ProtectedRoute>
                <OOORequestList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance/ooo/approvals"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <OOOApprovals />
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance/missed-checkouts"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <MissedCheckoutReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance/ooo/assignments"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <OOOAssignmentManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance/field/assignments"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <FieldAssignmentManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance/field/clock-in"
            element={
              <ProtectedRoute>
                <FieldClockIn />
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance/field/supervisor"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <FieldSupervisorView />
              </ProtectedRoute>
            }
          />

          <Route
            path="/attendance/face-registration"
            element={
              <ProtectedRoute allowedRoles={[]}>
                <FaceRegistration />
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance/selfie-verification"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin']}>
                <SelfieVerificationPage />
              </ProtectedRoute>
            }
          />

          {/* Fleet Management Routes */}
          <Route
            path="/fleet/dashboard"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <FleetDashboard />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/vehicles"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <VehicleList />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/vehicles/new"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <VehicleForm />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/vehicles/:id/edit"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <VehicleForm />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/drivers"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <DriverList />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/requests"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <AllTripRequests />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/my-trips"
            element={
              <ProtectedRoute>
                <MyTripRequests />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/trip-request/new"
            element={
              <ProtectedRoute>
                <TripRequestForm />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/assignments"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <TripAssignments />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/assignments/:id"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <TripAssignments />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/trip-approvals"
            element={
              <ProtectedRoute allowedRoles={['hod', 'fleet_manager', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <TripApprovals />
              </ProtectedRoute>
            }
          />
          
          {/* Fleet Management Routes - Phase 2 */}
          <Route
            path="/fleet/trip/:id/execute"
            element={
              <ProtectedRoute>
                <TripExecution />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/trip/:id/details"
            element={
              <ProtectedRoute>
                <TripDetails />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/fuel"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'driver', 'hr_admin', 'super_admin']}>
                <FuelManagement />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/maintenance"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <MaintenanceManagement />
              </ProtectedRoute>
            }
          />

          <Route
            path="/fleet/inspections"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'driver', 'hr_admin', 'super_admin']}>
                <VehicleInspections />
              </ProtectedRoute>
            }
          />

          <Route
            path="/fleet/analytics"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <FleetAnalytics />
              </ProtectedRoute>
            }
          />

          {/* Fleet Management Routes - Phase 3 (Compliance) */}
          <Route
            path="/admin/fleet/compliance"
            element={<Navigate to="/fleet/compliance" replace />}
          />
          <Route
            path="/fleet/compliance"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <CompliancePage />
              </ProtectedRoute>
            }
          />

          {/* Fleet Management Routes - Phase 4 */}
          <Route
            path="/fleet/reports"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <FleetReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/fleet/budget"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <FleetBudget />
              </ProtectedRoute>
            }
          />
          <Route
            path="/fleet/driver-dashboard"
            element={
              <ProtectedRoute allowedRoles={['driver']}>
                <DriverDashboard />
              </ProtectedRoute>
            }
          />

          {/* Payroll Routes */}
          <Route
            path="/payroll/dashboard"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <PayrollDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll/runs/new"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <PayrollRunNew />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll/runs/:id"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <PayrollRunDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll/employees"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <EmployeePayrollProfiles />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll/my-payslips"
            element={
              <ProtectedRoute>
                <MyPayslips />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll/exports"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor', 'finance']}>
                <PayrollKRAExports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll/approvals"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'finance', 'ceo']}>
                <PayrollApprovals />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll/analytics"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'finance', 'ceo']}>
                <PayrollAnalytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll/ghost-check"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin']}>
                <GhostWorkerCheck />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll/salary-changes"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'finance', 'ceo']}>
                <SalaryChangeLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll/remittances"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'finance']}>
                <RemittancesOverview />
              </ProtectedRoute>
            }
          />

          {/* ── Rota / Shift Management ───────────────────────────────── */}
          <Route
            path="/admin/rota"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <RotaManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-schedule"
            element={
              <ProtectedRoute>
                <MySchedule />
              </ProtectedRoute>
            }
          />

          {/* ── Training & Development ────────────────────────────────── */}
          <Route
            path="/admin/training"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <TrainingManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-training"
            element={
              <ProtectedRoute>
                <MyTraining />
              </ProtectedRoute>
            }
          />

          {/* ── Benefits Administration ───────────────────────────────── */}
          <Route
            path="/admin/benefits"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <BenefitsManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-benefits"
            element={
              <ProtectedRoute>
                <MyBenefits />
              </ProtectedRoute>
            }
          />

          {/* ── Communications ────────────────────────────────────────── */}
          <Route
            path="/admin/announcements"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <AnnouncementManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="/announcements"
            element={
              <ProtectedRoute>
                <AnnouncementFeed />
              </ProtectedRoute>
            }
          />

          {/* ── Assets ────────────────────────────────────────────────── */}
          <Route
            path="/admin/assets"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <AssetManagement />
              </ProtectedRoute>
            }
          />

          {/* ── My Assets (staff) ─────────────────────────────────────── */}
          <Route
            path="/my-assets"
            element={
              <ProtectedRoute>
                <MyAssets />
              </ProtectedRoute>
            }
          />

          {/* ── Exit Management ───────────────────────────────────────── */}
          <Route
            path="/admin/exit"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <ExitManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/exit/request"
            element={
              <ProtectedRoute>
                <ExitRequest />
              </ProtectedRoute>
            }
          />

          {/* ── Contracts & Onboarding ────────────────────────────────── */}
          <Route
            path="/admin/contracts"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <ContractManagement />
              </ProtectedRoute>
            }
          />

          {/* ── Disciplinary & Grievance ──────────────────────────────── */}
          <Route
            path="/admin/disciplinary"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <DisciplinaryManagement />
              </ProtectedRoute>
            }
          />

          {/* ── Performance Appraisals ────────────────────────────────── */}
          <Route
            path="/admin/appraisals"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <AppraisalManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-appraisal"
            element={
              <ProtectedRoute>
                <MyAppraisal />
              </ProtectedRoute>
            }
          />

          {/* ── Org Chart ─────────────────────────────────────────────── */}
          <Route
            path="/org-chart"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin', 'ceo', 'auditor']}>
                <OrgChart />
              </ProtectedRoute>
            }
          />

          {/* ── Recruitment ───────────────────────────────────────────── */}
          <Route
            path="/admin/recruitment"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin', 'ceo', 'hod']}>
                <RecruitmentManagement />
              </ProtectedRoute>
            }
          />

          {/* ── Overtime ──────────────────────────────────────────────── */}
          <Route
            path="/admin/overtime"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin', 'ceo']}>
                <OvertimeManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-overtime"
            element={
              <ProtectedRoute>
                <OvertimeManagement />
              </ProtectedRoute>
            }
          />

          <Route path="/" element={<LandingPage />} />
          
          <Route
            path="/unauthorized"
            element={
              <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                  <h1 className="text-2xl font-bold text-gray-900">Unauthorized</h1>
                  <p className="mt-2 text-gray-600">You don't have permission to access this page.</p>
                </div>
              </div>
            }
          />
          
          <Route
            path="*"
            element={
              <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                  <h1 className="text-2xl font-bold text-gray-900">404 - Page Not Found</h1>
                  <p className="mt-2 text-gray-600">The page you're looking for doesn't exist.</p>
                </div>
              </div>
            }
          />
            </Routes>
          </Suspense>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
