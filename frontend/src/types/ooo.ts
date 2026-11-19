// OOO (Out of Office) Request System Types

export type OOOAbsenceType =
  | 'training'
  | 'official_travel'
  | 'official_assignment'
  | 'emergency'
  | 'other';

export type OOOStatus =
  | 'pending'
  | 'hod_approved'
  | 'hod_rejected'
  | 'hr_approved'
  | 'hr_rejected'
  | 'cancelled';

export type HODDecision = 'approved' | 'rejected' | 'modification_requested';
export type HRDecision = 'approved' | 'rejected';

export type BlackoutType =
  | 'all'
  | 'training'
  | 'official_travel'
  | 'official_assignment';

export type OOOAssignmentStatus = 'open' | 'closed' | 'cancelled';

// ─── Core Interfaces ────────────────────────────────────────

export interface OOOAssignment {
  id: string;
  title: string;
  description: string | null;
  assignment_type: OOOAbsenceType;
  start_date: string;
  end_date: string;
  location: string | null;
  includes_weekend: boolean;
  includes_public_holiday: boolean;
  max_participants: number | null;
  created_by: string;
  status: OOOAssignmentStatus;
  created_at: string;
  updated_at: string;
  // Joined (from OOO_ASSIGNMENT_SELECT — one level deep)
  creator?: { first_name: string; last_name: string };
  // Flat UUID when fetched via OOO_SELECT nested join
  applicant_count?: number;
}

export interface CreateOOOAssignmentInput {
  title: string;
  description?: string;
  assignment_type: OOOAbsenceType;
  start_date: string;
  end_date: string;
  location?: string;
  includes_weekend?: boolean;
  includes_public_holiday?: boolean;
  max_participants?: number;
}

export interface OOORequest {
  id: string;
  user_id: string;
  employee_id: string;
  department_id: string | null;
  assignment_id: string | null;

  absence_type: OOOAbsenceType;
  start_date: string;       // ISO date
  end_date: string;         // ISO date
  total_days: number;
  is_urgent: boolean;

  reason: string;
  handover_notes: string | null;
  emergency_contact: string | null;

  status: OOOStatus;
  payroll_flagged: boolean;

  hod_id: string | null;
  hod_decision: HODDecision | null;
  hod_decision_at: string | null;
  hod_comments: string | null;

  hr_reviewer_id: string | null;
  hr_decision: HRDecision | null;
  hr_decision_at: string | null;
  hr_comments: string | null;

  submitted_at: string;
  updated_at: string;

  // Joined (only present when fetched via dedicated assignment query)
  assignment?: Pick<OOOAssignment, 'id' | 'title' | 'assignment_type' | 'start_date' | 'end_date' | 'location'>;
  requester?: { id: string; first_name: string; last_name: string; employee_id: string };
  department?: { name: string };
  hod_profile?: { first_name: string; last_name: string };
  hr_reviewer_profile?: { first_name: string; last_name: string };
}

export interface OOOBlackoutPeriod {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  blackout_type: BlackoutType;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Input Types ────────────────────────────────────────────

export interface CreateOOORequestInput {
  /** The assignment the employee is applying against */
  assignment_id: string;
  is_urgent: boolean;
  reason: string;
  handover_notes?: string;
  emergency_contact?: string;
  /** Admin-only: submit on behalf of another employee */
  for_user_id?: string;
}

export interface HODReviewInput {
  request_id: string;
  decision: HODDecision;
  comments?: string;
}

export interface HRReviewInput {
  request_id: string;
  decision: HRDecision;
  comments?: string;
  payroll_flagged?: boolean;
}

export interface CreateBlackoutPeriodInput {
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  blackout_type: BlackoutType;
}

// ─── Filter Types ───────────────────────────────────────────

export interface OOOAssignmentFilters {
  status?: OOOAssignmentStatus;
  created_by?: string;
}

export interface OOORequestFilters {
  user_id?: string;
  department_id?: string;
  status?: OOOStatus | OOOStatus[];
  absence_type?: OOOAbsenceType;
  date_from?: string;
  date_to?: string;
  is_urgent?: boolean;
}

// ─── Summary / RPC ──────────────────────────────────────────

export interface OOOSummaryRow {
  user_id: string;
  absence_type: OOOAbsenceType;
  approved_days: number;
  pending_days: number;
}

export interface BlackoutConflict {
  blackout_id: string;
  title: string;
  start_date: string;
  end_date: string;
}

// ─── Display Helpers ────────────────────────────────────────

export const OOO_ABSENCE_LABELS: Record<OOOAbsenceType, string> = {
  training: 'Training',
  official_travel: 'Official Travel',
  official_assignment: 'Official Assignment',
  emergency: 'Emergency',
  other: 'Other',
};

export const OOO_STATUS_LABELS: Record<OOOStatus, string> = {
  pending: 'Pending HOD Review',
  hod_approved: 'HOD Approved — Awaiting HR',
  hod_rejected: 'Rejected by HOD',
  hr_approved: 'Approved',
  hr_rejected: 'Rejected by HR',
  cancelled: 'Cancelled',
};

export const OOO_ASSIGNMENT_STATUS_LABELS: Record<OOOAssignmentStatus, string> = {
  open: 'Open',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export const OOO_ASSIGNMENT_STATUS_COLOR: Record<OOOAssignmentStatus, string> = {
  open: '#22c55e',
  closed: '#6b7280',
  cancelled: '#ef4444',
};

export const OOO_STATUS_COLOR: Record<OOOStatus, string> = {
  pending: '#f59e0b',
  hod_approved: '#3b82f6',
  hod_rejected: '#ef4444',
  hr_approved: '#22c55e',
  hr_rejected: '#ef4444',
  cancelled: '#9ca3af',
};
