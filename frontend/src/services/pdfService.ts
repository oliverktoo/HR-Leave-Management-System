import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { LeaveRequest, UserProfile } from '../types';

/**
 * PDF Export Service
 * Generates PDF documents for leave certificates and reports
 */

interface LeaveReportFilters {
  year?: number;
  department?: string;
  leaveType?: string;
  status?: string;
}

interface LeaveReportSummary {
  totalRequests?: number;
  totalDays?: number;
  approvedRequests?: number;
  pendingRequests?: number;
}

interface DepartmentSummaryData {
  department_name: string;
  total_employees?: number;
  total_requests?: number;
  total_days?: number;
  approved_requests?: number;
  pending_requests?: number;
  average_days?: number;
}

interface LeaveBalanceData {
  employee_id?: string;
  user?: {
    first_name?: string;
    last_name?: string;
  };
  department?: {
    name?: string;
  };
  leave_type?: {
    name?: string;
  };
  allocated_days?: number;
  used_days?: number;
  pending_days?: number;
  carryforward_days?: number;
}

/**
 * Generate Leave Certificate PDF
 */
export const generateLeaveCertificate = (leaveRequest: LeaveRequest, userProfile: UserProfile): void => {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('LEAVE CERTIFICATE', 105, 20, { align: 'center' });
  
  // Company/Organization details
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Football Kenya Federation', 105, 30, { align: 'center' });
  doc.text('Human Resources Department', 105, 36, { align: 'center' });
  
  // Line separator
  doc.setLineWidth(0.5);
  doc.line(20, 42, 190, 42);
  
  // Certificate number and date
  doc.setFontSize(9);
  doc.text(`Certificate No: LC-${leaveRequest.id.substring(0, 8).toUpperCase()}`, 20, 50);
  doc.text(`Issue Date: ${new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' })}`, 140, 50);
  
  // Main content
  doc.setFontSize(11);
  const startY = 65;
  
  doc.text('To Whom It May Concern,', 20, startY);
  
  // Resolve department name — may come from joined users_profile.department or direct department join
  const deptName = (leaveRequest as any).users_profile?.department?.name
    || leaveRequest.department?.name
    || userProfile.department?.name
    || 'N/A';

  const bodyText = `This is to certify that ${userProfile.first_name} ${userProfile.last_name}, ` +
    `Employee ID: ${userProfile.employee_id}, Department: ${deptName}, ` +
    `has been granted ${leaveRequest.leave_types?.name || 'leave'} from ` +
    `${new Date(leaveRequest.start_date).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' })} to ` +
    `${new Date(leaveRequest.end_date).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' })}, totaling ` +
    `${leaveRequest.total_days} working day(s).`;
  
  doc.setFont('helvetica', 'normal');
  const splitText = doc.splitTextToSize(bodyText, 170);
  doc.text(splitText, 20, startY + 10);
  
  // Leave details table
  const tableY = startY + 10 + (splitText.length * 6) + 10;
  
  autoTable(doc, {
    startY: tableY,
    head: [['Leave Details', 'Information']],
    body: [
      ['Employee Name', `${userProfile.first_name} ${userProfile.last_name}`],
      ['Employee ID', userProfile.employee_id || 'N/A'],
      ['Department', deptName],
      ['Leave Type', leaveRequest.leave_types?.name || 'N/A'],
      ['Start Date', new Date(leaveRequest.start_date).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' })],
      ['End Date', new Date(leaveRequest.end_date).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' })],
      ['Total Days', leaveRequest.total_days.toString()],
      ['Cover Person', leaveRequest.cover_person || 'N/A'],
      ['Status', leaveRequest.status.toUpperCase()],
      ['Approved By', leaveRequest.hr_approver
        ? `${leaveRequest.hr_approver.first_name} ${leaveRequest.hr_approver.last_name}`
        : leaveRequest.reviewed_by_user
          ? `${leaveRequest.reviewed_by_user.first_name} ${leaveRequest.reviewed_by_user.last_name}`
          : 'N/A'],
      ['Approval Date', leaveRequest.hr_approved_at
        ? new Date(leaveRequest.hr_approved_at).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' })
        : leaveRequest.reviewed_at
          ? new Date(leaveRequest.reviewed_at).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' })
          : 'N/A']
    ],
    theme: 'striped',
    headStyles: { fillColor: [0, 107, 63] },   // FKF green
    margin: { left: 20, right: 20 }
  });

  // Footer
  const footerY = (doc as any).lastAutoTable.finalY + 20;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.text('This is a system-generated certificate and does not require a signature.', 105, footerY, { align: 'center' });
  doc.text('For verification, please contact the HR Department.', 105, footerY + 6, { align: 'center' });
  
  // Page number
  doc.setFontSize(8);
  doc.text(`Page 1 of 1`, 105, 285, { align: 'center' });
  
  // Save PDF
  const fileName = `Leave_Certificate_${userProfile.employee_id}_${new Date().getTime()}.pdf`;
  doc.save(fileName);
};

/**
 * Generate Leave Report PDF
 */
export const generateLeaveReport = (
  leaveData: LeaveRequest[], 
  filters: LeaveReportFilters = {}, 
  summary: LeaveReportSummary = {}
): void => {
  const doc = new jsPDF('landscape');
  
  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('LEAVE MANAGEMENT REPORT', 148, 15, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Football Kenya Federation - HR Department', 148, 22, { align: 'center' });
  
  // Report generation date
  doc.setFontSize(9);
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' })} ${new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi' })}`, 148, 28, { align: 'center' });
  
  // Filters section
  let filterY = 38;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Report Filters:', 15, filterY);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  filterY += 6;
  
  if (filters.year) {
    doc.text(`Year: ${filters.year}`, 15, filterY);
    filterY += 5;
  }
  if (filters.department) {
    doc.text(`Department: ${filters.department}`, 15, filterY);
    filterY += 5;
  }
  if (filters.leaveType) {
    doc.text(`Leave Type: ${filters.leaveType}`, 15, filterY);
    filterY += 5;
  }
  if (filters.status) {
    doc.text(`Status: ${filters.status}`, 15, filterY);
    filterY += 5;
  }
  
  // Summary statistics
  if (summary && Object.keys(summary).length > 0) {
    filterY += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Summary Statistics:', 15, filterY);
    filterY += 6;
    
    doc.setFont('helvetica', 'normal');
    if (summary.totalRequests !== undefined) {
      doc.text(`Total Requests: ${summary.totalRequests}`, 15, filterY);
      filterY += 5;
    }
    if (summary.totalDays !== undefined) {
      doc.text(`Total Leave Days: ${summary.totalDays}`, 15, filterY);
      filterY += 5;
    }
    if (summary.approvedRequests !== undefined) {
      doc.text(`Approved: ${summary.approvedRequests}`, 15, filterY);
      filterY += 5;
    }
    if (summary.pendingRequests !== undefined) {
      doc.text(`Pending: ${summary.pendingRequests}`, 15, filterY);
      filterY += 5;
    }
  }
  
  // Prepare table data
  const tableData = leaveData.map(request => [
    request.users_profile?.employee_id || 'N/A',
    `${request.users_profile?.first_name || ''} ${request.users_profile?.last_name || ''}`.trim() || 'N/A',
    request.department?.name || 'N/A',
    request.leave_types?.name || 'N/A',
    new Date(request.start_date).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' }),
    new Date(request.end_date).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' }),
    request.total_days.toString(),
    request.status.charAt(0).toUpperCase() + request.status.slice(1)
  ]);
  
  // Leave requests table
  autoTable(doc, {
    startY: filterY + 5,
    head: [['Emp ID', 'Employee Name', 'Department', 'Leave Type', 'Start Date', 'End Date', 'Days', 'Status']],
    body: tableData,
    theme: 'grid',
    headStyles: { 
      fillColor: [41, 128, 185],
      fontSize: 9,
      fontStyle: 'bold'
    },
    bodyStyles: {
      fontSize: 8
    },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 45 },
      2: { cellWidth: 35 },
      3: { cellWidth: 30 },
      4: { cellWidth: 25 },
      5: { cellWidth: 25 },
      6: { cellWidth: 15 },
      7: { cellWidth: 25 }
    },
    margin: { left: 15, right: 15 }
  });
  
  // Footer
  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Page ${i} of ${pageCount}`, 148, 200, { align: 'center' });
    doc.text('Confidential - For Internal Use Only', 148, 205, { align: 'center' });
  }
  
  // Save PDF
  const fileName = `Leave_Report_${filters.year || 'All'}_${new Date().getTime()}.pdf`;
  doc.save(fileName);
};

/**
 * Generate Department Leave Summary PDF
 */
export const generateDepartmentSummary = (departmentData: DepartmentSummaryData[], year: number): void => {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('DEPARTMENT LEAVE SUMMARY', 105, 20, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Year: ${year}`, 105, 28, { align: 'center' });
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' })}`, 105, 34, { align: 'center' });
  
  // Prepare table data
  const tableData = departmentData.map(dept => [
    dept.department_name,
    dept.total_employees?.toString() || '0',
    dept.total_requests?.toString() || '0',
    dept.total_days?.toString() || '0',
    dept.approved_requests?.toString() || '0',
    dept.pending_requests?.toString() || '0',
    dept.average_days?.toFixed(1) || '0.0'
  ]);
  
  // Add totals row
  const totals = departmentData.reduce((acc, dept) => ({
    employees: acc.employees + (dept.total_employees || 0),
    requests: acc.requests + (dept.total_requests || 0),
    days: acc.days + (dept.total_days || 0),
    approved: acc.approved + (dept.approved_requests || 0),
    pending: acc.pending + (dept.pending_requests || 0)
  }), { employees: 0, requests: 0, days: 0, approved: 0, pending: 0 });
  
  const avgDays = totals.requests > 0 ? (totals.days / totals.requests).toFixed(1) : '0.0';
  
  tableData.push([
    'TOTAL',
    totals.employees.toString(),
    totals.requests.toString(),
    totals.days.toString(),
    totals.approved.toString(),
    totals.pending.toString(),
    avgDays
  ]);
  
  // Department summary table
  autoTable(doc, {
    startY: 45,
    head: [['Department', 'Employees', 'Requests', 'Total Days', 'Approved', 'Pending', 'Avg Days']],
    body: tableData,
    theme: 'striped',
    headStyles: { 
      fillColor: [41, 128, 185],
      fontSize: 10,
      fontStyle: 'bold'
    },
    bodyStyles: {
      fontSize: 9
    },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold' },
      1: { cellWidth: 25, halign: 'center' },
      2: { cellWidth: 25, halign: 'center' },
      3: { cellWidth: 25, halign: 'center' },
      4: { cellWidth: 25, halign: 'center' },
      5: { cellWidth: 25, halign: 'center' },
      6: { cellWidth: 20, halign: 'center' }
    },
    didParseCell: function (data) {
      // Highlight totals row
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fillColor = [52, 152, 219];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: 20, right: 20 }
  });
  
  // Footer
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text('Confidential - For Internal Use Only', 105, 280, { align: 'center' });
  doc.text(`Page 1 of 1`, 105, 285, { align: 'center' });
  
  // Save PDF
  const fileName = `Department_Leave_Summary_${year}_${new Date().getTime()}.pdf`;
  doc.save(fileName);
};

/**
 * Generate Leave Balance Report PDF
 */
export const generateLeaveBalanceReport = (balanceData: LeaveBalanceData[], year: number): void => {
  const doc = new jsPDF('landscape');
  
  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('LEAVE BALANCE REPORT', 148, 15, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Year: ${year}`, 148, 22, { align: 'center' });
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' })}`, 148, 28, { align: 'center' });
  
  // Prepare table data
  const tableData = balanceData.map(balance => {
    const allocated = balance.allocated_days || 0;
    const used = balance.used_days || 0;
    const pending = balance.pending_days || 0;
    const carryforward = balance.carryforward_days || 0;
    const available = allocated + carryforward - used - pending;
    
    return [
      balance.employee_id || 'N/A',
      `${balance.user?.first_name || ''} ${balance.user?.last_name || ''}`.trim() || 'N/A',
      balance.department?.name || 'N/A',
      balance.leave_type?.name || 'N/A',
      allocated.toString(),
      carryforward.toString(),
      used.toString(),
      pending.toString(),
      available.toString()
    ];
  });
  
  // Leave balance table
  autoTable(doc, {
    startY: 38,
    head: [['Emp ID', 'Employee', 'Department', 'Leave Type', 'Allocated', 'Carryforward', 'Used', 'Pending', 'Available']],
    body: tableData,
    theme: 'grid',
    headStyles: { 
      fillColor: [41, 128, 185],
      fontSize: 9,
      fontStyle: 'bold'
    },
    bodyStyles: {
      fontSize: 8
    },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 45 },
      2: { cellWidth: 35 },
      3: { cellWidth: 30 },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 25, halign: 'center' },
      6: { cellWidth: 20, halign: 'center' },
      7: { cellWidth: 20, halign: 'center' },
      8: { cellWidth: 23, halign: 'center' }
    },
    margin: { left: 15, right: 15 }
  });
  
  // Footer
  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Page ${i} of ${pageCount}`, 148, 200, { align: 'center' });
    doc.text('Confidential - For Internal Use Only', 148, 205, { align: 'center' });
  }
  
  // Save PDF
  const fileName = `Leave_Balance_Report_${year}_${new Date().getTime()}.pdf`;
  doc.save(fileName);
};

// ─── Monthly Attendance Report ────────────────────────────────────────────────

export interface MonthlyReportDay {
  date: string;
  day: string;
  status: string;
  check_in?: string;
  check_out?: string;
  hours?: number;
  leave_type?: string;
}

export interface MonthlyReportEmployee {
  user_id: string;
  employee_name: string;
  employee_id: string;
  department: string;
  present: number;
  late: number;
  absent: number;
  leave: number;
  field: number;
  holiday: number;
  off: number;
  office_hours: number;
  field_hours: number;
  total_hours_worked: number;
  standard_hours: number;
  variance_hours: number;
  completion_pct: number;
  days?: MonthlyReportDay[];
}

export interface MonthlyAttendancePDFOptions {
  year: number;
  month: number;
  employees: MonthlyReportEmployee[];
  isSingleEmployee: boolean;
}

const GREEN_RGB: [number, number, number] = [0, 107, 63];
const LIGHT_GREEN_RGB: [number, number, number] = [240, 253, 244];
const DEPT_HEADER_RGB: [number, number, number] = [21, 128, 61];

function fmtTimeEAT(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-KE', {
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Africa/Nairobi', hour12: false,
    });
  } catch { return iso; }
}

function dayStatusLabel(status: string): string {
  const map: Record<string, string> = {
    present: 'Present', late: 'Late', absent: 'Absent',
    leave: 'Leave', field: 'Field', holiday: 'Holiday',
    off: 'Day Off', no_schedule: '—', future: '—',
  };
  return map[status] ?? status;
}

export function generateMonthlyAttendancePDF(opts: MonthlyAttendancePDFOptions): void {
  const { year, month, employees, isSingleEmployee } = opts;
  const monthName = new Date(year, month - 1, 1)
    .toLocaleString('en-KE', { month: 'long', timeZone: 'Africa/Nairobi' });
  const periodLabel = `${monthName} ${year}`;
  const generatedDate = new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' });
  const padM = (n: number) => String(n).padStart(2, '0');

  // ── Single employee portrait ────────────────────────────────────────────────
  if (isSingleEmployee && employees.length === 1) {
    const emp = employees[0];
    const doc = new jsPDF('portrait', 'mm', 'a4');

    // Green header band
    doc.setFillColor(...GREEN_RGB);
    doc.rect(0, 0, 210, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('MONTHLY ATTENDANCE REPORT', 105, 12, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Football Kenya Federation — Human Resources', 105, 20, { align: 'center' });

    // Employee info
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(emp.employee_name, 14, 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Employee ID: ${emp.employee_id}   |   Department: ${emp.department}`, 14, 45);
    doc.text(`Period: ${periodLabel}   |   Generated: ${generatedDate}`, 14, 51);

    // Summary stat boxes
    type BoxDef = { label: string; value: string; fill: [number, number, number] };
    const boxes: BoxDef[] = [
      { label: 'Present',  value: String(emp.present),                     fill: [220, 252, 231] },
      { label: 'Late',     value: String(emp.late),                         fill: [254, 243, 199] },
      { label: 'Absent',   value: String(emp.absent),                       fill: [254, 226, 226] },
      { label: 'Leave',    value: String(emp.leave),                        fill: [219, 234, 254] },
      { label: 'Field',    value: String(emp.field),                        fill: [204, 251, 241] },
      { label: 'Holiday',  value: String(emp.holiday),                      fill: [226, 232, 240] },
      { label: 'Off',      value: String(emp.off),                          fill: [241, 245, 249] },
      { label: 'Hours',    value: `${emp.total_hours_worked.toFixed(1)}h`,  fill: [240, 253, 244] },
    ];
    const bW = 22, bH = 14, bGap = 2, bStartX = 14, bY = 57;
    boxes.forEach((box, i) => {
      const x = bStartX + i * (bW + bGap);
      doc.setFillColor(...box.fill);
      doc.roundedRect(x, bY, bW, bH, 2, 2, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text(box.value, x + bW / 2, bY + 6.5, { align: 'center' });
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(90, 90, 90);
      doc.text(box.label, x + bW / 2, bY + 11.5, { align: 'center' });
    });

    // Completion & variance line
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Completion: ${emp.completion_pct.toFixed(1)}%   Standard Hours: ${emp.standard_hours.toFixed(1)}h   Variance: ${emp.variance_hours >= 0 ? '+' : ''}${emp.variance_hours.toFixed(1)}h`,
      14, bY + bH + 5,
    );

    // Daily detail table
    const days = (emp.days ?? []).filter(d => d.status !== 'future');
    const statusFills: Record<string, [number, number, number]> = {
      'Late':    [254, 243, 199],
      'Absent':  [254, 226, 226],
      'Leave':   [219, 234, 254],
      'Field':   [204, 251, 241],
      'Holiday': [226, 232, 240],
      'Day Off': [241, 245, 249],
    };

    autoTable(doc, {
      startY: bY + bH + 10,
      head: [['Date', 'Day', 'Status', 'Check In', 'Check Out', 'Hours', 'Leave Type']],
      body: days.map(d => [
        d.date,
        d.day,
        dayStatusLabel(d.status),
        fmtTimeEAT(d.check_in),
        fmtTimeEAT(d.check_out),
        d.hours != null ? `${d.hours.toFixed(1)}h` : '—',
        d.leave_type ?? '',
      ]),
      theme: 'striped',
      headStyles: { fillColor: GREEN_RGB, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 18 },
        2: { cellWidth: 22 },
        3: { cellWidth: 22 },
        4: { cellWidth: 22 },
        5: { cellWidth: 16 },
        6: { cellWidth: 'auto' },
      },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const statusCell = data.row.cells[2];
        const statusVal = statusCell?.raw as string | undefined;
        if (statusVal && statusFills[statusVal]) {
          data.cell.styles.fillColor = statusFills[statusVal];
        }
      },
    });

    // Footer
    const pagesPortrait: number = ((doc.internal as any).pages?.length ?? 2) - 1;
    for (let i = 1; i <= pagesPortrait; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5);
      doc.setTextColor(160, 160, 160);
      doc.text(
        `Page ${i} of ${pagesPortrait}  —  Generated by HR System, Football Kenya Federation`,
        105, 290, { align: 'center' },
      );
    }

    doc.save(`Attendance_${emp.employee_id}_${year}-${padM(month)}.pdf`);
    return;
  }

  // ── All employees landscape ─────────────────────────────────────────────────
  const doc = new jsPDF('landscape', 'mm', 'a4');

  // Header band
  doc.setFillColor(...GREEN_RGB);
  doc.rect(0, 0, 297, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('MONTHLY ATTENDANCE REPORT', 148.5, 10, { align: 'center' });
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Football Kenya Federation  |  Period: ${periodLabel}  |  Generated: ${generatedDate}  |  ${employees.length} employees`,
    148.5, 18, { align: 'center' },
  );

  // Build body: sorted by department → employee name, with dept header rows + grand total
  const sorted = [...employees].sort(
    (a, b) => a.department.localeCompare(b.department) || a.employee_name.localeCompare(b.employee_name),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any[][] = [];
  let currentDept = '';
  let deptPres = 0, deptLate = 0, deptAbs = 0, deptLv = 0, deptFld = 0, deptHol = 0, deptOff = 0, deptHrs = 0, deptCount = 0;

  const flushDeptTotals = (deptName: string) => {
    if (deptCount === 0) return;
    body.push([
      { content: `${deptName} subtotal — ${deptCount} employee${deptCount !== 1 ? 's' : ''}`, colSpan: 3, styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN_RGB, textColor: [15, 90, 40] } },
      { content: String(deptPres),  styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN_RGB } },
      { content: String(deptLate),  styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN_RGB } },
      { content: String(deptAbs),   styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN_RGB } },
      { content: String(deptLv),    styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN_RGB } },
      { content: String(deptFld),   styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN_RGB } },
      { content: String(deptHol),   styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN_RGB } },
      { content: String(deptOff),   styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN_RGB } },
      { content: `${deptHrs.toFixed(1)}h`, styles: { fontStyle: 'bold', fillColor: LIGHT_GREEN_RGB } },
      { content: '', styles: { fillColor: LIGHT_GREEN_RGB } },
    ]);
  };

  for (const emp of sorted) {
    if (emp.department !== currentDept) {
      flushDeptTotals(currentDept);
      currentDept = emp.department;
      deptPres = deptLate = deptAbs = deptLv = deptFld = deptHol = deptOff = deptHrs = deptCount = 0;
      body.push([{
        content: emp.department.toUpperCase(),
        colSpan: 12,
        styles: { fontStyle: 'bold', fillColor: DEPT_HEADER_RGB, textColor: [255, 255, 255], fontSize: 7.5 },
      }]);
    }
    deptPres  += emp.present;
    deptLate  += emp.late;
    deptAbs   += emp.absent;
    deptLv    += emp.leave;
    deptFld   += emp.field;
    deptHol   += emp.holiday;
    deptOff   += emp.off;
    deptHrs   += emp.total_hours_worked;
    deptCount += 1;
    body.push([
      emp.employee_name,
      emp.employee_id,
      emp.department,
      String(emp.present),
      String(emp.late),
      String(emp.absent),
      String(emp.leave),
      String(emp.field),
      String(emp.holiday),
      String(emp.off),
      `${emp.total_hours_worked.toFixed(1)}h`,
      `${emp.completion_pct.toFixed(0)}%`,
    ]);
  }
  flushDeptTotals(currentDept);

  // Grand total row
  const gt = employees.reduce(
    (acc, e) => ({
      present: acc.present + e.present, late: acc.late + e.late, absent: acc.absent + e.absent,
      leave: acc.leave + e.leave, field: acc.field + e.field, holiday: acc.holiday + e.holiday,
      off: acc.off + e.off, hours: acc.hours + e.total_hours_worked,
    }),
    { present: 0, late: 0, absent: 0, leave: 0, field: 0, holiday: 0, off: 0, hours: 0 },
  );
  const gtStyle = { fontStyle: 'bold', fillColor: GREEN_RGB, textColor: [255, 255, 255] };
  body.push([
    { content: `GRAND TOTAL — ${employees.length} employees`, colSpan: 3, styles: gtStyle },
    { content: String(gt.present),              styles: gtStyle },
    { content: String(gt.late),                 styles: gtStyle },
    { content: String(gt.absent),               styles: gtStyle },
    { content: String(gt.leave),                styles: gtStyle },
    { content: String(gt.field),                styles: gtStyle },
    { content: String(gt.holiday),              styles: gtStyle },
    { content: String(gt.off),                  styles: gtStyle },
    { content: `${gt.hours.toFixed(1)}h`,       styles: gtStyle },
    { content: '',                               styles: gtStyle },
  ]);

  autoTable(doc, {
    startY: 26,
    head: [['Employee', 'EMP ID', 'Department', 'P', 'L', 'A', 'LV', 'F', 'H', 'O', 'Hours', '%']],
    body,
    theme: 'striped',
    headStyles: { fillColor: GREEN_RGB, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7.5 },
    alternateRowStyles: { fillColor: [252, 252, 252] },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: 20 },
      2: { cellWidth: 38 },
      3: { cellWidth: 12 },
      4: { cellWidth: 12 },
      5: { cellWidth: 12 },
      6: { cellWidth: 12 },
      7: { cellWidth: 12 },
      8: { cellWidth: 12 },
      9: { cellWidth: 12 },
      10: { cellWidth: 22 },
      11: { cellWidth: 16 },
    },
    margin: { left: 10, right: 10 },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 5) return;
      const raw = String(data.cell.raw ?? '');
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n > 0) {
        data.cell.styles.textColor = [185, 28, 28];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // Page footers
  const totalPages: number = ((doc.internal as any).pages?.length ?? 2) - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(
      `Page ${i} of ${totalPages}  —  Generated by HR System, Football Kenya Federation`,
      148.5, 207, { align: 'center' },
    );
  }

  doc.save(`Attendance_All_${year}-${padM(month)}.pdf`);
}

export default {
  generateLeaveCertificate,
  generateLeaveReport,
  generateDepartmentSummary,
  generateLeaveBalanceReport,
  generateMonthlyAttendancePDF,
};
