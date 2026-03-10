// Core TypeScript types for the Leave Management System

import { User as SupabaseUser } from '@supabase/supabase-js';

// ============================================================================
// Database Types
// ============================================================================

export interface Database {
  public: {
    Tables: {
      departments: Department;
      leave_types: LeaveType;
      users_profile: UserProfile;
      leave_balances: LeaveBalance;
      leave_requests: LeaveRequest;
      leave_request_history: LeaveRequestHistory;
      public_holidays: PublicHoliday;
      notifications: Notification;
      audit_logs: AuditLog;
    };
  };
}

// ============================================================================
// User & Authentication
// ============================================================================

export type UserRole = 'employee' | 'hod' | 'hr_admin' | 'super_admin';

export interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  employee_id: string;
  department_id: string;
  role: UserRole;
  phone?: string;
  is_active: boolean;
  must_change_password?: boolean;
  created_at: string;
  updated_at: string;
  department?: Department;
}

export interface AuthContextType {
  user: SupabaseUser | null;
  profile: UserProfile | null;
  role: UserRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

// ============================================================================
// Department
// ============================================================================

export interface Department {
  id: string;
  name: string;
  description?: string;
  head_of_department_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Leave Types
// ============================================================================

export interface LeaveType {
  id: string;
  name: string;
  description?: string;
  max_days_per_year: number;
  default_days_per_year: number;
  allow_carryforward: boolean;
  is_carried_forward: boolean;
  max_carryforward_days: number;
  requires_documentation: boolean;
  min_notice_days: number;
  max_consecutive_days: number;
  color?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Leave Balances
// ============================================================================

export interface LeaveBalance {
  id: string;
  user_id: string;
  leave_type_id: string;
  year: number;
  annual_allocation: number;
  used_days: number;
  pending_days: number;
  carryforward_days: number;
  created_at: string;
  updated_at: string;
  leave_types?: LeaveType;
  users_profile?: UserProfile;
}

// ============================================================================
// Leave Requests
// ============================================================================

export type LeaveRequestStatus = 'pending' | 'hod_approved' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  status: LeaveRequestStatus;
  // Legacy fields (backwards compatibility)
  reviewed_by?: string;
  reviewed_at?: string;
  reviewer_comments?: string;
  rejection_reason?: string;
  // Two-step approval fields
  hod_approved_by?: string;
  hod_approved_at?: string;
  hod_comments?: string;
  hr_approved_by?: string;
  hr_approved_at?: string;
  hr_comments?: string;
  document_url?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  leave_types?: LeaveType;
  users_profile?: UserProfile;
  reviewed_by_user?: UserProfile;
  hod_approver?: UserProfile;
  hr_approver?: UserProfile;
  department?: Department;
}

export interface LeaveRequestFormData {
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  document_url?: string;
}

export interface LeaveRequestFilters {
  status?: LeaveRequestStatus | 'all';
  year?: number;
  department_id?: string;
  leave_type_id?: string;
  limit?: number;
}

// ============================================================================
// Leave Request History (Audit Trail)
// ============================================================================

export interface LeaveRequestHistory {
  id: string;
  leave_request_id: string;
  action: string;
  old_status?: LeaveRequestStatus;
  new_status?: LeaveRequestStatus;
  changed_by: string;
  change_reason?: string;
  created_at: string;
}

// ============================================================================
// Public Holidays
// ============================================================================

export interface PublicHoliday {
  id: string;
  name: string;
  date: string;
  is_recurring: boolean;
  holiday_type: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Notifications
// ============================================================================

export type NotificationType = 'leave_request' | 'leave_approved' | 'leave_rejected' | 'leave_cancelled' | 'system';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  related_leave_request_id?: string;
  created_at: string;
}

export type NotificationFilter = 'all' | 'unread' | 'read';

// ============================================================================
// Audit Logs
// ============================================================================

export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data?: Record<string, any>;
  new_data?: Record<string, any>;
  user_id?: string;
  created_at: string;
}

// ============================================================================
// Service Return Types
// ============================================================================

export interface ServiceResponse<T> {
  data: T | null;
  error: Error | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
}

// ============================================================================
// Component Props
// ============================================================================

export interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export interface LeaveBalanceCardProps {
  balance: LeaveBalance;
}

export interface StatusBadgeProps {
  status: LeaveRequestStatus;
}

// ============================================================================
// Form Types
// ============================================================================

export interface LoginFormData {
  email: string;
  password: string;
}

export interface SignUpFormData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  employee_id: string;
  department_id: string;
  phone?: string;
}

export interface ForgotPasswordFormData {
  email: string;
}

export interface ResetPasswordFormData {
  password: string;
  confirmPassword: string;
}

// ============================================================================
// Admin Types
// ============================================================================

export interface UserManagementFilters {
  department_id?: string;
  role?: UserRole | 'all';
  is_active?: boolean;
  search?: string;
}

export interface BulkOperationResult {
  successful: number;
  failed: number;
  errors: Array<{
    row: any;
    error: string;
  }>;
}

export interface CarryforwardResult {
  success: boolean;
  processed: number;
  errors: Array<{
    user_id: string;
    leave_type_id: string;
    error: string;
  }> | null;
  message: string;
  error?: string;
}

// ============================================================================
// Statistics & Analytics
// ============================================================================

export interface DashboardStats {
  pending: number;
  approved: number;
  rejected: number;
  availableDays: number;
}

export interface ApprovalStats {
  pending: number;
  approvedToday: number;
  rejectedToday: number;
  totalDays: number;
}

export interface DepartmentSummary {
  department_id: string;
  department_name: string;
  total_employees: number;
  total_requests: number;
  total_days: number;
  approved_requests: number;
  pending_requests: number;
  average_days: number;
}

// ============================================================================
// PDF Export Types
// ============================================================================

export interface PDFFilters {
  year?: number;
  department?: string;
  leaveType?: string;
  status?: string;
}

export interface PDFSummary {
  totalRequests?: number;
  totalDays?: number;
  approvedRequests?: number;
  pendingRequests?: number;
  rejectedRequests?: number;
}

// ============================================================================
// Document Management
// ============================================================================

export interface DocumentType {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  is_required: boolean;
  requires_expiry: boolean;
  allowed_mime_types: string[];
  max_file_size: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmployeeDocument {
  id: string;
  user_id: string;
  document_type: string;
  document_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  description?: string;
  expiry_date?: string;
  is_verified: boolean;
  verified_by?: string;
  verified_at?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  document_type_info?: DocumentType;
  user?: UserProfile;
  uploader?: UserProfile;
  verifier?: UserProfile;
}

export interface DocumentUploadData {
  user_id: string;
  document_type: string;
  document_name: string;
  file: File;
  description?: string;
  expiry_date?: string;
}

export interface DocumentCompletion {
  total_required: number;
  completed: number;
  completion_percentage: number;
}

// ============================================================================
// Calendar Types
// ============================================================================

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  color?: string;
  leaveRequest: LeaveRequest;
}

export type CalendarView = 'month' | 'list';

// ============================================================================
// Utility Types
// ============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: DeepPartial<T[P]>;
};

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];
