import { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import {
  getLateReport,
  getHoursReport,
  getAbsenceReport,
  type AttendanceLateRecord,
  type AttendanceHoursRecord,
  type EmployeeAbsenceRecord,
} from '../../services/attendanceRotaService';
import {
  generateMonthlyAttendancePDF,
  type MonthlyReportEmployee,
} from '../../services/pdfService';
import { supabase } from '../../lib/supabaseClient';

// =====================================================
// Helpers
// =====================================================

function padZ(n: number): string {
  return String(n).padStart(2, '0');
}

function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const last = new Date(y, m, 0).getDate();
  return {
    start: `${y}-${padZ(m)}-01`,
    end: `${y}-${padZ(m)}-${padZ(last)}`,
  };
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${padZ(now.getMonth() + 1)}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${padZ(d.getHours())}:${padZ(d.getMinutes())}`;
}

function fmtDate(ds: string): string {
  const [y, m, d] = ds.split('-');
  return `${d}/${m}/${y}`;
}

function exportCsv(rows: string[][], filename: string): void {
  const content = rows.map(r => r.map(cell =>
    `"${String(cell ?? '').replace(/"/g, '""')}"`
  ).join(',')).join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// =====================================================
// Types
// =====================================================

type ReportTab = 'late' | 'hours' | 'absent' | 'download';
type ReportScope = 'all' | 'employee';

interface Department {
  id: string;
  name: string;
}

interface EmployeeOption {
  id: string;
  name: string;
  employee_id: string;
}

// =====================================================
// Status cell colours for absence grid
// =====================================================

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  present:     { bg: '#dcfce7', color: '#166534', label: 'P' },
  late:        { bg: '#fef3c7', color: '#92400e', label: 'L' },
  absent:      { bg: '#fee2e2', color: '#991b1b', label: 'A' },
  leave:       { bg: '#dbeafe', color: '#1e40af', label: 'LV' },
  field:       { bg: '#ccfbf1', color: '#065f46', label: 'F' },
  holiday:     { bg: '#e2e8f0', color: '#334155', label: 'H' },
  off:         { bg: '#f1f5f9', color: '#64748b', label: 'O' },
  no_schedule: { bg: '#fff',    color: '#cbd5e1', label: '—' },
  future:      { bg: '#fff',    color: '#cbd5e1', label: '·' },
};

// =====================================================
// Main Component
// =====================================================

export const AttendanceReports = () => {
  const [activeTab, setActiveTab] = useState<ReportTab>('late');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  // Late report state
  const [lateStart, setLateStart] = useState(currentMonthRange().start);
  const [lateEnd, setLateEnd] = useState(currentMonthRange().end);
  const [lateDept, setLateDept] = useState('');
  const [lateUserId, setLateUserId] = useState('');
  const [lateData, setLateData] = useState<AttendanceLateRecord[]>([]);
  const [lateLoading, setLateLoading] = useState(false);
  const [lateError, setLateError] = useState('');

  // Hours report state
  const [hoursMonth, setHoursMonth] = useState(currentYearMonth());
  const [hoursDept, setHoursDept] = useState('');
  const [hoursEmployee, setHoursEmployee] = useState('');
  const [hoursData, setHoursData] = useState<AttendanceHoursRecord[]>([]);
  const [hoursLoading, setHoursLoading] = useState(false);
  const [hoursError, setHoursError] = useState('');

  // Absence report state
  const [absenceMonth, setAbsenceMonth] = useState(currentYearMonth());
  const [absenceDept, setAbsenceDept] = useState('');
  const [absenceData, setAbsenceData] = useState<EmployeeAbsenceRecord[]>([]);
  const [absenceLoading, setAbsenceLoading] = useState(false);
  const [absenceError, setAbsenceError] = useState('');

  // Download report state
  const [dlMonth, setDlMonth]     = useState(currentYearMonth());
  const [dlScope, setDlScope]     = useState<ReportScope>('all');
  const [dlEmployee, setDlEmployee] = useState('');
  const [dlDept, setDlDept]       = useState('');
  const [dlData, setDlData]       = useState<MonthlyReportEmployee[] | null>(null);
  const [dlLoading, setDlLoading] = useState(false);
  const [dlError, setDlError]     = useState('');

  // Load departments and employees once
  useEffect(() => {
    const loadMeta = async () => {
      const [deptRes, empRes] = await Promise.all([
        supabase.from('departments').select('id, name').order('name'),
        supabase
          .from('users_profile')
          .select('id, first_name, last_name, employee_id')
          .eq('is_active', true)
          .order('first_name'),
      ]);
      if (deptRes.data) setDepartments(deptRes.data as Department[]);
      if (empRes.data) {
        setEmployees(
          (empRes.data as Array<{ id: string; first_name: string; last_name: string; employee_id: string }>)
            .map(e => ({ id: e.id, name: `${e.first_name} ${e.last_name}`, employee_id: e.employee_id }))
        );
      }
    };
    loadMeta();
  }, []);

  // ---- Late report fetch ----
  const fetchLate = useCallback(async () => {
    setLateLoading(true);
    setLateError('');
    try {
      const data = await getLateReport(lateStart, lateEnd, lateDept || undefined, lateUserId || undefined);
      setLateData(data);
    } catch (e) {
      setLateError(e instanceof Error ? e.message : 'Failed to load late report');
    } finally {
      setLateLoading(false);
    }
  }, [lateStart, lateEnd, lateDept, lateUserId]);

  // ---- Hours report fetch ----
  const fetchHours = useCallback(async () => {
    setHoursLoading(true);
    setHoursError('');
    try {
      const [y, m] = hoursMonth.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      const start = `${y}-${padZ(m)}-01`;
      const end = `${y}-${padZ(m)}-${padZ(last)}`;
      const data = await getHoursReport(
        start, end,
        hoursDept     || undefined,
        hoursEmployee || undefined,
      );
      setHoursData(data);
    } catch (e) {
      setHoursError(e instanceof Error ? e.message : 'Failed to load hours report');
    } finally {
      setHoursLoading(false);
    }
  }, [hoursMonth, hoursDept, hoursEmployee]);

  // ---- Absence report fetch ----
  const fetchAbsence = useCallback(async () => {
    setAbsenceLoading(true);
    setAbsenceError('');
    try {
      const [y, m] = absenceMonth.split('-').map(Number);
      const data = await getAbsenceReport(y, m, absenceDept || undefined);
      setAbsenceData(data);
    } catch (e) {
      setAbsenceError(e instanceof Error ? e.message : 'Failed to load absence report');
    } finally {
      setAbsenceLoading(false);
    }
  }, [absenceMonth, absenceDept]);

  // ---- Download report: generate data ----
  const generateDownloadReport = useCallback(async () => {
    setDlLoading(true);
    setDlError('');
    setDlData(null);
    try {
      const [y, m] = dlMonth.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      const startDate = `${y}-${padZ(m)}-01`;
      const endDate   = `${y}-${padZ(m)}-${padZ(last)}`;

      const [absenceResult, hoursResult] = await Promise.all([
        getAbsenceReport(y, m, dlDept || undefined),
        getHoursReport(startDate, endDate, dlDept || undefined),
      ]);

      const hoursMap = new Map(hoursResult.map(h => [h.user_id, h]));

      let combined: MonthlyReportEmployee[] = absenceResult.map(emp => {
        const hrs = hoursMap.get(emp.user_id);
        return {
          user_id: emp.user_id,
          employee_name: emp.employee_name,
          employee_id: emp.employee_id,
          department: emp.department,
          present: emp.summary.present,
          late: emp.summary.late,
          absent: emp.summary.absent,
          leave: emp.summary.leave,
          field: emp.summary.field,
          holiday: emp.summary.holiday,
          off: emp.summary.off,
          office_hours: hrs?.office_hours ?? 0,
          field_hours: hrs?.field_hours ?? 0,
          total_hours_worked: hrs?.total_hours_worked ?? 0,
          standard_hours: hrs?.standard_hours ?? 0,
          variance_hours: hrs?.variance_hours ?? 0,
          completion_pct: hrs?.completion_pct ?? 0,
          days: emp.days,
        };
      });

      if (dlScope === 'employee' && dlEmployee) {
        combined = combined.filter(e => e.user_id === dlEmployee);
      }

      setDlData(combined);
    } catch (e) {
      setDlError(e instanceof Error ? e.message : 'Failed to generate report');
    } finally {
      setDlLoading(false);
    }
  }, [dlMonth, dlScope, dlEmployee, dlDept]);

  // ---- Download report: CSV export ----
  const exportDownloadCsv = () => {
    if (!dlData) return;
    const [y, m] = dlMonth.split('-').map(Number);
    const isSingle = dlScope === 'employee' && dlData.length === 1;
    const monthLabel = new Date(y, m - 1, 1).toLocaleString('en-KE', { month: 'long', timeZone: 'Africa/Nairobi' });
    const period = `${monthLabel} ${y}`;
    const generated = new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' });

    const rows: string[][] = [];
    if (isSingle) {
      const emp = dlData[0];
      rows.push([`Monthly Attendance Report — ${emp.employee_name}`]);
      rows.push([`Period: ${period}`, `Generated: ${generated}`]);
      rows.push([`Employee ID: ${emp.employee_id}`, `Department: ${emp.department}`]);
      rows.push([`Present: ${emp.present}`, `Late: ${emp.late}`, `Absent: ${emp.absent}`, `Leave: ${emp.leave}`, `Field Days: ${emp.field}`, `Holiday: ${emp.holiday}`, `Off: ${emp.off}`, `Office Hrs: ${emp.office_hours.toFixed(1)}h`, `Field Hrs: ${emp.field_hours.toFixed(1)}h`, `Total Hrs: ${emp.total_hours_worked.toFixed(1)}h`, `Std Hrs: ${emp.standard_hours.toFixed(1)}h`, `Completion: ${emp.completion_pct.toFixed(0)}%`]);
      rows.push([]);
      rows.push(['Date', 'Day', 'Status', 'Check In', 'Check Out', 'Hours', 'Leave Type']);
      for (const d of (emp.days ?? [])) {
        if (d.status === 'future') continue;
        rows.push([d.date, d.day, d.status, d.check_in ?? '', d.check_out ?? '', d.hours != null ? d.hours.toFixed(1) : '', d.leave_type ?? '']);
      }
    } else {
      rows.push([`Monthly Attendance Report — All Employees`]);
      rows.push([`Period: ${period}`, `Generated: ${generated}`, `Total Employees: ${dlData.length}`]);
      rows.push([]);
      rows.push(['Employee', 'Employee ID', 'Department', 'Present', 'Late', 'Absent', 'Leave', 'Field Days', 'Holiday', 'Off', 'Office Hrs', 'Field Hrs', 'Total Hours', 'Std Hours', 'Variance', 'Completion %']);
      const sorted = [...dlData].sort((a, b) => a.department.localeCompare(b.department) || a.employee_name.localeCompare(b.employee_name));
      for (const emp of sorted) {
        rows.push([
          emp.employee_name, emp.employee_id, emp.department,
          String(emp.present), String(emp.late), String(emp.absent),
          String(emp.leave), String(emp.field), String(emp.holiday), String(emp.off),
          emp.office_hours.toFixed(1), emp.field_hours.toFixed(1),
          emp.total_hours_worked.toFixed(1), emp.standard_hours.toFixed(1),
          (emp.variance_hours >= 0 ? '+' : '') + emp.variance_hours.toFixed(1),
          `${emp.completion_pct.toFixed(0)}%`,
        ]);
      }
    }
    const suffix = isSingle ? dlData[0].employee_id : 'All';
    exportCsv(rows, `Attendance_${suffix}_${dlMonth}.csv`);
  };

  useEffect(() => { if (activeTab === 'late') fetchLate(); }, [activeTab, fetchLate]);
  useEffect(() => { if (activeTab === 'hours') fetchHours(); }, [activeTab, fetchHours]);
  useEffect(() => { if (activeTab === 'absent') fetchAbsence(); }, [activeTab, fetchAbsence]);

  // ---- Export handlers ----
  const exportLate = () => {
    const rows: string[][] = [
      ['Employee', 'Employee ID', 'Department', 'Date', 'Day', 'Scheduled Start', 'Check-In', 'Minutes Late', 'Status'],
      ...lateData.map(r => [
        r.employee_name, r.employee_id, r.department, r.date,
        r.day_of_week, r.scheduled_start, fmtTime(r.actual_check_in),
        String(r.minutes_late), r.status === 'very_late' ? 'Very Late' : 'Late',
      ]),
    ];
    exportCsv(rows, `late-report-${lateStart}-${lateEnd}.csv`);
  };

  const exportHours = () => {
    const rows: string[][] = [
      ['Employee', 'Employee ID', 'Department', 'Office Days', 'Late', 'OOO Days', 'Office Hrs', 'Field Hrs', 'Total Worked', 'Std Hours', 'Variance', 'Completion %'],
      ...hoursData.map(r => [
        r.employee_name, r.employee_id, r.department,
        String(r.days_present), String(r.days_late), String(r.days_field),
        r.office_hours.toFixed(1), r.field_hours.toFixed(1),
        r.total_hours_worked.toFixed(1), r.standard_hours.toFixed(1),
        (r.variance_hours >= 0 ? '+' : '') + r.variance_hours.toFixed(1),
        `${r.completion_pct.toFixed(0)}%`,
      ]),
    ];
    exportCsv(rows, `hours-report-${hoursMonth}.csv`);
  };

  // =====================================================
  // Late Report computations
  // =====================================================

  const totalLateIncidents = lateData.length;
  const uniqueLateEmployees = new Set(lateData.map(r => r.user_id)).size;
  const avgMinutesLate = totalLateIncidents > 0
    ? Math.round(lateData.reduce((s, r) => s + r.minutes_late, 0) / totalLateIncidents)
    : 0;

  const lateFrequency = (() => {
    const freq = new Map<string, { name: string; count: number }>();
    for (const r of lateData) {
      const e = freq.get(r.user_id);
      if (e) e.count += 1;
      else freq.set(r.user_id, { name: r.employee_name, count: 1 });
    }
    return [...freq.values()].sort((a, b) => b.count - a.count);
  })();
  const mostFrequent = lateFrequency[0] ?? null;
  const topFrequency = lateFrequency.slice(0, 10);

  // =====================================================
  // Hours report computations
  // =====================================================

  const totalEmployeesHours = hoursData.length;
  const grandTotalWorked = hoursData.reduce((s, r) => s + r.total_hours_worked, 0);
  const grandTotalStandard = hoursData.reduce((s, r) => s + r.standard_hours, 0);
  const grandVariance = grandTotalWorked - grandTotalStandard;

  // Group hours data by department for subtotals
  const hoursByDept = (() => {
    const map = new Map<string, AttendanceHoursRecord[]>();
    for (const r of hoursData) {
      const arr = map.get(r.department) ?? [];
      arr.push(r);
      map.set(r.department, arr);
    }
    return map;
  })();

  // =====================================================
  // Absence report computations
  // =====================================================

  const absenceWorkingDays = absenceData[0]?.days.filter(
    d => d.status !== 'future'
  ).length ?? 0;

  // =====================================================
  // Render
  // =====================================================

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-container">
          <div className="admin-header">
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
              Attendance Reports
            </h1>
          </div>

          {/* Tab navigation */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '2px solid #e5e7eb', paddingBottom: 0 }}>
            {(['late', 'hours', 'absent', 'download'] as ReportTab[]).map(tab => {
              const labels: Record<ReportTab, string> = {
                late: 'Late Arrivals', hours: 'Hours Worked', absent: 'Absent Days', download: 'Download Report',
              };
              const isDownload = tab === 'download';
              return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '0.6rem 1.25rem',
                  border: 'none',
                  background: isDownload && activeTab !== 'download' ? 'none' : 'none',
                  cursor: 'pointer',
                  fontWeight: activeTab === tab ? 700 : 400,
                  borderBottom: activeTab === tab
                    ? `3px solid ${isDownload ? '#0e7490' : '#2563eb'}`
                    : '3px solid transparent',
                  color: activeTab === tab
                    ? (isDownload ? '#0e7490' : '#2563eb')
                    : '#6b7280',
                  marginBottom: '-2px',
                  fontSize: '0.95rem',
                  transition: 'color 0.15s',
                }}
              >
                {labels[tab]}
              </button>
              );
            })}
          </div>

          {/* ===== TAB 1: LATE ARRIVALS ===== */}
          {activeTab === 'late' && (
            <div>
              {/* Filters */}
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-body">
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#6b7280' }}>From</label>
                      <input
                        type="date"
                        className="form-control"
                        value={lateStart}
                        onChange={e => setLateStart(e.target.value)}
                        style={{ width: '150px' }}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#6b7280' }}>To</label>
                      <input
                        type="date"
                        className="form-control"
                        value={lateEnd}
                        onChange={e => setLateEnd(e.target.value)}
                        style={{ width: '150px' }}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#6b7280' }}>Department</label>
                      <select className="form-control" value={lateDept} onChange={e => setLateDept(e.target.value)} style={{ width: '180px' }}>
                        <option value="">All Departments</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#6b7280' }}>Employee</label>
                      <select className="form-control" value={lateUserId} onChange={e => setLateUserId(e.target.value)} style={{ width: '200px' }}>
                        <option value="">All Employees</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </div>
                    <button className="btn btn-primary" onClick={fetchLate} disabled={lateLoading}>
                      {lateLoading ? 'Loading...' : 'Apply'}
                    </button>
                    <button className="btn btn-primary" onClick={exportLate} disabled={lateData.length === 0} style={{ marginLeft: 'auto' }}>
                      Export CSV
                    </button>
                  </div>
                </div>
              </div>

              {lateError && <div className="alert" style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>{lateError}</div>}

              {lateLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
                  Loading late arrivals report...
                </div>
              ) : (
                <>
                  {/* Summary cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    <SummaryCard label="Total Late Incidents" value={String(totalLateIncidents)} color="#ef4444" />
                    <SummaryCard label="Employees with Lateness" value={String(uniqueLateEmployees)} color="#f97316" />
                    <SummaryCard label="Avg Minutes Late" value={`${avgMinutesLate} min`} color="#eab308" />
                    <SummaryCard
                      label="Most Frequent"
                      value={mostFrequent ? `${mostFrequent.name.split(' ')[0]} (${mostFrequent.count}x)` : '—'}
                      color="#8b5cf6"
                    />
                  </div>

                  {lateData.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                      No late arrivals found for the selected period.
                    </div>
                  ) : (
                    <>
                      {/* Main table */}
                      <div className="card" style={{ marginBottom: '1.5rem', overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                              {['Employee', 'Dept', 'Date', 'Day', 'Sched. Start', 'Check-In', 'Late By', 'Status'].map(h => (
                                <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {lateData.map((r, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '0.65rem 1rem', fontWeight: 500 }}>{r.employee_name}</td>
                                <td style={{ padding: '0.65rem 1rem', color: '#6b7280' }}>{r.department}</td>
                                <td style={{ padding: '0.65rem 1rem' }}>{fmtDate(r.date)}</td>
                                <td style={{ padding: '0.65rem 1rem', color: '#6b7280' }}>{r.day_of_week}</td>
                                <td style={{ padding: '0.65rem 1rem' }}>{r.scheduled_start}</td>
                                <td style={{ padding: '0.65rem 1rem' }}>{fmtTime(r.actual_check_in)}</td>
                                <td style={{ padding: '0.65rem 1rem', fontWeight: 600, color: r.status === 'very_late' ? '#dc2626' : '#d97706' }}>
                                  {r.minutes_late} min
                                </td>
                                <td style={{ padding: '0.65rem 1rem' }}>
                                  <span style={{
                                    padding: '0.2rem 0.6rem',
                                    borderRadius: '9999px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    background: r.status === 'very_late' ? '#fee2e2' : '#fef3c7',
                                    color: r.status === 'very_late' ? '#991b1b' : '#92400e',
                                  }}>
                                    {r.status === 'very_late' ? 'Very Late' : 'Late'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Frequency analysis */}
                      {topFrequency.length > 0 && (
                        <div className="card">
                          <div className="card-body">
                            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>Frequency Analysis (Top 10)</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {topFrequency.map((e, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                  <span style={{ width: '160px', fontSize: '0.875rem', fontWeight: 500 }}>{e.name}</span>
                                  <div style={{ flex: 1, height: '16px', background: '#f1f5f9', borderRadius: '8px', overflow: 'hidden' }}>
                                    <div style={{
                                      width: `${(e.count / (topFrequency[0]?.count || 1)) * 100}%`,
                                      height: '100%',
                                      background: '#ef4444',
                                      borderRadius: '8px',
                                      transition: 'width 0.3s ease',
                                    }} />
                                  </div>
                                  <span style={{ width: '40px', textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
                                    {e.count}x
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* ===== TAB 2: HOURS WORKED ===== */}
          {activeTab === 'hours' && (
            <div>
              {/* Filters */}
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-body">
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#6b7280' }}>Month</label>
                      <input
                        type="month"
                        className="form-control"
                        value={hoursMonth}
                        onChange={e => setHoursMonth(e.target.value)}
                        style={{ width: '160px' }}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#6b7280' }}>Department</label>
                      <select className="form-control" value={hoursDept} onChange={e => { setHoursDept(e.target.value); setHoursEmployee(''); }} style={{ width: '180px' }}>
                        <option value="">All Departments</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#6b7280' }}>Employee</label>
                      <select className="form-control" value={hoursEmployee} onChange={e => setHoursEmployee(e.target.value)} style={{ width: '210px' }}>
                        <option value="">All Employees</option>
                        {employees
                          .map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </div>
                    <button className="btn btn-primary" onClick={fetchHours} disabled={hoursLoading}>
                      {hoursLoading ? 'Loading...' : 'Apply'}
                    </button>
                    <button className="btn btn-primary" onClick={exportHours} disabled={hoursData.length === 0} style={{ marginLeft: 'auto' }}>
                      Export CSV
                    </button>
                  </div>
                </div>
              </div>

              {hoursError && <div className="alert" style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>{hoursError}</div>}

              {hoursLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
                  Loading hours worked report...
                </div>
              ) : (
                <>
                  {/* ── Single-employee breakdown panel ── */}
                  {hoursEmployee && hoursData.length === 1 && (() => {
                    const r = hoursData[0];
                    const pct = r.completion_pct;
                    const barColor = pct >= 95 ? '#22c55e' : pct >= 75 ? '#f59e0b' : '#ef4444';
                    return (
                      <div className="card" style={{ marginBottom: '1.5rem', border: '1px solid #bfdbfe', borderTop: '3px solid #2563eb' }}>
                        <div className="card-body">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
                            <div>
                              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e3a5f' }}>{r.employee_name}</h2>
                              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{r.employee_id} · {r.department}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ width: '120px', height: '10px', background: '#e5e7eb', borderRadius: '5px', overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor, borderRadius: '5px', transition: 'width 0.4s' }} />
                              </div>
                              <span style={{ fontWeight: 700, color: barColor, fontSize: '1rem' }}>{pct.toFixed(1)}%</span>
                            </div>
                          </div>

                          {/* Stat boxes */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
                            {[
                              { label: 'Office Days',    value: String(r.days_present),                      bg: '#eff6ff', color: '#1d4ed8' },
                              { label: 'Late Arrivals',  value: String(r.days_late),                         bg: '#fffbeb', color: '#b45309' },
                              { label: 'OOO / Field',    value: String(r.days_field),                        bg: '#f0fdfa', color: '#0f766e' },
                              { label: 'Office Hours',   value: `${r.office_hours.toFixed(1)}h`,             bg: '#eff6ff', color: '#1d4ed8' },
                              { label: 'Field Hours',    value: `${r.field_hours.toFixed(1)}h`,              bg: '#f0fdfa', color: '#0f766e' },
                              { label: 'Total Worked',   value: `${r.total_hours_worked.toFixed(1)}h`,       bg: '#f0fdf4', color: '#15803d' },
                              { label: 'Should Work',    value: `${r.standard_hours.toFixed(1)}h`,           bg: '#f9fafb', color: '#374151' },
                              { label: 'Variance',       value: `${r.variance_hours >= 0 ? '+' : ''}${r.variance_hours.toFixed(1)}h`, bg: r.variance_hours >= 0 ? '#f0fdf4' : '#fef2f2', color: r.variance_hours >= 0 ? '#15803d' : '#b91c1c' },
                            ].map(s => (
                              <div key={s.label} style={{ background: s.bg, borderRadius: '8px', padding: '0.75rem 1rem', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                                <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '0.2rem' }}>{s.label}</div>
                              </div>
                            ))}
                          </div>

                          {/* Hours breakdown bar */}
                          {r.total_hours_worked > 0 && (
                            <div style={{ marginTop: '1.25rem' }}>
                              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.4rem', fontWeight: 500 }}>Hours breakdown</div>
                              <div style={{ display: 'flex', height: '20px', borderRadius: '6px', overflow: 'hidden', background: '#f1f5f9' }}>
                                {r.office_hours > 0 && (
                                  <div
                                    title={`Office: ${r.office_hours.toFixed(1)}h`}
                                    style={{ width: `${(r.office_hours / r.standard_hours) * 100}%`, background: '#3b82f6', maxWidth: '100%' }}
                                  />
                                )}
                                {r.field_hours > 0 && (
                                  <div
                                    title={`OOO/Field: ${r.field_hours.toFixed(1)}h`}
                                    style={{ width: `${(r.field_hours / r.standard_hours) * 100}%`, background: '#14b8a6', maxWidth: '100%' }}
                                  />
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.35rem', fontSize: '0.75rem', color: '#6b7280' }}>
                                <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#3b82f6', marginRight: 4 }} />Office {r.office_hours.toFixed(1)}h</span>
                                <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#14b8a6', marginRight: 4 }} />OOO/Field {r.field_hours.toFixed(1)}h</span>
                                <span style={{ marginLeft: 'auto' }}>Standard: {r.standard_hours.toFixed(1)}h</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Summary cards (all-employees view) */}
                  {!hoursEmployee && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                      <SummaryCard label="Employees" value={String(totalEmployeesHours)} color="#3b82f6" />
                      <SummaryCard label="Office Hours" value={`${hoursData.reduce((s, r) => s + r.office_hours, 0).toFixed(1)}h`} color="#2563eb" />
                      <SummaryCard label="Field/OOO Hours" value={`${hoursData.reduce((s, r) => s + r.field_hours, 0).toFixed(1)}h`} color="#0f766e" />
                      <SummaryCard label="Total Worked" value={`${grandTotalWorked.toFixed(1)}h`} color="#22c55e" />
                      <SummaryCard label="Should Work" value={`${grandTotalStandard.toFixed(1)}h`} color="#6b7280" />
                      <SummaryCard
                        label="Variance"
                        value={`${grandVariance >= 0 ? '+' : ''}${grandVariance.toFixed(1)}h`}
                        color={grandVariance >= 0 ? '#22c55e' : '#ef4444'}
                      />
                    </div>
                  )}

                  {hoursData.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                      No hours data found for the selected period.
                    </div>
                  ) : (
                    <div className="card" style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                            {['Employee', 'Dept', 'Office Days', 'Late', 'OOO Days', 'Office Hrs', 'Field Hrs', 'Total Worked', 'Should Work', 'Variance', 'Completion'].map(h => (
                              <th key={h} style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...hoursByDept.entries()].map(([dept, rows]) => {
                            const deptWorked = rows.reduce((s, r) => s + r.total_hours_worked, 0);
                            const deptStd    = rows.reduce((s, r) => s + r.standard_hours, 0);
                            const deptVar    = deptWorked - deptStd;
                            return [
                              !hoursEmployee && (
                                <tr key={`dept-${dept}`} style={{ background: '#f8fafc' }}>
                                  <td colSpan={11} style={{ padding: '0.45rem 0.85rem', fontWeight: 700, color: '#374151', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {dept} — {rows.length} employee{rows.length !== 1 ? 's' : ''} &nbsp;|&nbsp;
                                    {deptWorked.toFixed(1)}h worked / {deptStd.toFixed(1)}h standard &nbsp;
                                    <span style={{ color: deptVar >= 0 ? '#22c55e' : '#ef4444' }}>
                                      ({deptVar >= 0 ? '+' : ''}{deptVar.toFixed(1)}h)
                                    </span>
                                  </td>
                                </tr>
                              ),
                              ...rows.map((r, i) => {
                                const pct = r.completion_pct;
                                const barColor = pct >= 95 ? '#22c55e' : pct >= 75 ? '#f59e0b' : '#ef4444';
                                return (
                                  <tr key={`row-${r.user_id}-${i}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '0.6rem 0.85rem', fontWeight: 500 }}>{r.employee_name}</td>
                                    <td style={{ padding: '0.6rem 0.85rem', color: '#6b7280', fontSize: '0.8rem' }}>{r.department}</td>
                                    <td style={{ padding: '0.6rem 0.85rem' }}>{r.days_present}</td>
                                    <td style={{ padding: '0.6rem 0.85rem', color: r.days_late > 0 ? '#d97706' : '#374151' }}>{r.days_late}</td>
                                    <td style={{ padding: '0.6rem 0.85rem' }}>
                                      {r.days_field > 0
                                        ? <span style={{ background: '#f0fdfa', color: '#0f766e', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 600 }}>{r.days_field}</span>
                                        : <span style={{ color: '#d1d5db' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '0.6rem 0.85rem', color: '#2563eb' }}>{r.office_hours.toFixed(1)}h</td>
                                    <td style={{ padding: '0.6rem 0.85rem', color: r.field_hours > 0 ? '#0f766e' : '#d1d5db' }}>
                                      {r.field_hours > 0 ? `${r.field_hours.toFixed(1)}h` : '—'}
                                    </td>
                                    <td style={{ padding: '0.6rem 0.85rem', fontWeight: 600 }}>{r.total_hours_worked.toFixed(1)}h</td>
                                    <td style={{ padding: '0.6rem 0.85rem', color: '#6b7280' }}>{r.standard_hours.toFixed(1)}h</td>
                                    <td style={{ padding: '0.6rem 0.85rem', fontWeight: 600, color: r.variance_hours >= 0 ? '#22c55e' : '#ef4444' }}>
                                      {r.variance_hours >= 0 ? '+' : ''}{r.variance_hours.toFixed(1)}h
                                    </td>
                                    <td style={{ padding: '0.6rem 0.85rem', minWidth: '110px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <div style={{ flex: 1, height: '7px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                                          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor, borderRadius: '4px' }} />
                                        </div>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: barColor, whiteSpace: 'nowrap' }}>{pct.toFixed(0)}%</span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              }),
                            ];
                          })}
                          {/* Grand total (only in all-employees view) */}
                          {!hoursEmployee && (
                            <tr style={{ background: '#f0fdf4', borderTop: '2px solid #e5e7eb', fontWeight: 700 }}>
                              <td style={{ padding: '0.75rem 0.85rem' }}>Grand Total</td>
                              <td style={{ padding: '0.75rem 0.85rem', color: '#6b7280', fontSize: '0.8rem' }}>{totalEmployeesHours} employees</td>
                              <td colSpan={2} style={{ padding: '0.75rem 0.85rem' }} />
                              <td style={{ padding: '0.75rem 0.85rem' }} />
                              <td style={{ padding: '0.75rem 0.85rem', color: '#2563eb' }}>{hoursData.reduce((s, r) => s + r.office_hours, 0).toFixed(1)}h</td>
                              <td style={{ padding: '0.75rem 0.85rem', color: '#0f766e' }}>{hoursData.reduce((s, r) => s + r.field_hours, 0).toFixed(1)}h</td>
                              <td style={{ padding: '0.75rem 0.85rem' }}>{grandTotalWorked.toFixed(1)}h</td>
                              <td style={{ padding: '0.75rem 0.85rem', color: '#6b7280' }}>{grandTotalStandard.toFixed(1)}h</td>
                              <td style={{ padding: '0.75rem 0.85rem', color: grandVariance >= 0 ? '#22c55e' : '#ef4444' }}>
                                {grandVariance >= 0 ? '+' : ''}{grandVariance.toFixed(1)}h
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem', color: '#6b7280' }}>
                                {grandTotalStandard > 0 ? `${((grandTotalWorked / grandTotalStandard) * 100).toFixed(1)}% overall` : '—'}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ===== TAB 3: ABSENT DAYS ===== */}
          {activeTab === 'absent' && (
            <div>
              {/* Filters */}
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-body">
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#6b7280' }}>Month</label>
                      <input
                        type="month"
                        className="form-control"
                        value={absenceMonth}
                        onChange={e => setAbsenceMonth(e.target.value)}
                        style={{ width: '160px' }}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#6b7280' }}>Department</label>
                      <select className="form-control" value={absenceDept} onChange={e => setAbsenceDept(e.target.value)} style={{ width: '200px' }}>
                        <option value="">All Departments</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <button className="btn btn-primary" onClick={fetchAbsence} disabled={absenceLoading}>
                      {absenceLoading ? 'Loading...' : 'Apply'}
                    </button>
                  </div>
                </div>
              </div>

              {absenceError && <div className="alert" style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>{absenceError}</div>}

              {absenceLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
                  Loading absence calendar...
                </div>
              ) : absenceData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                  No data found for the selected period.
                </div>
              ) : (
                <>
                  <div className="card" style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                          <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#374151', minWidth: '150px', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1 }}>
                            Employee
                          </th>
                          {absenceData[0].days.map(d => (
                            <th key={d.date} style={{
                              padding: '0.35rem 0.2rem',
                              textAlign: 'center',
                              fontWeight: 500,
                              color: '#6b7280',
                              minWidth: '30px',
                              lineHeight: 1.2,
                            }}>
                              <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{d.day}</div>
                              <div>{d.date.split('-')[2]}</div>
                            </th>
                          ))}
                          <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontWeight: 600, color: '#374151', minWidth: '240px', whiteSpace: 'nowrap' }}>
                            P / L / A / LV / F / H / O
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {absenceData.map((emp, ei) => (
                          <tr key={emp.user_id} style={{ borderBottom: '1px solid #f1f5f9', background: ei % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ padding: '0.4rem 0.75rem', fontWeight: 500, position: 'sticky', left: 0, background: ei % 2 === 0 ? '#fff' : '#fafafa', zIndex: 1, whiteSpace: 'nowrap' }}>
                              <div>{emp.employee_name}</div>
                              <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{emp.department}</div>
                            </td>
                            {emp.days.map(d => {
                              const s = STATUS_STYLES[d.status] ?? STATUS_STYLES.no_schedule;
                              return (
                                <td key={d.date} style={{ padding: '0.2rem', textAlign: 'center' }}>
                                  <div
                                    title={`${d.date}: ${d.status}${d.check_in ? ` | In: ${fmtTime(d.check_in)}` : ''}${d.leave_type ? ` | ${d.leave_type}` : ''}`}
                                    style={{
                                      width: '26px',
                                      height: '22px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      borderRadius: '3px',
                                      background: s.bg,
                                      color: s.color,
                                      fontWeight: 700,
                                      fontSize: '0.65rem',
                                      cursor: 'default',
                                    }}
                                  >
                                    {s.label}
                                  </div>
                                </td>
                              );
                            })}
                            <td style={{ padding: '0.4rem 0.75rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#166534' }}>{emp.summary.present}</span>
                              {' / '}
                              <span style={{ color: '#92400e' }}>{emp.summary.late}</span>
                              {' / '}
                              <span style={{ color: '#991b1b', fontWeight: emp.summary.absent > 0 ? 700 : 400 }}>{emp.summary.absent}</span>
                              {' / '}
                              <span style={{ color: '#1e40af' }}>{emp.summary.leave}</span>
                              {' / '}
                              <span style={{ color: '#065f46' }}>{emp.summary.field}</span>
                              {' / '}
                              <span style={{ color: '#334155' }}>{emp.summary.holiday}</span>
                              {' / '}
                              <span style={{ color: '#64748b' }}>{emp.summary.off}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#f8fafc', borderTop: '2px solid #e5e7eb' }}>
                          <td style={{ padding: '0.5rem 0.75rem', fontWeight: 700, position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1 }}>
                            Working days: {absenceWorkingDays}
                          </td>
                          {absenceData[0].days.map(d => (
                            <td key={d.date} style={{ padding: '0.2rem', textAlign: 'center', fontSize: '0.65rem', color: '#9ca3af' }}>
                              {absenceData.filter(e => {
                                const ds = e.days.find(x => x.date === d.date);
                                return ds?.status === 'absent';
                              }).length || ''}
                            </td>
                          ))}
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Legend */}
                  <div className="card">
                    <div className="card-body" style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.8rem' }}>
                        <span style={{ fontWeight: 600, color: '#374151' }}>Legend:</span>
                        {Object.entries(STATUS_STYLES).filter(([k]) => k !== 'future').map(([key, s]) => (
                          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ display: 'inline-block', width: '20px', height: '16px', background: s.bg, color: s.color, border: '1px solid #e5e7eb', borderRadius: '3px', textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, lineHeight: '16px' }}>{s.label}</span>
                            <span style={{ color: '#6b7280', textTransform: 'capitalize' }}>{key.replace('_', ' ')}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {/* ===== TAB 4: DOWNLOAD REPORT ===== */}
          {activeTab === 'download' && (
            <div>
              {/* Filter card */}
              <div className="card" style={{ marginBottom: '1.25rem' }}>
                <div className="card-body">
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>

                    {/* Month picker */}
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#6b7280' }}>Period (Month)</label>
                      <input
                        type="month"
                        className="form-control"
                        value={dlMonth}
                        onChange={e => { setDlMonth(e.target.value); setDlData(null); }}
                        style={{ width: '160px' }}
                      />
                    </div>

                    {/* Scope selector */}
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#6b7280' }}>Scope</label>
                      <select
                        className="form-control"
                        value={dlScope}
                        onChange={e => { setDlScope(e.target.value as ReportScope); setDlEmployee(''); setDlData(null); }}
                        style={{ width: '170px' }}
                      >
                        <option value="all">All Employees</option>
                        <option value="employee">Specific Employee</option>
                      </select>
                    </div>

                    {/* Employee selector (scope = employee) */}
                    {dlScope === 'employee' && (
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#6b7280' }}>Employee</label>
                        <select
                          className="form-control"
                          value={dlEmployee}
                          onChange={e => { setDlEmployee(e.target.value); setDlData(null); }}
                          style={{ width: '220px' }}
                        >
                          <option value="">— Select employee —</option>
                          {employees.map(e => (
                            <option key={e.id} value={e.id}>{e.name} ({e.employee_id})</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Department filter (scope = all) */}
                    {dlScope === 'all' && (
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#6b7280' }}>Department</label>
                        <select
                          className="form-control"
                          value={dlDept}
                          onChange={e => { setDlDept(e.target.value); setDlData(null); }}
                          style={{ width: '200px' }}
                        >
                          <option value="">All Departments</option>
                          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </div>
                    )}

                    <button
                      className="btn btn-primary"
                      style={{ background: '#0e7490', borderColor: '#0e7490' }}
                      onClick={generateDownloadReport}
                      disabled={dlLoading || (dlScope === 'employee' && !dlEmployee)}
                    >
                      {dlLoading ? 'Loading…' : 'Generate Preview'}
                    </button>
                  </div>
                </div>
              </div>

              {dlError && (
                <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                  {dlError}
                </div>
              )}

              {/* Preview + download actions */}
              {dlData && !dlLoading && (
                <>
                  {dlData.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                      No attendance data found for the selected period.
                    </div>
                  ) : (
                    <>
                      {/* Preview summary */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                        {(() => {
                          const tot = dlData.reduce((acc, e) => ({
                            p: acc.p + e.present, l: acc.l + e.late, a: acc.a + e.absent,
                            lv: acc.lv + e.leave, f: acc.f + e.field, hrs: acc.hrs + e.total_hours_worked,
                          }), { p: 0, l: 0, a: 0, lv: 0, f: 0, hrs: 0 });
                          const cards = [
                            { label: 'Employees', value: String(dlData.length), color: '#0e7490' },
                            { label: 'Present Days', value: String(tot.p), color: '#15803d' },
                            { label: 'Late Days', value: String(tot.l), color: '#b45309' },
                            { label: 'Absent Days', value: String(tot.a), color: '#b91c1c' },
                            { label: 'Leave Days', value: String(tot.lv), color: '#1d4ed8' },
                            { label: 'Hours Worked', value: `${tot.hrs.toFixed(0)}h`, color: '#6d28d9' },
                          ];
                          return cards.map(c => (
                            <SummaryCard key={c.label} label={c.label} value={c.value} color={c.color} />
                          ));
                        })()}
                      </div>

                      {/* Preview table (compact) */}
                      <div className="card" style={{ marginBottom: '1.25rem', overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                              {['Employee', 'EMP ID', 'Department', 'P', 'L', 'A', 'LV', 'F', 'H', 'O', 'Hours', '%'].map(h => (
                                <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[...dlData]
                              .sort((a, b) => a.department.localeCompare(b.department) || a.employee_name.localeCompare(b.employee_name))
                              .map((emp, i) => (
                                <tr key={emp.user_id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{emp.employee_name}</td>
                                  <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280', fontFamily: 'monospace', fontSize: '0.78rem' }}>{emp.employee_id}</td>
                                  <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280' }}>{emp.department}</td>
                                  <td style={{ padding: '0.5rem 0.75rem', color: '#15803d', fontWeight: emp.present > 0 ? 600 : 400 }}>{emp.present}</td>
                                  <td style={{ padding: '0.5rem 0.75rem', color: '#b45309' }}>{emp.late}</td>
                                  <td style={{ padding: '0.5rem 0.75rem', color: emp.absent > 0 ? '#b91c1c' : '#374151', fontWeight: emp.absent > 0 ? 700 : 400 }}>{emp.absent}</td>
                                  <td style={{ padding: '0.5rem 0.75rem', color: '#1d4ed8' }}>{emp.leave}</td>
                                  <td style={{ padding: '0.5rem 0.75rem', color: '#065f46' }}>{emp.field}</td>
                                  <td style={{ padding: '0.5rem 0.75rem', color: '#475569' }}>{emp.holiday}</td>
                                  <td style={{ padding: '0.5rem 0.75rem', color: '#64748b' }}>{emp.off}</td>
                                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{emp.total_hours_worked.toFixed(1)}h</td>
                                  <td style={{ padding: '0.5rem 0.75rem', color: emp.completion_pct >= 95 ? '#15803d' : emp.completion_pct >= 80 ? '#b45309' : '#b91c1c', fontWeight: 600 }}>
                                    {emp.completion_pct.toFixed(0)}%
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Download buttons */}
                      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-primary"
                          style={{ background: '#dc2626', borderColor: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                          onClick={() => {
                            const [y, m] = dlMonth.split('-').map(Number);
                            generateMonthlyAttendancePDF({
                              year: y, month: m,
                              employees: dlData,
                              isSingleEmployee: dlScope === 'employee' && dlData.length === 1,
                            });
                          }}
                        >
                          ⬇ Download PDF
                        </button>
                        <button
                          className="btn btn-primary"
                          style={{ background: '#15803d', borderColor: '#15803d', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                          onClick={exportDownloadCsv}
                        >
                          ⬇ Download CSV
                        </button>
                        <span style={{ alignSelf: 'center', fontSize: '0.8rem', color: '#6b7280' }}>
                          {dlScope === 'employee' && dlData.length === 1
                            ? `Portrait PDF with daily breakdown for ${dlData[0].employee_name}`
                            : `Landscape PDF with all ${dlData.length} employees, grouped by department`}
                        </span>
                      </div>
                    </>
                  )}
                </>
              )}

              {!dlData && !dlLoading && (
                <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#9ca3af', background: '#f9fafb', borderRadius: '12px', border: '2px dashed #e5e7eb' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📄</div>
                  <div style={{ fontWeight: 600, color: '#6b7280', marginBottom: '0.35rem' }}>Select a period and click Generate Preview</div>
                  <div style={{ fontSize: '0.85rem' }}>You can then download as PDF or CSV</div>
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

// =====================================================
// SummaryCard sub-component
// =====================================================

interface SummaryCardProps {
  label: string;
  value: string;
  color: string;
}

function SummaryCard({ label, value, color }: SummaryCardProps) {
  return (
    <div className="card" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="card-body" style={{ padding: '1rem' }}>
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>{value}</div>
      </div>
    </div>
  );
}

export default AttendanceReports;
