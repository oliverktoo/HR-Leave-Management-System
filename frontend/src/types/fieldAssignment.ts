// Field Assignment & Clock-In System Types

export type FieldAssignmentStatus =
  | 'draft'
  | 'active'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type VerificationStatus = 'verified' | 'flagged';

// ─── Deliverable Item ────────────────────────────────────────

export interface DeliverableItem {
  item: string;
  completed: boolean;
  notes?: string;
}

// ─── Core Interfaces ────────────────────────────────────────

export interface FieldAssignment {
  id: string;
  assignment_number: string;
  title: string;
  description: string | null;

  location_name: string;
  location_county: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_radius_m: number;

  planned_start: string;    // ISO timestamptz
  planned_end: string;

  created_by: string;
  supervisor_id: string;
  department_id: string | null;

  expected_deliverables: DeliverableItem[];

  status: FieldAssignmentStatus;

  hr_closed: boolean;
  hr_closed_by: string | null;
  hr_closed_at: string | null;
  hr_notes: string | null;

  created_at: string;
  updated_at: string;

  ooo_request_id?: string | null;

  // Joined
  supervisor?: { first_name: string; last_name: string };
  creator?: { first_name: string; last_name: string };
  department?: { name: string };
  employees?: FieldAssignmentEmployee[];
  clock_logs?: FieldClockLog[];
}

export interface FieldAssignmentEmployee {
  id: string;
  assignment_id: string;
  user_id: string;
  added_by: string | null;
  added_at: string;

  // Joined
  profile?: {
    first_name: string;
    last_name: string;
    employee_id: string;
  };
}

export interface FieldClockLog {
  id: string;
  assignment_id: string;
  user_id: string;

  clock_in_time: string;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_in_accuracy: number | null;
  clock_in_note: string | null;
  clock_in_photo_url: string | null;
  clock_in_offline: boolean;

  clock_out_time: string | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  clock_out_accuracy: number | null;
  clock_out_note: string | null;
  clock_out_offline: boolean;

  end_report: string | null;
  deliverables_status: DeliverableItem[];
  mileage_km: number | null;
  expenses_submitted: boolean;

  verified_by: string | null;
  verified_at: string | null;
  verification_status: VerificationStatus | null;
  supervisor_notes: string | null;

  work_hours: number | null;
  created_at: string;
  updated_at: string;

  // Joined
  employee?: { first_name: string; last_name: string; employee_id: string };
  verifier?: { first_name: string; last_name: string };
}

export interface FieldActivityLog {
  id: string;
  assignment_id: string;
  user_id: string;
  log_date: string;

  activities_done: string;
  people_engaged: string | null;
  issues_blockers: string | null;
  resources_used: string | null;

  acknowledged_by: string | null;
  acknowledged_at: string | null;

  submitted_at: string;

  // Joined
  employee?: { first_name: string; last_name: string };
  acknowledger?: { first_name: string; last_name: string };
}

// ─── Input Types ────────────────────────────────────────────

export interface CreateFieldAssignmentInput {
  title: string;
  description?: string;
  location_name: string;
  location_county?: string;
  location_lat?: number;
  location_lng?: number;
  location_radius_m?: number;
  planned_start: string;
  planned_end: string;
  supervisor_id: string;
  department_id?: string;
  expected_deliverables: DeliverableItem[];
  employee_ids: string[];
}

export interface FieldClockInInput {
  assignment_id: string;
  clock_in_lat?: number;
  clock_in_lng?: number;
  clock_in_accuracy?: number;
  clock_in_note?: string;
  clock_in_photo_url?: string;
  clock_in_offline?: boolean;
  clock_in_time?: string;
  face_match_score?: number | null;
  face_verified_auto?: boolean | null;
  selfie_url?: string | null;
}

export interface FieldClockOutInput {
  log_id: string;
  clock_out_lat?: number;
  clock_out_lng?: number;
  clock_out_accuracy?: number;
  clock_out_note?: string;
  clock_out_offline?: boolean;
  clock_out_time?: string;
  end_report?: string;
  deliverables_status?: DeliverableItem[];
  mileage_km?: number;
  expenses_submitted?: boolean;
}

export interface CreateActivityLogInput {
  assignment_id: string;
  log_date?: string;
  activities_done: string;
  people_engaged?: string;
  issues_blockers?: string;
  resources_used?: string;
}

export interface SupervisorVerifyInput {
  log_id: string;
  verification_status: VerificationStatus;
  supervisor_notes?: string;
}

// ─── Filter Types ───────────────────────────────────────────

export interface FieldAssignmentFilters {
  status?: FieldAssignmentStatus | FieldAssignmentStatus[];
  supervisor_id?: string;
  department_id?: string;
  date_from?: string;
  date_to?: string;
}

// ─── Offline Queue ──────────────────────────────────────────

export interface OfflineClockEntry {
  type: 'clock_in' | 'clock_out';
  payload: FieldClockInInput | FieldClockOutInput;
  queued_at: string;
}

export const FIELD_OFFLINE_QUEUE_KEY = 'field_clock_offline_queue';

// ─── Display Helpers ────────────────────────────────────────

export const ASSIGNMENT_STATUS_LABELS: Record<FieldAssignmentStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const ASSIGNMENT_STATUS_COLOR: Record<FieldAssignmentStatus, string> = {
  draft: '#9ca3af',
  active: '#3b82f6',
  in_progress: '#22c55e',
  completed: '#6b7280',
  cancelled: '#ef4444',
};
