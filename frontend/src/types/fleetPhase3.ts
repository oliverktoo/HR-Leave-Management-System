// Fleet Phase 3: Compliance Tracking Types
// License tracking, vehicle documents, and compliance alerts

export interface DriverLicense {
  license_number?: string;
  license_type?: 'class_a' | 'class_b' | 'class_c' | 'class_d' | 'class_e';
  license_issue_date?: string;
  license_expiry_date?: string;
  license_issuing_authority?: string;
  license_status?: 'active' | 'expired' | 'suspended' | 'revoked';
  license_document_url?: string;
  license_last_verified?: string;
  license_notes?: string;
}

export interface VehicleDocument {
  id: string;
  vehicle_id: string;
  // Joined data
  vehicle?: { plate_number: string; make: string; model: string } | null;
  document_type: 'registration' | 'insurance' | 'road_tax' | 'fitness_certificate' |
                 'pollution_certificate' | 'permit' | 'authorization' | 'other';
  document_number?: string;
  issue_date?: string;
  expiry_date: string;
  issuing_authority?: string;
  document_status: 'active' | 'expired' | 'pending_renewal';
  document_url?: string;
  document_filename?: string;
  uploaded_by: string;
  verified_by?: string;
  verified_at?: string;
  verification_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ComplianceAlert {
  id: string;
  alert_type: 'license_expiry' | 'vehicle_document_expiry' | 'maintenance_due' |
              'insurance_expiry' | 'registration_expiry' | 'service_overdue';
  alert_priority: 'low' | 'medium' | 'high' | 'critical';
  vehicle_id?: string;
  driver_id?: string;
  document_id?: string;
  maintenance_record_id?: string;
  title: string;
  description?: string;
  due_date?: string;
  days_until_due?: number;
  status: 'active' | 'acknowledged' | 'resolved' | 'dismissed';
  acknowledged_by?: string;
  acknowledged_at?: string;
  resolved_by?: string;
  resolved_at?: string;
  resolution_notes?: string;
  is_auto_generated: boolean;
  last_checked_at: string;
  created_at: string;
  updated_at: string;
  // Joined data (populated when fetched with joins)
  vehicle?: { plate_number: string; make: string; model: string } | null;
  driver?: { first_name: string; last_name: string } | null;
  document?: { document_type: string; document_number: string | null } | null;
}

// CRUD Input Types
export interface CreateVehicleDocumentInput {
  vehicle_id: string;
  document_type: VehicleDocument['document_type'];
  document_number?: string;
  issue_date?: string;
  expiry_date: string;
  issuing_authority?: string;
  document_status?: VehicleDocument['document_status'];
  document_url?: string;
  document_filename?: string;
  verification_notes?: string;
}

export interface UpdateVehicleDocumentInput extends Partial<CreateVehicleDocumentInput> {
  id: string;
  document_status?: VehicleDocument['document_status'];
  verified_by?: string;
  verified_at?: string;
}

export interface UpdateDriverLicenseInput extends Partial<DriverLicense> {
  user_id: string;
}

export interface CreateComplianceAlertInput {
  alert_type: ComplianceAlert['alert_type'];
  alert_priority?: ComplianceAlert['alert_priority'];
  vehicle_id?: string;
  driver_id?: string;
  document_id?: string;
  maintenance_record_id?: string;
  title: string;
  description?: string;
  due_date?: string;
  days_until_due?: number;
}

export interface UpdateComplianceAlertInput {
  id: string;
  status?: ComplianceAlert['status'];
  acknowledged_by?: string;
  acknowledged_at?: string;
  resolved_by?: string;
  resolved_at?: string;
  resolution_notes?: string;
}

// Filter and Query Types
export interface VehicleDocumentFilters {
  vehicle_id?: string;
  document_type?: VehicleDocument['document_type'];
  document_status?: VehicleDocument['document_status'];
  expiry_before?: string;
  expiry_after?: string;
}

export interface ComplianceAlertFilters {
  alert_type?: ComplianceAlert['alert_type'];
  alert_priority?: ComplianceAlert['alert_priority'];
  status?: ComplianceAlert['status'];
  vehicle_id?: string;
  driver_id?: string;
  due_before?: string;
  due_after?: string;
  limit?: number;
}

// Summary and Analytics Types
export interface ComplianceSummary {
  total_alerts: number;
  active_alerts: number;
  critical_alerts: number;
  high_priority_alerts: number;
  acknowledged_alerts: number;
  resolved_today: number;
  expiring_this_week: number;
  expiring_this_month: number;
}

export interface VehicleComplianceStatus {
  vehicle_id: string;
  plate_number: string;
  total_documents: number;
  active_documents: number;
  expiring_documents: number;
  expired_documents: number;
  compliance_score: number; // 0-100
  last_inspection?: string;
  next_service_due?: string;
}

export interface DriverComplianceStatus {
  driver_id: string;
  driver_name: string;
  license_status: 'valid' | 'expiring_soon' | 'expired' | 'no_license';
  license_expiry_date?: string;
  days_until_expiry?: number;
  active_alerts: number;
  compliance_score: number; // 0-100
}

// Dashboard Types
export interface ComplianceDashboardData {
  summary: ComplianceSummary;
  recent_alerts: ComplianceAlert[];
  expiring_soon: Array<{
    type: 'license' | 'document';
    id: string;
    name: string;
    expiry_date: string;
    days_until_expiry: number;
  }>;
  vehicle_compliance: VehicleComplianceStatus[];
  driver_compliance: DriverComplianceStatus[];
}

// File Upload Types
export interface DocumentUploadResult {
  success: boolean;
  document_url?: string;
  document_filename?: string;
  error?: string;
}

// Alert Generation Types
export interface AlertGenerationResult {
  alerts_created: number;
  alerts_updated: number;
  errors: string[];
}

// Bulk Operations Types
export interface BulkComplianceCheckInput {
  check_licenses?: boolean;
  check_documents?: boolean;
  check_maintenance?: boolean;
  notify_on_critical?: boolean;
}

export interface BulkComplianceCheckResult {
  license_alerts_created: number;
  document_alerts_created: number;
  maintenance_alerts_created: number;
  notifications_sent: number;
  errors: string[];
}