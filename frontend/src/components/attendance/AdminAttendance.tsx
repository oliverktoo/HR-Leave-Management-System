import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import { supabase } from '../../lib/supabaseClient';
import {
  getAllAttendanceRecords,
  getAttendanceSummary,
  getAttendanceSettings,
  updateAttendanceSettings,
  exportAttendanceToCSV,
  updateAttendanceRecord,
  deleteAttendanceRecord,
  getEmployeeAttendanceReport,
  type AttendanceRecord,
  type AttendanceSummary,
  type AttendanceSettings,
  type OOOAttendanceRow,
} from '../../services/attendanceService';
import { formatEmployeeId } from '../../utils/formatters';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export const AdminAttendance = () => {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'records' | 'summary' | 'settings'>('records');
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary[]>([]);
  const [settings, setSettings] = useState<AttendanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [department, setDepartment] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  
  // OOO rows merged with attendance when single employee is filtered
  const [oooRows, setOooRows] = useState<OOOAttendanceRow[]>([]);
  const [reportDownloading, setReportDownloading] = useState(false);

  // Edit mode
  const [editingRecord, setEditingRecord] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<AttendanceRecord>>({});

  // Settings edit
  const [editingSettings, setEditingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<Partial<AttendanceSettings>>({});

  // Auto-set department filter for HODs and fetch department name
  useEffect(() => {
    const loadDepartmentName = async () => {
      if ((profile?.role as string) === 'hod' && profile?.department_id) {
        setDepartment(profile.department_id);
        
        // Fetch department name
        const { data } = await supabase
          .from('departments')
          .select('name')
          .eq('id', profile.department_id)
          .single();
        
        if (data) {
          setDepartmentName(data.name);
        }
      }
    };
    
    loadDepartmentName();
  }, [profile]);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    
    try {
      if (activeTab === 'records') {
        await loadAttendanceRecords();
      } else if (activeTab === 'summary') {
        await loadAttendanceSummary();
      } else if (activeTab === 'settings') {
        await loadAttendanceSettings();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadAttendanceRecords = async () => {
    const deptFilter = (profile?.role as string) === 'hod' && profile?.department_id
      ? profile.department_id
      : (department || undefined);

    const { data, error: fetchError } = await getAllAttendanceRecords(
      startDate || undefined,
      endDate || undefined,
      deptFilter,
      employeeId || undefined
    );

    if (fetchError) {
      setError('Failed to load attendance records');
    } else {
      setAttendanceRecords(data || []);
    }

    // When filtering by a single employee, also load OOO rows
    if (employeeId) {
      const s = startDate || new Date(new Date().setMonth(new Date().getMonth() - 1)).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
      const e = endDate   || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
      const { data: merged } = await getEmployeeAttendanceReport(employeeId, s, e);
      // Keep only the OOO rows (attendance rows are already in attendanceRecords)
      setOooRows((merged || []).filter(r => r.row_type === 'ooo'));
    } else {
      setOooRows([]);
    }
  };

  const loadAttendanceSummary = async () => {
    // For HODs, always filter by their department
    const deptFilter = (profile?.role as string) === 'hod' && profile?.department_id 
      ? profile.department_id 
      : (department || undefined);
    
    const { data, error: fetchError } = await getAttendanceSummary(deptFilter);
    
    if (fetchError) {
      setError('Failed to load attendance summary');
    } else {
      setAttendanceSummary(data || []);
    }
  };

  const loadAttendanceSettings = async () => {
    const { data, error: fetchError } = await getAttendanceSettings();
    
    if (fetchError) {
      setError('Failed to load attendance settings');
    } else {
      setSettings(data);
      setSettingsForm(data || {});
    }
  };

  const handleFilter = () => {
    loadAttendanceRecords();
  };

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
    setDepartment('');
    setEmployeeId('');
    setOooRows([]);
  };

  const handleDownloadEmployeeReport = async () => {
    if (!employeeId) return;
    setReportDownloading(true);
    const s = startDate || new Date(new Date().setMonth(new Date().getMonth() - 1)).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const e = endDate   || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

    const { data: rows, employeeName, department: dept } = await getEmployeeAttendanceReport(employeeId, s, e);
    setReportDownloading(false);
    if (!rows) { setError('Failed to generate report'); return; }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('Football Kenya Federation — Attendance Report', 148, 16, { align: 'center' });
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Employee: ${employeeName || employeeId}  |  ID: ${formatEmployeeId(employeeId)}  |  Department: ${dept || '—'}`, 148, 24, { align: 'center' });
    doc.text(`Period: ${s} to ${e}  |  Generated: ${new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' })} ${new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi' })}`, 148, 30, { align: 'center' });

    const tableRows = rows.map(r => {
      if (r.row_type === 'ooo') {
        return [
          r.date,
          'OOO',
          r.ooo_title || r.ooo_type || 'OOO',
          '—',
          '—',
          '—',
          r.ooo_type?.replace(/_/g, ' ') || '',
        ];
      }
      const cin = r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' }) : '—';
      const cout = r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' }) : '—';
      return [
        r.date,
        r.status?.replace(/_/g, ' ').toUpperCase() || '—',
        'Office',
        cin,
        cout,
        r.work_hours != null ? `${r.work_hours.toFixed(2)}h` : '—',
        r.notes || '',
      ];
    });

    autoTable(doc, {
      startY: 36,
      head: [['Date', 'Status', 'Location / Assignment', 'Check In', 'Check Out', 'Hours', 'Notes']],
      body: tableRows,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 255] },
      didParseCell: (data: any) => {
        if (data.row.raw[1] === 'OOO') {
          data.cell.styles.fillColor = [224, 247, 250];
          data.cell.styles.textColor = [0, 131, 143];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    // Summary row
    const present = rows.filter(r => r.row_type === 'attendance').length;
    const ooo = rows.filter(r => r.row_type === 'ooo').length;
    const totalHours = rows.reduce((s, r) => s + (r.work_hours || 0), 0);
    const finalY = (doc as any).lastAutoTable.finalY + 6;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text(`Total: ${rows.length} days recorded  |  ${present} attendance days  |  ${ooo} OOO days  |  ${totalHours.toFixed(2)}h worked`, 15, finalY);

    doc.save(`Attendance_${formatEmployeeId(employeeId)}_${s}_to_${e}.pdf`);
  };

  const handleExport = async () => {
    const start = startDate || new Date(new Date().setMonth(new Date().getMonth() - 1)).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const end = endDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    
    // For HODs, always use their department
    const deptFilter = (profile?.role as string) === 'hod' && profile?.department_id 
      ? profile.department_id 
      : (department || undefined);
    
    const { error: exportError } = await exportAttendanceToCSV(
      start,
      end,
      deptFilter
    );
    
    if (exportError) {
      setError('Failed to export data');
    } else {
      setSuccess('Attendance data exported successfully!');
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const handleEditRecord = (record: AttendanceRecord) => {
    setEditingRecord(record.id);
    setEditForm({
      check_in_time: record.check_in_time,
      check_out_time: record.check_out_time,
      status: record.status,
      notes: record.notes,
    });
  };

  const handleSaveRecord = async (recordId: string) => {
    const { error: updateError } = await updateAttendanceRecord(recordId, editForm);
    
    if (updateError) {
      setError('Failed to update record');
    } else {
      setSuccess('Record updated successfully!');
      setEditingRecord(null);
      await loadAttendanceRecords();
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const handleCancelEdit = () => {
    setEditingRecord(null);
    setEditForm({});
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!confirm('Are you sure you want to delete this attendance record?')) {
      return;
    }
    
    const { error: deleteError } = await deleteAttendanceRecord(recordId);
    
    if (deleteError) {
      setError('Failed to delete record');
    } else {
      setSuccess('Record deleted successfully!');
      await loadAttendanceRecords();
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const handleSaveSettings = async () => {
    const { error: updateError } = await updateAttendanceSettings(settingsForm);
    
    if (updateError) {
      setError('Failed to update settings');
    } else {
      setSuccess('Settings updated successfully!');
      setEditingSettings(false);
      await loadAttendanceSettings();
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-GB', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'present':
        return 'badge-success';
      case 'late':
        return 'badge-warning';
      case 'half_day':
        return 'badge-info';
      case 'absent':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  };

  if (!profile || (profile.role !== 'hr_admin' && profile.role !== 'super_admin' && profile.role !== 'hod')) {
    return (
      <div className="app">
        <div className="content">
          <div className="alert alert-danger">You do not have permission to access this page.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <AdminSidebar />

      <div className="content">
        <div className="page-header">
          <div>
            <h1 className="page-title">
              <span style={{ marginRight: '0.5rem' }}>🕐</span>
              {(profile?.role as string) === 'hod' ? 'Department Attendance' : 'Attendance Management'}
            </h1>
            <p className="page-subtitle">
              {(profile?.role as string) === 'hod'
                ? 'View and manage your department\'s attendance records'
                : 'View and manage staff attendance records'}
            </p>
          </div>
          <NotificationBell />
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
            <span style={{ marginRight: '0.5rem' }}>❌</span>
            {error}
          </div>
        )}

        {success && (
          <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
            <span style={{ marginRight: '0.5rem' }}>✅</span>
            {success}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '2px solid var(--gray-200)' }}>
          <button
            className="btn"
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderBottom: activeTab === 'records' ? '2px solid var(--primary-600)' : '2px solid transparent',
              background: activeTab === 'records' ? 'var(--primary-50)' : 'transparent',
              color: activeTab === 'records' ? 'var(--primary-700)' : 'var(--gray-600)',
              fontWeight: activeTab === 'records' ? '600' : '500',
              borderRadius: '0',
              marginBottom: '-2px'
            }}
            onClick={() => setActiveTab('records')}
          >
            <span style={{ fontSize: '1.1rem', marginRight: '0.5rem' }}>📅</span>
            Attendance Records
          </button>
          <button
            className="btn"
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderBottom: activeTab === 'summary' ? '2px solid var(--primary-600)' : '2px solid transparent',
              background: activeTab === 'summary' ? 'var(--primary-50)' : 'transparent',
              color: activeTab === 'summary' ? 'var(--primary-700)' : 'var(--gray-600)',
              fontWeight: activeTab === 'summary' ? '600' : '500',
              borderRadius: '0',
              marginBottom: '-2px'
            }}
            onClick={() => setActiveTab('summary')}
          >
            <span style={{ fontSize: '1.1rem', marginRight: '0.5rem' }}>📊</span>
            Summary & Reports
          </button>
          {/* Hide Settings tab from HODs - only HR Admin and Super Admin can access */}
          {(profile?.role as string) !== 'hod' && (
            <button
              className="btn"
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderBottom: activeTab === 'settings' ? '2px solid var(--primary-600)' : '2px solid transparent',
                background: activeTab === 'settings' ? 'var(--primary-50)' : 'transparent',
                color: activeTab === 'settings' ? 'var(--primary-700)' : 'var(--gray-600)',
                fontWeight: activeTab === 'settings' ? '600' : '500',
                borderRadius: '0',
                marginBottom: '-2px'
              }}
              onClick={() => setActiveTab('settings')}
            >
              <span style={{ fontSize: '1.1rem', marginRight: '0.5rem' }}>⚙️</span>
              Settings
            </button>
          )}
        </div>

        {/* Attendance Records Tab */}
        {activeTab === 'records' && (
          <div>
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header">
                <h3 className="card-title">Filter Records</h3>
              </div>
              <div style={{ padding: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>Start Date</label>
                    <input
                      type="date"
                      className="form-input"
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--gray-300)' }}
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>End Date</label>
                    <input
                      type="date"
                      className="form-input"
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--gray-300)' }}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                      Department
                      {(profile?.role as string) === 'hod' && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--primary-600)' }}>
                          (Your Department)
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--gray-300)' }}
                      value={(profile?.role as string) === 'hod' ? departmentName : department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="Filter by department..."
                      disabled={(profile?.role as string) === 'hod'}
                      title={(profile?.role as string) === 'hod' ? 'HODs can only view their own department' : ''}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>Employee ID</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--gray-300)' }}
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      placeholder="Filter by employee ID..."
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button onClick={handleFilter} className="btn btn-primary">
                    <span style={{ marginRight: '0.5rem' }}>🔍</span>
                    Apply Filters
                  </button>
                  <button onClick={handleClearFilters} className="btn btn-secondary">
                    <span style={{ marginRight: '0.5rem' }}>✖️</span>
                    Clear Filters
                  </button>
                  <button onClick={handleExport} className="btn btn-success">
                    <span style={{ marginRight: '0.5rem' }}>📥</span>
                    Export to CSV
                  </button>
                  {employeeId && (
                    <button
                      onClick={handleDownloadEmployeeReport}
                      disabled={reportDownloading}
                      className="btn"
                      style={{ background: '#0891b2', color: '#fff', border: 'none' }}
                    >
                      <span style={{ marginRight: '0.5rem' }}>📄</span>
                      {reportDownloading ? 'Generating…' : 'Download Employee Report (PDF)'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                Attendance Records ({attendanceRecords.length + oooRows.length}
                {oooRows.length > 0 && <span style={{ fontSize: '0.75rem', color: '#0891b2', fontWeight: 500, marginLeft: 6 }}>incl. {oooRows.length} OOO</span>}
                )
              </h3>
              </div>
              
              {/* HOD View-Only Notice */}
              {(profile?.role as string) === 'hod' && (
                <div style={{ 
                  padding: '1rem', 
                  backgroundColor: 'var(--primary-50)', 
                  borderBottom: '1px solid var(--primary-200)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{ fontSize: '1.25rem' }}>ℹ️</span>
                  <span style={{ color: 'var(--primary-700)', fontSize: '0.875rem', fontWeight: '500' }}>
                    View-only access: You can view and export your department's attendance records, but cannot edit or delete them.
                  </span>
                </div>
              )}
              
              <div>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="loading-spinner"></div>
                    <p style={{ marginTop: '1rem', color: 'var(--gray-600)' }}>Loading records...</p>
                  </div>
                ) : attendanceRecords.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <span style={{ fontSize: '3rem' }}>👥</span>
                    <h3 style={{ margin: '1rem 0 0.5rem', color: 'var(--gray-900)' }}>No attendance records found</h3>
                    <p style={{ color: 'var(--gray-600)' }}>Try adjusting your filters or check back later.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--gray-50)', borderBottom: '2px solid var(--gray-200)' }}>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Date</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Employee ID</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Employee Name</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Department</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Check In</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Check Out</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Hours</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Status</th>
                          {(profile?.role as string) !== 'hod' && (
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Actions</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                      {/* Merge attendance + OOO rows sorted by date */}
                      {[
                        ...attendanceRecords.map(r => ({ type: 'attendance' as const, date: r.date, data: r })),
                        ...oooRows.map(r => ({ type: 'ooo' as const, date: r.date, data: r })),
                      ].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0).map((item) => {
                        if (item.type === 'ooo') {
                          const row = item.data as OOOAttendanceRow;
                          return (
                            <tr key={row.id} style={{ borderBottom: '1px solid #b2ebf2', background: '#e0f7fa' }}>
                              <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#006064' }}>{formatDate(row.date)}</td>
                              <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#006064' }}>{formatEmployeeId(row.employee_id)}</td>
                              <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#006064', fontWeight: 600 }}>{row.employee_name}</td>
                              <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#006064' }}>—</td>
                              <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#00838f' }}>—</td>
                              <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#00838f' }}>—</td>
                              <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#00838f' }}>
                                📤 {row.ooo_title || row.ooo_type}
                              </td>
                              <td style={{ padding: '0.75rem 1rem' }}>
                                <span style={{ background: '#00838f', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>OOO</span>
                              </td>
                              {(profile?.role as string) !== 'hod' && (
                                <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#00838f', fontStyle: 'italic' }}>—</td>
                              )}
                            </tr>
                          );
                        }

                        const record = item.data as AttendanceRecord;
                        const userProfile = (record as any).users_profile;
                        const employeeName = userProfile
                          ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim()
                          : record.employee_name;

                        return (
                          <tr key={record.id} style={{ borderBottom: '1px solid var(--gray-200)' }}>
                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{formatDate(record.date)}</td>
                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{formatEmployeeId(record.employee_id)}</td>
                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{employeeName}</td>
                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{userProfile?.department_name || '-'}</td>
                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                            {editingRecord === record.id ? (
                              <input
                                type="time"
                                className="form-input-small"
                                value={editForm.check_in_time
                                  ? new Date(editForm.check_in_time).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })
                                  : ''}
                                onChange={(e) => setEditForm({
                                  ...editForm,
                                  check_in_time: `${record.date}T${e.target.value}:00+03:00`
                                })}
                              />
                            ) : (
                              formatTime(record.check_in_time)
                            )}
                          </td>
                          <td>
                            {editingRecord === record.id ? (
                              <input
                                type="time"
                                className="form-input-small"
                                value={editForm.check_out_time
                                  ? new Date(editForm.check_out_time).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })
                                  : ''}
                                onChange={(e) => setEditForm({
                                  ...editForm,
                                  check_out_time: e.target.value ? `${record.date}T${e.target.value}:00+03:00` : null
                                })}
                              />
                            ) : record.check_out_time ? (
                              formatTime(record.check_out_time)
                            ) : (
                              <span style={{ color: 'var(--gray-500)' }}>Not checked out</span>
                            )}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                              {record.work_hours
                                ? `${record.work_hours.toFixed(2)}h`
                                : <span style={{ color: 'var(--gray-500)' }}>-</span>
                              }
                            </td>
                            <td style={{ padding: '0.75rem 1rem' }}>
                            {editingRecord === record.id ? (
                              <select
                                className="form-input-small"
                                value={editForm.status || record.status}
                                onChange={(e) => setEditForm({
                                  ...editForm,
                                  status: e.target.value as AttendanceRecord['status']
                                })}
                              >
                                <option value="present">Present</option>
                                <option value="late">Late</option>
                                <option value="half_day">Half Day</option>
                                <option value="absent">Absent</option>
                              </select>
                            ) : (
                              <span className={`badge ${getStatusBadgeClass(record.status)}`}>
                                {record.status.replace('_', ' ')}
                              </span>
                            )}
                            </td>
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                              {/* Only HR Admin and Super Admin can edit/delete */}
                              {(profile?.role as string) !== 'hod' && (
                                <>
                                  {editingRecord === record.id ? (
                                    <>
                                      <button
                                        onClick={() => handleSaveRecord(record.id)}
                                        className="btn btn-success"
                                        style={{ padding: '0.375rem 0.75rem', fontSize: '0.875rem' }}
                                        title="Save"
                                      >
                                        <span>✔️</span>
                                      </button>
                                      <button
                                        onClick={handleCancelEdit}
                                        className="btn btn-secondary"
                                        style={{ padding: '0.375rem 0.75rem', fontSize: '0.875rem' }}
                                        title="Cancel"
                                      >
                                        <span>❌</span>
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => handleEditRecord(record)}
                                        className="btn btn-primary"
                                        style={{ padding: '0.375rem 0.75rem', fontSize: '0.875rem' }}
                                        title="Edit"
                                      >
                                        <span>✏️</span>
                                      </button>
                                      <button
                                        onClick={() => handleDeleteRecord(record.id)}
                                        className="btn btn-danger"
                                        style={{ padding: '0.375rem 0.75rem', fontSize: '0.875rem' }}
                                        title="Delete"
                                      >
                                        <span>🗑️</span>
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                              {/* HODs see view-only indicator */}
                              {(profile?.role as string) === 'hod' && (
                                <span style={{ 
                                  padding: '0.375rem 0.75rem', 
                                  fontSize: '0.75rem', 
                                  color: 'var(--gray-600)',
                                  fontStyle: 'italic'
                                }}>
                                  View Only
                                </span>
                              )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          </div>
        )}

        {/* Summary Tab */}
        {activeTab === 'summary' && (
          <div>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <span style={{ marginRight: '0.5rem' }}>📊</span>
                  Monthly Attendance Summary
                </h3>
              </div>
              <div>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="loading-spinner"></div>
                    <p style={{ marginTop: '1rem', color: 'var(--gray-600)' }}>Loading summary...</p>
                  </div>
                ) : attendanceSummary.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <span style={{ fontSize: '3rem' }}>📊</span>
                    <h3 style={{ margin: '1rem 0 0.5rem', color: 'var(--gray-900)' }}>No summary data available</h3>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--gray-50)', borderBottom: '2px solid var(--gray-200)' }}>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Employee ID</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Name</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Department</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Days Present</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Days Late</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Half Days</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Total Hours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceSummary.map((summary) => (
                          <tr key={summary.user_id} style={{ borderBottom: '1px solid var(--gray-200)' }}>
                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{formatEmployeeId(summary.employee_id)}</td>
                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{summary.full_name}</td>
                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{summary.department_name || '-'}</td>
                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{summary.days_present}</td>
                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{summary.days_late}</td>
                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{summary.half_days}</td>
                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{summary.total_hours.toFixed(2)}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && settings && (
          <div>
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 className="card-title">
                    <span style={{ marginRight: '0.5rem' }}>⚙️</span>
                    Attendance Settings
                  </h3>
                  {!editingSettings && (
                    <button
                      onClick={() => setEditingSettings(true)}
                      className="btn btn-primary"
                    >
                      <span style={{ marginRight: '0.5rem' }}>✏️</span>
                      Edit Settings
                    </button>
                  )}
                </div>
              </div>
              <div style={{ padding: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                  <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>Work Start Time</label>
                    <input
                      type="time"
                      className="form-input"
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--gray-300)' }}
                      value={settingsForm.work_start_time || ''}
                      onChange={(e) => setSettingsForm({
                        ...settingsForm,
                        work_start_time: e.target.value
                      })}
                      disabled={!editingSettings}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>Work End Time</label>
                    <input
                      type="time"
                      className="form-input"
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--gray-300)' }}
                      value={settingsForm.work_end_time || ''}
                      onChange={(e) => setSettingsForm({
                        ...settingsForm,
                        work_end_time: e.target.value
                      })}
                      disabled={!editingSettings}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>Late Threshold (minutes)</label>
                    <input
                      type="number"
                      className="form-input"
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--gray-300)' }}
                      value={settingsForm.late_threshold_minutes || ''}
                      onChange={(e) => setSettingsForm({
                        ...settingsForm,
                        late_threshold_minutes: parseInt(e.target.value)
                      })}
                      disabled={!editingSettings}
                    />
                </div>
                <div className="form-group">
                  <label>Grace Period (minutes)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={settingsForm.grace_period_minutes || ''}
                    onChange={(e) => setSettingsForm({
                      ...settingsForm,
                      grace_period_minutes: parseInt(e.target.value)
                    })}
                    disabled={!editingSettings}
                  />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>Half Day Hours</label>
                    <input
                      type="number"
                      step="0.5"
                      className="form-input"
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--gray-300)' }}
                      value={settingsForm.half_day_hours || ''}
                      onChange={(e) => setSettingsForm({
                        ...settingsForm,
                        half_day_hours: parseFloat(e.target.value)
                      })}
                      disabled={!editingSettings}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>Full Day Hours</label>
                    <input
                      type="number"
                      step="0.5"
                      className="form-input"
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--gray-300)' }}
                      value={settingsForm.full_day_hours || ''}
                      onChange={(e) => setSettingsForm({
                        ...settingsForm,
                        full_day_hours: parseFloat(e.target.value)
                      })}
                      disabled={!editingSettings}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                      <input
                        type="checkbox"
                        checked={settingsForm.enable_location_tracking || false}
                        onChange={(e) => setSettingsForm({
                          ...settingsForm,
                          enable_location_tracking: e.target.checked
                        })}
                        disabled={!editingSettings}
                      />
                      Enable Location Tracking
                    </label>
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                      <input
                        type="checkbox"
                        checked={settingsForm.require_checkout || false}
                        onChange={(e) => setSettingsForm({
                          ...settingsForm,
                          require_checkout: e.target.checked
                        })}
                        disabled={!editingSettings}
                      />
                      Require Check Out
                    </label>
                  </div>
                </div>
                {editingSettings && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                    <button onClick={handleSaveSettings} className="btn btn-success">
                      <span style={{ marginRight: '0.5rem' }}>✔️</span>
                      Save Settings
                    </button>
                    <button
                      onClick={() => {
                        setEditingSettings(false);
                        setSettingsForm(settings);
                      }}
                      className="btn btn-secondary"
                    >
                      <span style={{ marginRight: '0.5rem' }}>❌</span>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAttendance;
