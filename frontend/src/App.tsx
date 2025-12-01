import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoadingScreen } from './components/LoadingScreen';
import ErrorBoundary from './components/ErrorBoundary';
import ThemeToggle from './components/ThemeToggle';

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

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <ThemeToggle />
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
