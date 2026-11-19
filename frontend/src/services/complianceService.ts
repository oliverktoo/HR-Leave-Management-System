// Fleet Phase 3: Compliance Service
// Handles license tracking, vehicle documents, and compliance alerts

import { supabase } from '../lib/supabaseClient';
import {
  DriverLicense,
  VehicleDocument,
  ComplianceAlert,
  CreateVehicleDocumentInput,
  UpdateVehicleDocumentInput,
  UpdateDriverLicenseInput,
  CreateComplianceAlertInput,
  VehicleDocumentFilters,
  ComplianceAlertFilters,
  ComplianceSummary,
  VehicleComplianceStatus,
  DriverComplianceStatus,
  ComplianceDashboardData,
  DocumentUploadResult,
  AlertGenerationResult,
  BulkComplianceCheckInput,
  BulkComplianceCheckResult
} from '../types/fleetPhase3';

// ============================================
// DRIVER LICENSE MANAGEMENT
// ============================================

export async function getDriverLicense(driverId: string): Promise<DriverLicense | null> {
  try {
    const { data, error } = await supabase
      .from('users_profile')
      .select(`
        license_number,
        license_type,
        license_issue_date,
        license_expiry_date,
        license_issuing_authority,
        license_status,
        license_document_url,
        license_last_verified,
        license_notes
      `)
      .eq('id', driverId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching driver license:', error);
    return null;
  }
}

export async function updateDriverLicense(input: UpdateDriverLicenseInput): Promise<DriverLicense | null> {
  try {
    const { data, error } = await supabase
      .from('users_profile')
      .update({
        license_number: input.license_number,
        license_type: input.license_type,
        license_issue_date: input.license_issue_date,
        license_expiry_date: input.license_expiry_date,
        license_issuing_authority: input.license_issuing_authority,
        license_status: input.license_status,
        license_document_url: input.license_document_url,
        license_last_verified: input.license_last_verified,
        license_notes: input.license_notes
      })
      .eq('id', input.user_id)
      .select(`
        license_number,
        license_type,
        license_issue_date,
        license_expiry_date,
        license_issuing_authority,
        license_status,
        license_document_url,
        license_last_verified,
        license_notes
      `)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating driver license:', error);
    throw error;
  }
}

export async function getExpiringDriverLicenses(daysAhead: number = 30): Promise<Array<{
  driver_id: string;
  driver_name: string;
  license_number: string | null;
  license_expiry_date: string;
  days_until_expiry: number;
}>> {
  try {
    const { data, error } = await supabase
      .from('users_profile')
      .select(`
        id,
        first_name,
        last_name,
        license_number,
        license_expiry_date
      `)
      // Include everyone with a license expiry date so expired licenses show up in compliance tracking
      .not('license_expiry_date', 'is', null)
      .lte('license_expiry_date', new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('license_expiry_date');

    if (error) throw error;

    return data.map(driver => ({
      driver_id: driver.id,
      driver_name: `${driver.first_name} ${driver.last_name}`,
      license_number: driver.license_number || null,
      license_expiry_date: driver.license_expiry_date,
      days_until_expiry: Math.ceil((new Date(driver.license_expiry_date).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    }));
  } catch (error) {
    console.error('Error fetching expiring driver licenses:', error);
    return [];
  }
}

// ============================================
// VEHICLE DOCUMENT MANAGEMENT
// ============================================

export async function getVehicleDocuments(filters?: VehicleDocumentFilters): Promise<VehicleDocument[]> {
  try {
    let query = supabase
      .from('vehicle_documents')
      .select(`
        *,
        vehicle:vehicle_id(plate_number, make, model),
        uploaded_by_user:uploaded_by(first_name, last_name),
        verified_by_user:verified_by(first_name, last_name)
      `)
      .order('expiry_date', { ascending: true });

    if (filters?.vehicle_id) {
      query = query.eq('vehicle_id', filters.vehicle_id);
    }
    if (filters?.document_type) {
      query = query.eq('document_type', filters.document_type);
    }
    if (filters?.document_status) {
      query = query.eq('document_status', filters.document_status);
    }
    if (filters?.expiry_before) {
      query = query.lte('expiry_date', filters.expiry_before);
    }
    if (filters?.expiry_after) {
      query = query.gte('expiry_date', filters.expiry_after);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching vehicle documents:', error);
    return [];
  }
}

export async function getVehicleDocumentById(id: string): Promise<VehicleDocument | null> {
  try {
    const { data, error } = await supabase
      .from('vehicle_documents')
      .select(`
        *,
        uploaded_by_user:uploaded_by(first_name, last_name),
        verified_by_user:verified_by(first_name, last_name)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching vehicle document:', error);
    return null;
  }
}

export async function createVehicleDocument(input: CreateVehicleDocumentInput): Promise<VehicleDocument> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('vehicle_documents')
      .insert({
        ...input,
        uploaded_by: user.id
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating vehicle document:', error);
    throw error;
  }
}

export async function updateVehicleDocument(input: UpdateVehicleDocumentInput): Promise<VehicleDocument> {
  try {
    const { data, error } = await supabase
      .from('vehicle_documents')
      .update(input)
      .eq('id', input.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating vehicle document:', error);
    throw error;
  }
}

export async function deleteVehicleDocument(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('vehicle_documents')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting vehicle document:', error);
    throw error;
  }
}

export async function uploadDocumentFile(file: File, vehicleId: string): Promise<DocumentUploadResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Create unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${vehicleId}_${Date.now()}.${fileExt}`;
    const filePath = `vehicle-documents/${fileName}`;

    // Upload file to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);

    return {
      success: true,
      document_url: urlData.publicUrl,
      document_filename: fileName
    };
  } catch (error) {
    console.error('Error uploading document file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed'
    };
  }
}

// ============================================
// COMPLIANCE ALERTS MANAGEMENT
// ============================================

export async function getComplianceAlerts(filters?: ComplianceAlertFilters): Promise<ComplianceAlert[]> {
  try {
    let query = supabase
      .from('compliance_alerts')
      .select(`
        *,
        vehicle:vehicle_id(plate_number, make, model),
        driver:driver_id(first_name, last_name),
        document:document_id(document_type, document_number)
      `)
      .order('created_at', { ascending: false });

    if (filters?.alert_type) {
      query = query.eq('alert_type', filters.alert_type);
    }
    if (filters?.alert_priority) {
      query = query.eq('alert_priority', filters.alert_priority);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.vehicle_id) {
      query = query.eq('vehicle_id', filters.vehicle_id);
    }
    if (filters?.driver_id) {
      query = query.eq('driver_id', filters.driver_id);
    }
    if (filters?.due_before) {
      query = query.lte('due_date', filters.due_before);
    }
    if (filters?.due_after) {
      query = query.gte('due_date', filters.due_after);
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching compliance alerts:', error);
    return [];
  }
}

export async function getComplianceAlertById(id: string): Promise<ComplianceAlert | null> {
  try {
    const { data, error } = await supabase
      .from('compliance_alerts')
      .select(`
        *,
        vehicle:vehicle_id(plate_number, make, model),
        driver:driver_id(first_name, last_name),
        document:document_id(document_type, document_number)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching compliance alert:', error);
    return null;
  }
}

export async function createComplianceAlert(input: CreateComplianceAlertInput): Promise<ComplianceAlert> {
  try {
    const { data, error } = await supabase
      .from('compliance_alerts')
      .insert(input)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating compliance alert:', error);
    throw error;
  }
}

export async function updateComplianceAlert(id: string, updates: Partial<ComplianceAlert>): Promise<ComplianceAlert> {
  try {
    const { data, error } = await supabase
      .from('compliance_alerts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating compliance alert:', error);
    throw error;
  }
}

export async function acknowledgeAlert(id: string, notes?: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('compliance_alerts')
      .update({
        status: 'acknowledged',
        acknowledged_by: user.id,
        acknowledged_at: new Date().toISOString(),
        resolution_notes: notes
      })
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    throw error;
  }
}

export async function resolveAlert(id: string, notes?: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('compliance_alerts')
      .update({
        status: 'resolved',
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
        resolution_notes: notes
      })
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error resolving alert:', error);
    throw error;
  }
}

// ============================================
// COMPLIANCE DASHBOARD & ANALYTICS
// ============================================

export async function getComplianceSummary(): Promise<ComplianceSummary> {
  try {
    const { data, error } = await supabase
      .from('compliance_alerts')
      .select('alert_priority, status, due_date');

    if (error) throw error;

    const alerts = data || [];
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const today = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

    return {
      total_alerts: alerts.length,
      active_alerts: alerts.filter(a => a.status === 'active').length,
      critical_alerts: alerts.filter(a => a.alert_priority === 'critical').length,
      high_priority_alerts: alerts.filter(a => a.alert_priority === 'high').length,
      acknowledged_alerts: alerts.filter(a => a.status === 'acknowledged').length,
      resolved_today: alerts.filter(a =>
        a.status === 'resolved' &&
        a.due_date?.startsWith(today)
      ).length,
      expiring_this_week: alerts.filter(a =>
        a.due_date && new Date(a.due_date) <= weekFromNow
      ).length,
      expiring_this_month: alerts.filter(a =>
        a.due_date && new Date(a.due_date) <= monthFromNow
      ).length
    };
  } catch (error) {
    console.error('Error fetching compliance summary:', error);
    return {
      total_alerts: 0,
      active_alerts: 0,
      critical_alerts: 0,
      high_priority_alerts: 0,
      acknowledged_alerts: 0,
      resolved_today: 0,
      expiring_this_week: 0,
      expiring_this_month: 0
    };
  }
}

export async function getComplianceDashboardData(): Promise<ComplianceDashboardData> {
  try {
    const [summary, recentAlerts, expiringSoon, vehicleCompliance, driverCompliance] = await Promise.all([
      getComplianceSummary(),
      getComplianceAlerts({ status: 'active', limit: 10 }),
      getExpiringItems(),
      getVehicleComplianceStatus(),
      getDriverComplianceStatus()
    ]);

    return {
      summary,
      recent_alerts: recentAlerts,
      expiring_soon: expiringSoon,
      vehicle_compliance: vehicleCompliance,
      driver_compliance: driverCompliance
    };
  } catch (error) {
    console.error('Error fetching compliance dashboard data:', error);
    throw error;
  }
}

// Helper function to get expiring items (licenses and documents)
async function getExpiringItems(): Promise<Array<{
  type: 'license' | 'document';
  id: string;
  name: string;
  expiry_date: string;
  days_until_expiry: number;
}>> {
  try {
    const [expiringLicenses, expiringDocuments] = await Promise.all([
      getExpiringDriverLicenses(30),
      getExpiringVehicleDocuments(30)
    ]);

    const licenseItems = expiringLicenses.map(l => ({
      type: 'license' as const,
      id: l.driver_id,
      name: `Driver: ${l.driver_name}`,
      expiry_date: l.license_expiry_date,
      days_until_expiry: l.days_until_expiry
    }));

    const documentItems = expiringDocuments.map(d => ({
      type: 'document' as const,
      id: d.document_id,
      name: `${d.vehicle_name} - ${d.document_type}`,
      expiry_date: d.expiry_date,
      days_until_expiry: d.days_until_expiry
    }));

    return [...licenseItems, ...documentItems]
      .sort((a, b) => a.days_until_expiry - b.days_until_expiry)
      .slice(0, 20);
  } catch (error) {
    console.error('Error fetching expiring items:', error);
    return [];
  }
}

// Helper function to get expiring vehicle documents
async function getExpiringVehicleDocuments(daysAhead: number = 30): Promise<Array<{
  document_id: string;
  vehicle_name: string;
  document_type: string;
  expiry_date: string;
  days_until_expiry: number;
}>> {
  try {
    const { data, error } = await supabase
      .from('vehicle_documents')
      .select(`
        id,
        document_type,
        expiry_date,
        vehicle:fleet_vehicles(plate_number, make, model)
      `)
      .eq('document_status', 'active')
      .lte('expiry_date', new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('expiry_date');

    if (error) throw error;

    return data.map(doc => {
      const v = Array.isArray(doc.vehicle) ? doc.vehicle[0] : doc.vehicle;
      return {
        document_id: doc.id,
        vehicle_name: v ? `${v.make} ${v.model} (${v.plate_number})` : 'Unknown Vehicle',
        document_type: doc.document_type,
        expiry_date: doc.expiry_date,
        days_until_expiry: Math.ceil((new Date(doc.expiry_date).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      };
    });
  } catch (error) {
    console.error('Error fetching expiring vehicle documents:', error);
    return [];
  }
}

// Helper function to get vehicle compliance status
async function getVehicleComplianceStatus(): Promise<VehicleComplianceStatus[]> {
  try {
    const { data, error } = await supabase
      .from('fleet_vehicles')
      .select(`
        id,
        plate_number,
        make,
        model,
        vehicle_documents(document_status, expiry_date)
      `);

    if (error) throw error;

    return data.map(vehicle => {
      const docs: Array<{ document_status: string; expiry_date: string }> =
        Array.isArray(vehicle.vehicle_documents) ? vehicle.vehicle_documents : [];

      const total = docs.length;
      let active = 0, expiring = 0, expired = 0;

      docs.forEach(doc => {
        if (doc.document_status === 'active') {
          active++;
          const days = Math.ceil((new Date(doc.expiry_date).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
          if (days < 0) expired++;
          else if (days <= 30) expiring++;
        }
      });

      let complianceScore = 100;
      if (total > 0) {
        const activeRatio = active / total;
        const penalty = (expired * 0.5) + (expiring * 0.2);
        complianceScore = Math.max(0, Math.min(100, Math.round((activeRatio * 100) - (penalty * 100))));
      }

      return {
        vehicle_id: vehicle.id,
        plate_number: vehicle.plate_number,
        total_documents: total,
        active_documents: active,
        expiring_documents: expiring,
        expired_documents: expired,
        compliance_score: complianceScore
      };
    });
  } catch (error) {
    console.error('Error fetching vehicle compliance status:', error);
    return [];
  }
}

// Helper function to get driver compliance status
async function getDriverComplianceStatus(): Promise<DriverComplianceStatus[]> {
  try {
    const { data, error } = await supabase
      .from('users_profile')
      .select(`
        id,
        first_name,
        last_name,
        license_status,
        license_expiry_date
      `)
      .eq('role', 'driver');

    if (error) throw error;

    return data.map(driver => {
      let licenseStatus: DriverComplianceStatus['license_status'] = 'no_license';
      let daysUntilExpiry: number | undefined;
      let complianceScore = 0;

      if (driver.license_status && driver.license_expiry_date) {
        daysUntilExpiry = Math.ceil((new Date(driver.license_expiry_date).getTime() - Date.now()) / (24 * 60 * 60 * 1000));

        if (daysUntilExpiry < 0) {
          licenseStatus = 'expired';
          complianceScore = 0;
        } else if (daysUntilExpiry <= 30) {
          licenseStatus = 'expiring_soon';
          complianceScore = 50;
        } else {
          licenseStatus = 'valid';
          complianceScore = 100;
        }
      }

      return {
        driver_id: driver.id,
        driver_name: `${driver.first_name} ${driver.last_name}`,
        license_status: licenseStatus,
        license_expiry_date: driver.license_expiry_date,
        days_until_expiry: daysUntilExpiry,
        active_alerts: 0, // TODO: Calculate from alerts table
        compliance_score: complianceScore
      };
    });
  } catch (error) {
    console.error('Error fetching driver compliance status:', error);
    return [];
  }
}

// ============================================
// AUTOMATED ALERT GENERATION
// ============================================

export async function generateComplianceAlerts(): Promise<AlertGenerationResult> {
  try {
    const { data: licenseResult, error: licenseError } = await supabase.rpc('check_license_expiry_alerts');
    const { data: documentResult, error: documentError } = await supabase.rpc('check_document_expiry_alerts');

    if (licenseError) throw licenseError;
    if (documentError) throw documentError;

    return {
      alerts_created: (licenseResult || 0) + (documentResult || 0),
      alerts_updated: 0, // TODO: Track updates
      errors: []
    };
  } catch (error) {
    console.error('Error generating compliance alerts:', error);
    return {
      alerts_created: 0,
      alerts_updated: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

export async function runBulkComplianceCheck(input: BulkComplianceCheckInput): Promise<BulkComplianceCheckResult> {
  try {
    let licenseAlerts = 0;
    let documentAlerts = 0;
    let maintenanceAlerts = 0;
    let notificationsSent = 0;
    const errors: string[] = [];

    if (input.check_licenses) {
      try {
        const result = await supabase.rpc('check_license_expiry_alerts');
        licenseAlerts = result.data || 0;
      } catch (error) {
        errors.push(`License check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (input.check_documents) {
      try {
        const result = await supabase.rpc('check_document_expiry_alerts');
        documentAlerts = result.data || 0;
      } catch (error) {
        errors.push(`Document check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // TODO: Implement maintenance checks
    if (input.check_maintenance) {
      maintenanceAlerts = 0; // Placeholder
    }

    // TODO: Implement notifications
    if (input.notify_on_critical) {
      notificationsSent = 0; // Placeholder
    }

    return {
      license_alerts_created: licenseAlerts,
      document_alerts_created: documentAlerts,
      maintenance_alerts_created: maintenanceAlerts,
      notifications_sent: notificationsSent,
      errors
    };
  } catch (error) {
    console.error('Error running bulk compliance check:', error);
    return {
      license_alerts_created: 0,
      document_alerts_created: 0,
      maintenance_alerts_created: 0,
      notifications_sent: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}