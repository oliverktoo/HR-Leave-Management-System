import { useState, useEffect, ChangeEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { AdminSidebar } from './AdminSidebar';
import type { Department, LeaveType } from '../../types';

interface DateRange {
  startDate: string;
  endDate: string;
}

interface DepartmentData {
  name: string;
  requests: number;
  days: number;
  approved: number;
}

interface LeaveTypeData {
  name: string;
  color: string;
  requests: number;
  days: number;
  approved: number;
}

interface MonthlyTrend {
  month: string;
  requests: number;
  days: number;
}

interface TopUser {
  name: string;
  days: number;
}

interface Patterns {
  busiest_month: string;
  most_popular_leave_type: string;
  approval_rate: string;
  average_request_days: string;
}

interface ReportData {
  summary: {
    totalRequests?: number;
    approvedRequests?: number;
    pendingRequests?: number;
    rejectedRequests?: number;
    totalDaysRequested?: number;
    averageApprovalTime?: number;
    approvalRate?: string;
  };
  departmentData: DepartmentData[];
  leaveTypeData: LeaveTypeData[];
  monthlyTrends: MonthlyTrend[];
  topUsers: TopUser[];
  patterns: Patterns;
}

type ReportType = 'utilization' | 'trends' | 'leave-types' | 'patterns';

const ReportsAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState<ReportType>('utilization');
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedLeaveType, setSelectedLeaveType] = useState('all');
  
  const [reportData, setReportData] = useState<ReportData>({
    summary: {},
    departmentData: [],
    leaveTypeData: [],
    monthlyTrends: [],
    topUsers: [],
    patterns: {
      busiest_month: 'N/A',
      most_popular_leave_type: 'N/A',
      approval_rate: '0',
      average_request_days: '0'
    }
  });
  
  const [departments, setDepartments] = useState<Department[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);

  // Load initial data when component mounts
  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    generateReport();
  }, [reportType, dateRange, selectedDepartment, selectedLeaveType]);

  const loadInitialData = async () => {
    try {
      const [departmentsResult, leaveTypesResult] = await Promise.all([
        supabase.from('departments').select('*').eq('is_active', true),
        supabase.from('leave_types').select('*').eq('is_active', true)
      ]);

      setDepartments(departmentsResult.data || []);
      setLeaveTypes(leaveTypesResult.data || []);
      
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  };

  const generateReport = async () => {
    try {
      setLoading(true);
      
      // Build query filters
      let query = supabase
        .from('leave_requests')
        .select(`
          *,
          users_profile!leave_requests_user_id_fkey(first_name, last_name, department_id),
          leave_types(name)
        `)
        .gte('start_date', dateRange.startDate)
        .lte('start_date', dateRange.endDate);

      if (selectedDepartment !== 'all') {
        query = query.eq('users_profile.department_id', selectedDepartment);
      }
      
      if (selectedLeaveType !== 'all') {
        query = query.eq('leave_type_id', selectedLeaveType);
      }

      const { data: requests, error } = await query;
      if (error) throw error;

      // Fetch all departments to map department_id to name
      const { data: depts } = await supabase
        .from('departments')
        .select('id, name');
      
      const departmentMap = new Map(depts?.map(d => [d.id, d.name]) || []);

      // Add department names and full_name to requests
      const enrichedRequests = (requests || []).map(req => ({
        ...req,
        users_profile: {
          ...req.users_profile,
          full_name: `${req.users_profile?.first_name || ''} ${req.users_profile?.last_name || ''}`.trim(),
          departments: {
            name: departmentMap.get(req.users_profile?.department_id) || 'Unassigned'
          }
        }
      }));

      // Calculate analytics
      const analytics = calculateAnalytics(enrichedRequests);
      setReportData(analytics);
      
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Error generating report: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const calculateAnalytics = (requests: any[]): ReportData => {
    // Summary statistics
    const totalRequests = requests.length;
    const approvedRequests = requests.filter(r => r.status === 'approved').length;
    const pendingRequests = requests.filter(r => r.status === 'pending').length;
    const rejectedRequests = requests.filter(r => r.status === 'rejected').length;
    
    const totalDaysRequested = requests.reduce((sum, r) => {
      if (r.status === 'approved') {
        const start = new Date(r.start_date);
        const end = new Date(r.end_date);
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        return sum + days;
      }
      return sum;
    }, 0);

    const averageApprovalTime = calculateAverageApprovalTime(requests);

    // Department breakdown
    const departmentMap = new Map<string, DepartmentData>();
    requests.forEach(request => {
      const deptName = request.users_profile.departments?.name || 'Unassigned';
      if (!departmentMap.has(deptName)) {
        departmentMap.set(deptName, { name: deptName, requests: 0, days: 0, approved: 0 });
      }
      const dept = departmentMap.get(deptName)!;
      dept.requests++;
      if (request.status === 'approved') {
        dept.approved++;
        const days = Math.ceil((new Date(request.end_date).getTime() - new Date(request.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;
        dept.days += days;
      }
    });

    // Leave type breakdown
    const leaveTypeMap = new Map<string, LeaveTypeData>();
    requests.forEach(request => {
      const typeName = request.leave_types.name;
      if (!leaveTypeMap.has(typeName)) {
        leaveTypeMap.set(typeName, { 
          name: typeName, 
          color: request.leave_types.color_code,
          requests: 0, 
          days: 0, 
          approved: 0 
        });
      }
      const type = leaveTypeMap.get(typeName)!;
      type.requests++;
      if (request.status === 'approved') {
        type.approved++;
        const days = Math.ceil((new Date(request.end_date).getTime() - new Date(request.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;
        type.days += days;
      }
    });

    // Monthly trends
    const monthlyMap = new Map<string, MonthlyTrend>();
    requests.forEach(request => {
      const date = new Date(request.start_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, { month: monthKey, requests: 0, days: 0 });
      }
      const month = monthlyMap.get(monthKey)!;
      month.requests++;
      if (request.status === 'approved') {
        const days = Math.ceil((new Date(request.end_date).getTime() - new Date(request.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;
        month.days += days;
      }
    });

    // Top users (most leave days)
    const userMap = new Map<string, number>();
    requests.forEach(request => {
      if (request.status === 'approved') {
        const userName = request.users_profile.full_name;
        const days = Math.ceil((new Date(request.end_date).getTime() - new Date(request.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;
        userMap.set(userName, (userMap.get(userName) || 0) + days);
      }
    });

    const topUsers = Array.from(userMap.entries())
      .map(([name, days]) => ({ name, days }))
      .sort((a, b) => b.days - a.days)
      .slice(0, 10);

    // Patterns analysis
    const patterns: Patterns = {
      busiest_month: Array.from(monthlyMap.values()).sort((a, b) => b.requests - a.requests)[0]?.month || 'N/A',
      most_popular_leave_type: Array.from(leaveTypeMap.values()).sort((a, b) => b.requests - a.requests)[0]?.name || 'N/A',
      approval_rate: totalRequests > 0 ? ((approvedRequests / totalRequests) * 100).toFixed(1) : '0',
      average_request_days: approvedRequests > 0 ? (totalDaysRequested / approvedRequests).toFixed(1) : '0'
    };

    return {
      summary: {
        totalRequests,
        approvedRequests,
        pendingRequests,
        rejectedRequests,
        totalDaysRequested,
        averageApprovalTime,
        approvalRate: patterns.approval_rate
      },
      departmentData: Array.from(departmentMap.values()),
      leaveTypeData: Array.from(leaveTypeMap.values()),
      monthlyTrends: Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
      topUsers,
      patterns
    };
  };

  const calculateAverageApprovalTime = (requests: any[]): number => {
    const approvedRequests = requests.filter(r => r.status === 'approved' && r.reviewed_at);
    if (approvedRequests.length === 0) return 0;
    
    const totalHours = approvedRequests.reduce((sum, request) => {
      const submitted = new Date(request.created_at);
      const approved = new Date(request.reviewed_at);
      const hours = (approved.getTime() - submitted.getTime()) / (1000 * 60 * 60);
      return sum + hours;
    }, 0);
    
    return Math.round(totalHours / approvedRequests.length);
  };

  const exportToCSV = () => {
    let csvContent = '';
    
    if (reportType === 'utilization') {
      csvContent = 'Department,Total Requests,Approved Requests,Total Days,Approval Rate\n';
      reportData.departmentData.forEach(dept => {
        const approvalRate = dept.requests > 0 ? ((dept.approved / dept.requests) * 100).toFixed(1) : 0;
        csvContent += `${dept.name},${dept.requests},${dept.approved},${dept.days},${approvalRate}%\n`;
      });
    } else if (reportType === 'trends') {
      csvContent = 'Month,Requests,Days Taken\n';
      reportData.monthlyTrends.forEach(trend => {
        csvContent += `${trend.month},${trend.requests},${trend.days}\n`;
      });
    } else if (reportType === 'leave-types') {
      csvContent = 'Leave Type,Requests,Approved,Days Taken\n';
      reportData.leaveTypeData.forEach(type => {
        csvContent += `${type.name},${type.requests},${type.approved},${type.days}\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `leave_report_${reportType}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatMonth = (monthString: string): string => {
    const [year, month] = monthString.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  };

  if (loading && Object.keys(reportData.summary).length === 0) {
    return (
      <div className="app">
        <div className="content">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading reports...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <AdminSidebar />

      <div className="content">
        <div className="page-header enhanced-header admin-header">
          <div className="header-content">
            <h1 className="page-title">
              <span className="title-icon">📊</span>
              Reports & Analytics
            </h1>
            <p className="page-subtitle">Comprehensive leave utilization insights and trends</p>
          </div>
          <div className="page-actions enhanced-actions">
            <button
              onClick={exportToCSV}
              className="btn btn-success action-btn"
            >
              <span className="btn-icon">📤</span>
              Export CSV
            </button>
            <button
              onClick={generateReport}
              className="btn btn-primary action-btn"
              disabled={loading}
            >
              <span className="btn-icon">🔄</span>
              Refresh Data
            </button>
          </div>
        </div>

        {/* Report Controls */}
        <div className="card mb-6 filters-card">
          <div className="card-header filter-header">
            <h3 className="card-title">
              <span className="filter-icon">⚙️</span>
              Report Configuration
            </h3>
          </div>
          <div className="report-controls">
            <div className="control-group">
              <label className="form-label">Report Type</label>
              <select
                className="form-select enhanced-select"
                value={reportType}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setReportType(e.target.value as ReportType)}
              >
                <option value="utilization">📈 Department Utilization</option>
                <option value="trends">📅 Monthly Trends</option>
                <option value="leave-types">📋 Leave Type Analysis</option>
                <option value="patterns">🔍 Usage Patterns</option>
              </select>
            </div>

            <div className="control-group">
              <label className="form-label">Date Range</label>
              <div className="date-range">
                <input
                  type="date"
                  className="form-input enhanced-input"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange({...dateRange, startDate: e.target.value})}
                />
                <span className="date-separator">to</span>
                <input
                  type="date"
                  className="form-input enhanced-input"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange({...dateRange, endDate: e.target.value})}
                />
              </div>
            </div>

            <div className="control-group">
              <label className="form-label">Department</label>
              <select
                className="form-select enhanced-select"
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
              >
                <option value="all">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="control-group">
              <label className="form-label">Leave Type</label>
              <select
                className="form-select enhanced-select"
                value={selectedLeaveType}
                onChange={(e) => setSelectedLeaveType(e.target.value)}
              >
                <option value="all">All Leave Types</option>
                {leaveTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Summary Statistics */}
        <div className="stats-grid admin-stats-grid mb-8">
          <div className="stats-card admin-stats-card">
            <div className="stats-content">
              <div className="stats-icon stats-icon-primary">📝</div>
              <div className="stats-details">
                <h3 className="stats-title">Total Requests</h3>
                <p className="stats-value">{reportData.summary.totalRequests}</p>
                <p className="stats-change">
                  <span className="stats-change-positive">{reportData.summary.approvedRequests} approved</span>
                </p>
              </div>
            </div>
          </div>

          <div className="stats-card admin-stats-card">
            <div className="stats-content">
              <div className="stats-icon stats-icon-success">📅</div>
              <div className="stats-details">
                <h3 className="stats-title">Days Taken</h3>
                <p className="stats-value">{reportData.summary.totalDaysRequested}</p>
                <p className="stats-change">
                  <span className="text-muted">Approved leave days</span>
                </p>
              </div>
            </div>
          </div>

          <div className="stats-card admin-stats-card">
            <div className="stats-content">
              <div className="stats-icon stats-icon-warning">⏱️</div>
              <div className="stats-details">
                <h3 className="stats-title">Avg Approval Time</h3>
                <p className="stats-value">{reportData.summary.averageApprovalTime}h</p>
                <p className="stats-change">
                  <span className="text-muted">Processing time</span>
                </p>
              </div>
            </div>
          </div>

          <div className="stats-card admin-stats-card">
            <div className="stats-content">
              <div className="stats-icon stats-icon-secondary">✅</div>
              <div className="stats-details">
                <h3 className="stats-title">Approval Rate</h3>
                <p className="stats-value">{reportData.summary.approvalRate}%</p>
                <p className="stats-change">
                  <span className="stats-change-positive">{reportData.summary.rejectedRequests} rejected</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Report Content */}
        {reportType === 'utilization' && (
          <div className="report-section">
            <h2 className="section-title">
              <span className="section-icon">🏢</span>
              Department Utilization Analysis
            </h2>
            
            <div className="card">
              <div className="table-container">
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th>Total Requests</th>
                      <th>Approved</th>
                      <th>Days Taken</th>
                      <th>Approval Rate</th>
                      <th>Avg Days/Request</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.departmentData.map((dept, index) => {
                      const approvalRate = dept.requests > 0 ? ((dept.approved / dept.requests) * 100).toFixed(1) : '0';
                      const avgDays = dept.approved > 0 ? (dept.days / dept.approved).toFixed(1) : '0';
                      const rateNum = parseFloat(approvalRate);
                      
                      return (
                        <tr key={index}>
                          <td className="dept-name">{dept.name}</td>
                          <td>{dept.requests}</td>
                          <td>{dept.approved}</td>
                          <td>{dept.days}</td>
                          <td>
                            <span className={`approval-rate ${rateNum > 80 ? 'rate-high' : rateNum > 60 ? 'rate-medium' : 'rate-low'}`}>
                              {approvalRate}%
                            </span>
                          </td>
                          <td>{avgDays}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {reportType === 'trends' && (
          <div className="report-section">
            <h2 className="section-title">
              <span className="section-icon">📈</span>
              Monthly Trends Analysis
            </h2>
            
            <div className="trends-grid">
              {reportData.monthlyTrends.map((trend, index) => (
                <div key={index} className="trend-card">
                  <div className="trend-header">
                    <h4 className="trend-month">{formatMonth(trend.month)}</h4>
                  </div>
                  <div className="trend-stats">
                    <div className="trend-stat">
                      <span className="trend-label">Requests</span>
                      <span className="trend-value">{trend.requests}</span>
                    </div>
                    <div className="trend-stat">
                      <span className="trend-label">Days</span>
                      <span className="trend-value">{trend.days}</span>
                    </div>
                  </div>
                  <div className="trend-bar">
                    <div 
                      className="trend-fill"
                      style={{ 
                        width: `${Math.min((trend.requests / Math.max(...reportData.monthlyTrends.map(t => t.requests), 1)) * 100, 100)}%` 
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {reportType === 'leave-types' && (
          <div className="report-section">
            <h2 className="section-title">
              <span className="section-icon">📋</span>
              Leave Type Analysis
            </h2>
            
            <div className="leave-type-analysis">
              {reportData.leaveTypeData.map((type, index) => (
                <div key={index} className="analysis-card">
                  <div className="analysis-header">
                    <div 
                      className="type-color-indicator"
                      style={{ backgroundColor: type.color }}
                    ></div>
                    <h4 className="analysis-title">{type.name}</h4>
                  </div>
                  <div className="analysis-stats">
                    <div className="analysis-stat">
                      <span className="stat-number">{type.requests}</span>
                      <span className="stat-label">Total Requests</span>
                    </div>
                    <div className="analysis-stat">
                      <span className="stat-number">{type.approved}</span>
                      <span className="stat-label">Approved</span>
                    </div>
                    <div className="analysis-stat">
                      <span className="stat-number">{type.days}</span>
                      <span className="stat-label">Days Taken</span>
                    </div>
                    <div className="analysis-stat">
                      <span className="stat-number">
                        {type.requests > 0 ? ((type.approved / type.requests) * 100).toFixed(0) : 0}%
                      </span>
                      <span className="stat-label">Approval Rate</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {reportType === 'patterns' && (
          <div className="report-section">
            <h2 className="section-title">
              <span className="section-icon">🔍</span>
              Usage Patterns & Insights
            </h2>
            
            <div className="patterns-grid">
              <div className="pattern-card">
                <div className="pattern-header">
                  <div className="pattern-icon">📅</div>
                  <h4 className="pattern-title">Busiest Month</h4>
                </div>
                <div className="pattern-value">{formatMonth(reportData.patterns.busiest_month)}</div>
                <div className="pattern-desc">Highest request volume</div>
              </div>

              <div className="pattern-card">
                <div className="pattern-header">
                  <div className="pattern-icon">⭐</div>
                  <h4 className="pattern-title">Most Popular Leave</h4>
                </div>
                <div className="pattern-value">{reportData.patterns.most_popular_leave_type}</div>
                <div className="pattern-desc">Most requested type</div>
              </div>

              <div className="pattern-card">
                <div className="pattern-header">
                  <div className="pattern-icon">📊</div>
                  <h4 className="pattern-title">Average Request</h4>
                </div>
                <div className="pattern-value">{reportData.patterns.average_request_days} days</div>
                <div className="pattern-desc">Typical duration</div>
              </div>
            </div>

            {/* Top Users */}
            <div className="top-users-section">
              <h3 className="subsection-title">Top Leave Users</h3>
              <div className="top-users-list">
                {reportData.topUsers.slice(0, 5).map((user, index) => (
                  <div key={index} className="top-user-item">
                    <div className="user-rank">#{index + 1}</div>
                    <div className="user-name">{user.name}</div>
                    <div className="user-days">{user.days} days</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsAnalytics;
