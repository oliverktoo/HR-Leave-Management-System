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
  doc.text(`Issue Date: ${new Date().toLocaleDateString('en-GB')}`, 140, 50);
  
  // Main content
  doc.setFontSize(11);
  const startY = 65;
  
  doc.text('To Whom It May Concern,', 20, startY);
  
  const bodyText = `This is to certify that ${userProfile.first_name} ${userProfile.last_name}, ` +
    `Employee ID: ${userProfile.employee_id}, Department: ${leaveRequest.department?.name || 'N/A'}, ` +
    `has been granted ${leaveRequest.leave_types?.name || 'leave'} from ` +
    `${new Date(leaveRequest.start_date).toLocaleDateString('en-GB')} to ` +
    `${new Date(leaveRequest.end_date).toLocaleDateString('en-GB')}, totaling ` +
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
      ['Department', leaveRequest.department?.name || 'N/A'],
      ['Leave Type', leaveRequest.leave_types?.name || 'N/A'],
      ['Start Date', new Date(leaveRequest.start_date).toLocaleDateString('en-GB')],
      ['End Date', new Date(leaveRequest.end_date).toLocaleDateString('en-GB')],
      ['Total Days', leaveRequest.total_days.toString()],
      ['Status', leaveRequest.status.toUpperCase()],
      ['Approved By', leaveRequest.reviewed_by_user ? 
        `${leaveRequest.reviewed_by_user.first_name} ${leaveRequest.reviewed_by_user.last_name}` : 
        'Pending'],
      ['Approval Date', leaveRequest.reviewed_at ? 
        new Date(leaveRequest.reviewed_at).toLocaleDateString('en-GB') : 
        'Pending']
    ],
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185] },
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
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB')}`, 148, 28, { align: 'center' });
  
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
    new Date(request.start_date).toLocaleDateString('en-GB'),
    new Date(request.end_date).toLocaleDateString('en-GB'),
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
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 105, 34, { align: 'center' });
  
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
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 148, 28, { align: 'center' });
  
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

export default {
  generateLeaveCertificate,
  generateLeaveReport,
  generateDepartmentSummary,
  generateLeaveBalanceReport
};
