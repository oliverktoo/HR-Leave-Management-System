import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoadingScreen } from './components/LoadingScreen';
import ErrorBoundary from './components/ErrorBoundary';
import ThemeToggle from './components/ThemeToggle';
import { MobileStatus } from './components/mobile/MobileStatus';

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
const LeaveBalanceManagement = lazy(() => import('./components/admin/LeaveBalanceManagement'));
const StaffAttendance = lazy(() => import('./components/attendance/StaffAttendance').then(m => ({ default: m.StaffAttendance })));
const AdminAttendance = lazy(() => import('./components/attendance/AdminAttendance').then(m => ({ default: m.AdminAttendance })));
const GeofenceSettings = lazy(() => import('./components/admin/GeofenceSettings').then(m => ({ default: m.GeofenceSettings })));

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

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <ThemeToggle />
          <MobileStatus />
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
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
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin']}>
                <Approvals />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/team-calendar"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin']}>
                <TeamCalendar />
              </ProtectedRoute>
            }
          />
          
          {/* HR Admin Routes */}
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin']}>
                <UserManagement />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/leave-types"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin']}>
                <LeaveTypeManagement />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/leave-balances"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin']}>
                <LeaveBalanceManagement />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/reports"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin']}>
                <ReportsAnalytics />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/holidays"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin']}>
                <HolidayManagement />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin']}>
                <PolicySettings />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/geofence"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin']}>
                <GeofenceSettings />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/bulk-operations"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin']}>
                <BulkOperations />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/analytics"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin']}>
                <AnalyticsDashboard />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/documents"
            element={
              <ProtectedRoute allowedRoles={['hr_admin', 'super_admin']}>
                <AdminDocuments />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/employee-reports"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin']}>
                <EmployeeReports />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/attendance"
            element={
              <ProtectedRoute allowedRoles={['hod', 'hr_admin', 'super_admin']}>
                <AdminAttendance />
              </ProtectedRoute>
            }
          />
          
          {/* Fleet Management Routes */}
          <Route
            path="/fleet/dashboard"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin']}>
                <FleetDashboard />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/vehicles"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin']}>
                <VehicleList />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/vehicles/new"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin']}>
                <VehicleForm />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/vehicles/:id/edit"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin']}>
                <VehicleForm />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/drivers"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin']}>
                <DriverList />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/requests"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin']}>
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
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin']}>
                <TripAssignments />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/assignments/:id"
            element={
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin']}>
                <TripAssignments />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/fleet/trip-approvals"
            element={
              <ProtectedRoute allowedRoles={['hod', 'fleet_manager', 'hr_admin', 'super_admin']}>
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
              <ProtectedRoute allowedRoles={['fleet_manager', 'hr_admin', 'super_admin']}>
                <MaintenanceManagement />
              </ProtectedRoute>
            }
          />
          
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
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
