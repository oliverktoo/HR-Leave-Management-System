import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { AdminSidebar } from './AdminSidebar';
import '../../styles/reports.css';

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  department: {
    name: string;
  } | null;
}

interface LeaveBalance {
  leave_type: string;
  annual_allocation: number;
  used_days: number;
  pending_days: number;
  carryforward_days: number;
  color: string;
}

interface LeaveHistory {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  created_at: string;
}

interface MonthlyUsage {
  month: string;
  days: number;
  requests: number;
}

interface DepartmentComparison {
  departmentAvg: number;
  employeeUsage: number;
  companyAvg: number;
}

interface YearOverYear {
  year: number;
  daysUsed: number;
  requests: number;
}

export const EmployeeReports = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [viewType, setViewType] = useState<'overview' | 'trends' | 'comparison'>('overview');
  const [timeRange, setTimeRange] = useState<'3_months' | '6_months' | '12_months'>('12_months');
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaveHistory, setLeaveHistory] = useState<LeaveHistory[]>([]);
  const [monthlyUsage, setMonthlyUsage] = useState<MonthlyUsage[]>([]);
  const [departmentComparison, setDepartmentComparison] = useState<DepartmentComparison>({
    departmentAvg: 0,
    employeeUsage: 0,
    companyAvg: 0
  });
  const [yearOverYear, setYearOverYear] = useState<YearOverYear[]>([]);

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    if (selectedEmployeeId) {
      loadEmployeeReportData();
    }
  }, [selectedEmployeeId, timeRange]);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      // Build users query - HODs can only see employees in their department
      let usersQuery = supabase
        .from('users_profile')
        .select('id, first_name, last_name, email, department_id, role')
        .order('first_name', { ascending: true });

      // Filter by department for HODs
      if ((profile?.role as string) === 'hod' && profile?.department_id) {
        usersQuery = usersQuery.eq('department_id', profile.department_id);
      }

      // Load users and departments
      const [usersResult, departmentsResult] = await Promise.all([
        usersQuery,
        supabase
          .from('departments')
          .select('id, name')
      ]);

      if (usersResult.error) throw usersResult.error;
      if (departmentsResult.error) throw departmentsResult.error;

      // Create department map for efficient lookup
      const deptMap = new Map((departmentsResult.data || []).map(d => [d.id, d.name]));

      const formattedEmployees = (usersResult.data || []).map((emp: any) => ({
        id: emp.id,
        first_name: emp.first_name || '',
        last_name: emp.last_name || '',
        email: emp.email || '',
        department: emp.department_id && deptMap.has(emp.department_id) 
          ? { name: deptMap.get(emp.department_id)! } 
          : null
      }));

      setEmployees(formattedEmployees);
    } catch (error) {
      console.error('Error loading employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEmployeeReportData = async () => {
    if (!selectedEmployeeId) return;
    
    setLoadingReport(true);
    
    try {
      // Find selected employee details
      const employee = employees.find(e => e.id === selectedEmployeeId);
      setSelectedEmployee(employee || null);

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      
      switch (timeRange) {
        case '3_months':
          startDate.setMonth(endDate.getMonth() - 3);
          break;
        case '6_months':
          startDate.setMonth(endDate.getMonth() - 6);
          break;
        case '12_months':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
      }

      // Load leave balances
      const { data: balanceData } = await supabase
        .from('leave_balances')
        .select(`
          annual_allocation,
          used_days,
          pending_days,
          carryforward_days,
          leave_types (name, color)
        `)
        .eq('user_id', selectedEmployeeId);

      if (balanceData) {
        setBalances(balanceData.map((b: any) => ({
          leave_type: b.leave_types?.name || b.leave_type,
          annual_allocation: b.annual_allocation,
          used_days: b.used_days,
          pending_days: b.pending_days,
          carryforward_days: b.carryforward_days,
          color: b.leave_types?.color || '#6366f1'
        })));
      }

      // Load leave history
      const { data: historyData } = await supabase
        .from('leave_requests')
        .select(`
          id,
          start_date,
          end_date,
          total_days,
          status,
          created_at,
          leave_types (name)
        `)
        .eq('user_id', selectedEmployeeId)
        .gte('start_date', startDate.toISOString())
        .lte('start_date', endDate.toISOString())
        .order('start_date', { ascending: false });

      if (historyData) {
        setLeaveHistory(historyData.map((h: any) => ({
          id: h.id,
          leave_type: h.leave_types?.name || 'Unknown',
          start_date: h.start_date,
          end_date: h.end_date,
          days: h.total_days,
          status: h.status,
          created_at: h.created_at
        })));
      }

      // Calculate monthly usage
      await calculateMonthlyUsage(selectedEmployeeId, startDate, endDate);

      // Load department comparison
      if (employee?.department) {
        // Find department_id
        const { data: deptData } = await supabase
          .from('users_profile')
          .select('department_id')
          .eq('id', selectedEmployeeId)
          .single();

        if (deptData?.department_id) {
          await loadDepartmentComparison(selectedEmployeeId, deptData.department_id, startDate, endDate);
        }
      } else {
        await loadDepartmentComparison(selectedEmployeeId, null, startDate, endDate);
      }

      // Load year-over-year data
      await loadYearOverYear(selectedEmployeeId);

    } catch (error) {
      console.error('Error loading employee report data:', error);
    } finally {
      setLoadingReport(false);
    }
  };

  const calculateMonthlyUsage = async (employeeId: string, startDate: Date, endDate: Date) => {
    const { data } = await supabase
      .from('leave_requests')
      .select('start_date, total_days, status')
      .eq('user_id', employeeId)
      .gte('start_date', startDate.toISOString())
      .lte('start_date', endDate.toISOString())
      .in('status', ['approved', 'pending']);

    if (data) {
      const monthlyData: { [key: string]: { days: number; requests: number } } = {};
      
      data.forEach((request: any) => {
        const month = new Date(request.start_date).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short' 
        });
        
        if (!monthlyData[month]) {
          monthlyData[month] = { days: 0, requests: 0 };
        }
        
        monthlyData[month].days += request.total_days || 0;
        monthlyData[month].requests += 1;
      });

      const sortedMonths = Object.entries(monthlyData)
        .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
        .map(([month, data]) => ({
          month,
          days: data.days,
          requests: data.requests
        }));

      setMonthlyUsage(sortedMonths);
    }
  };

  const loadDepartmentComparison = async (
    employeeId: string, 
    departmentId: string | null, 
    startDate: Date, 
    endDate: Date
  ) => {
    // Get employee's usage
    const { data: empData } = await supabase
      .from('leave_requests')
      .select('total_days')
      .eq('user_id', employeeId)
      .gte('start_date', startDate.toISOString())
      .lte('start_date', endDate.toISOString())
      .eq('status', 'approved');

    const employeeUsage = empData?.reduce((sum, r) => sum + (r.total_days || 0), 0) || 0;

    // Get department average
    let departmentAvg = 0;
    if (departmentId) {
      const { data: deptData } = await supabase
        .from('leave_requests')
        .select(`
          total_days,
          users_profile!inner (department_id)
        `)
        .eq('users_profile.department_id', departmentId)
        .gte('start_date', startDate.toISOString())
        .lte('start_date', endDate.toISOString())
        .eq('status', 'approved');

      if (deptData && deptData.length > 0) {
        const totalDays = deptData.reduce((sum, r) => sum + (r.total_days || 0), 0);
        const uniqueEmployees = new Set(deptData.map((r: any) => r.users_profile?.id)).size;
        departmentAvg = uniqueEmployees > 0 ? totalDays / uniqueEmployees : 0;
      }
    }

    // Get company average
    const { data: companyData } = await supabase
      .from('leave_requests')
      .select('total_days, user_id')
      .gte('start_date', startDate.toISOString())
      .lte('start_date', endDate.toISOString())
      .eq('status', 'approved');

    let companyAvg = 0;
    if (companyData && companyData.length > 0) {
      const totalDays = companyData.reduce((sum, r) => sum + (r.total_days || 0), 0);
      const uniqueEmployees = new Set(companyData.map(r => r.user_id)).size;
      companyAvg = uniqueEmployees > 0 ? totalDays / uniqueEmployees : 0;
    }

    setDepartmentComparison({
      employeeUsage,
      departmentAvg,
      companyAvg
    });
  };

  const loadYearOverYear = async (employeeId: string) => {
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 2, currentYear - 1, currentYear];

    const yearData: YearOverYear[] = [];

    for (const year of years) {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31);

      const { data } = await supabase
        .from('leave_requests')
        .select('total_days')
        .eq('user_id', employeeId)
        .gte('start_date', startDate.toISOString())
        .lte('start_date', endDate.toISOString())
        .eq('status', 'approved');

      const daysUsed = data?.reduce((sum, r) => sum + (r.total_days || 0), 0) || 0;
      const requests = data?.length || 0;

      yearData.push({ year, daysUsed, requests });
    }

    setYearOverYear(yearData);
  };

  const calculateAvailable = (balance: LeaveBalance) => {
    return balance.annual_allocation + balance.carryforward_days - balance.used_days - balance.pending_days;
  };

  const calculatePercentageUsed = (balance: LeaveBalance) => {
    const total = balance.annual_allocation + balance.carryforward_days;
    if (total === 0) return 0;
    return Math.round((balance.used_days / total) * 100);
  };

  if (loading) {
    return (
      <div className="app">
        <AdminSidebar />
        <div className="content">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading employees...</p>
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
              <span className="title-icon">👤</span>
              Employee Reports
            </h1>
            <p className="page-subtitle">View detailed leave reports for any employee</p>
          </div>
        </div>

        {/* Employee Selection */}
        <div className="card mb-6 filters-card">
          <div className="card-header filter-header">
            <h3 className="card-title">
              <span className="filter-icon">👥</span>
              Select Employee
            </h3>
          </div>
          <div className="report-controls">
            <div className="control-group">
              <label className="form-label">Employee</label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="form-select enhanced-select"
              >
              <option value="">-- Choose an employee --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name} ({emp.email})
                  {emp.department ? ` - ${emp.department.name}` : ''}
                </option>
              ))}
            </select>
          </div>
          </div>
        </div>

        {selectedEmployeeId && selectedEmployee && (
          <>
            {/* Employee Info Card */}
            <div className="card mb-6">
              <div className="employee-info-header">
                <div className="employee-avatar">
                  {selectedEmployee.first_name?.[0]}{selectedEmployee.last_name?.[0]}
                </div>
                <div className="employee-details">
                  <h2 className="employee-name">
                    {selectedEmployee.first_name} {selectedEmployee.last_name}
                  </h2>
                  <p className="employee-meta">
                    {selectedEmployee.email}
                    {selectedEmployee.department && ` • ${selectedEmployee.department.name}`}
                  </p>
                </div>
              </div>
            </div>

          {loadingReport ? (
              <div className="loading-state">
                <div className="loading-spinner"></div>
                <p>Loading report data...</p>
              </div>
            ) : (
              <>
                {/* Filters */}
                <div className="card mb-6 filters-card">
                  <div className="card-header filter-header">
                    <h3 className="card-title">
                      <span className="filter-icon">⚙️</span>
                      Report Configuration
                    </h3>
                  </div>
                  <div className="report-controls">
                    <div className="control-group">
                      <label className="form-label">View Type</label>
                      <div className="button-group">
                        <button
                          className={`filter-btn ${viewType === 'overview' ? 'active' : ''}`}
                          onClick={() => setViewType('overview')}
                        >
                          📈 Overview
                        </button>
                        <button
                          className={`filter-btn ${viewType === 'trends' ? 'active' : ''}`}
                          onClick={() => setViewType('trends')}
                        >
                          📉 Trends
                        </button>
                        <button
                          className={`filter-btn ${viewType === 'comparison' ? 'active' : ''}`}
                          onClick={() => setViewType('comparison')}
                        >
                          🔍 Comparison
                        </button>
                      </div>
                    </div>

                    <div className="control-group">
                      <label className="form-label">Time Range</label>
                      <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value as any)}
                        className="form-select enhanced-select"
                      >
                        <option value="3_months">Last 3 Months</option>
                        <option value="6_months">Last 6 Months</option>
                        <option value="12_months">Last 12 Months</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Overview Tab */}
                  {viewType === 'overview' && (
                    <div className="report-section">
                      {/* Leave Balance Cards */}
                      <div className="section">
                        <h2 className="section-title">Current Leave Balances</h2>
                        <div className="balance-grid">
                          {balances.map((balance, idx) => (
                            <div key={idx} className="balance-card">
                              <div className="balance-header">
                                <span 
                                  className="balance-indicator" 
                                  style={{ backgroundColor: balance.color }}
                                ></span>
                                <h3>{balance.leave_type}</h3>
                              </div>
                              <div className="balance-stats">
                                <div className="stat">
                                  <span className="stat-value">{calculateAvailable(balance)}</span>
                                  <span className="stat-label">Available</span>
                                </div>
                                <div className="stat">
                                  <span className="stat-value">{balance.used_days}</span>
                                  <span className="stat-label">Used</span>
                                </div>
                                <div className="stat">
                                  <span className="stat-value">{balance.pending_days}</span>
                                  <span className="stat-label">Pending</span>
                                </div>
                              </div>
                              <div className="progress-bar">
                                <div 
                                  className="progress-fill"
                                  style={{ 
                                    width: `${calculatePercentageUsed(balance)}%`,
                                    backgroundColor: balance.color
                                  }}
                                ></div>
                              </div>
                              <p className="progress-text">
                                {calculatePercentageUsed(balance)}% utilized
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Recent Leave History */}
                      <div className="section">
                        <h2 className="section-title">Recent Leave History</h2>
                        <div className="table-container">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Leave Type</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>Days</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {leaveHistory.length === 0 ? (
                                <tr>
                                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                                    No leave history for selected period
                                  </td>
                                </tr>
                              ) : (
                                leaveHistory.slice(0, 10).map((leave) => (
                                  <tr key={leave.id}>
                                    <td>{leave.leave_type}</td>
                                    <td>{new Date(leave.start_date).toLocaleDateString()}</td>
                                    <td>{new Date(leave.end_date).toLocaleDateString()}</td>
                                    <td>{leave.days}</td>
                                    <td>
                                      <span className={`status-badge status-${leave.status.toLowerCase()}`}>
                                        {leave.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Trends Tab */}
                  {viewType === 'trends' && (
                    <div className="report-section">
                      {/* Monthly Usage Chart */}
                      <div className="section">
                        <h2 className="section-title">Monthly Leave Usage</h2>
                        <div className="chart-container">
                          <div className="bar-chart">
                            {monthlyUsage.map((month, idx) => {
                              const maxDays = Math.max(...monthlyUsage.map(m => m.days), 10);
                              const heightPercent = (month.days / maxDays) * 100;
                              
                              return (
                                <div key={idx} className="bar-item">
                                  <div className="bar-wrapper">
                                    <div 
                                      className="bar"
                                      style={{ height: `${heightPercent}%` }}
                                      title={`${month.days} days`}
                                    >
                                      <span className="bar-value">{month.days}</span>
                                    </div>
                                  </div>
                                  <span className="bar-label">{month.month}</span>
                                  <span className="bar-sublabel">{month.requests} req</span>
                                </div>
                              );
                            })}
                          </div>
                          {monthlyUsage.length === 0 && (
                            <p className="empty-state">
                              No data available for selected period
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Year over Year Comparison */}
                      <div className="section">
                        <h2 className="section-title">Year-over-Year Comparison</h2>
                        <div className="yoy-grid">
                          {yearOverYear.map((yearData, idx) => (
                            <div key={idx} className="yoy-card">
                              <h3 className="yoy-year">{yearData.year}</h3>
                              <div className="yoy-stats">
                                <div className="yoy-stat">
                                  <span className="yoy-value">{yearData.daysUsed}</span>
                                  <span className="yoy-label">Days Used</span>
                                </div>
                                <div className="yoy-stat">
                                  <span className="yoy-value">{yearData.requests}</span>
                                  <span className="yoy-label">Requests</span>
                                </div>
                              </div>
                              {idx > 0 && yearOverYear[idx - 1].daysUsed > 0 && (
                                <div className="yoy-change">
                                  {yearData.daysUsed > yearOverYear[idx - 1].daysUsed ? '📈' : '📉'}
                                  {' '}
                                  {Math.abs(
                                    Math.round(
                                      ((yearData.daysUsed - yearOverYear[idx - 1].daysUsed) / 
                                      yearOverYear[idx - 1].daysUsed) * 100
                                    )
                                  )}% from {yearOverYear[idx - 1].year}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Comparison Tab */}
                  {viewType === 'comparison' && (
                    <div className="report-section">
                      <div className="section">
                        <h2 className="section-title">Usage Comparison</h2>
                        <p className="section-description">
                          Compare employee's leave usage with department and company averages
                        </p>

                        <div className="comparison-grid">
                          <div className="comparison-card highlight">
                            <div className="comparison-icon">👤</div>
                            <h3>Employee Usage</h3>
                            <div className="comparison-value">{departmentComparison.employeeUsage.toFixed(1)}</div>
                            <div className="comparison-label">Days Used</div>
                          </div>

                          <div className="comparison-card">
                            <div className="comparison-icon">👥</div>
                            <h3>Department Average</h3>
                            <div className="comparison-value">{departmentComparison.departmentAvg.toFixed(1)}</div>
                            <div className="comparison-label">Days Used</div>
                            <div className="comparison-difference">
                              {departmentComparison.employeeUsage > departmentComparison.departmentAvg ? (
                                <span className="above">
                                  ↑ {(departmentComparison.employeeUsage - departmentComparison.departmentAvg).toFixed(1)} above avg
                                </span>
                              ) : (
                                <span className="below">
                                  ↓ {(departmentComparison.departmentAvg - departmentComparison.employeeUsage).toFixed(1)} below avg
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="comparison-card">
                            <div className="comparison-icon">🏢</div>
                            <h3>Company Average</h3>
                            <div className="comparison-value">{departmentComparison.companyAvg.toFixed(1)}</div>
                            <div className="comparison-label">Days Used</div>
                            <div className="comparison-difference">
                              {departmentComparison.employeeUsage > departmentComparison.companyAvg ? (
                                <span className="above">
                                  ↑ {(departmentComparison.employeeUsage - departmentComparison.companyAvg).toFixed(1)} above avg
                                </span>
                              ) : (
                                <span className="below">
                                  ↓ {(departmentComparison.companyAvg - departmentComparison.employeeUsage).toFixed(1)} below avg
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="insight-box">
                          <h4>💡 Insight</h4>
                          <p>
                            {departmentComparison.employeeUsage < departmentComparison.companyAvg ? (
                              <>This employee is using less leave than the company average. They may have a good work-life balance or may need encouragement to take time off.</>
                            ) : departmentComparison.employeeUsage < departmentComparison.companyAvg * 1.2 ? (
                              <>This employee's leave usage is within normal range compared to company averages.</>
                            ) : (
                              <>This employee is utilizing their leave allocation actively. Monitor to ensure proper balance and coverage.</>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Leave Type Breakdown */}
                      <div className="section">
                        <h2 className="section-title">Leave Type Breakdown</h2>
                        <div className="breakdown-grid">
                          {balances.map((balance, idx) => {
                            const total = balance.annual_allocation + balance.carryforward_days;
                            const usedPercent = total > 0 ? (balance.used_days / total) * 100 : 0;

                            return (
                              <div key={idx} className="breakdown-card">
                                <h3>{balance.leave_type}</h3>
                                <div className="breakdown-chart">
                                  <div className="pie-chart">
                                    <svg viewBox="0 0 36 36">
                                      <circle
                                        cx="18"
                                        cy="18"
                                        r="16"
                                        fill="none"
                                        stroke="#e5e7eb"
                                        strokeWidth="4"
                                      />
                                      <circle
                                        cx="18"
                                        cy="18"
                                        r="16"
                                        fill="none"
                                        stroke={balance.color}
                                        strokeWidth="4"
                                        strokeDasharray={`${usedPercent} 100`}
                                        transform="rotate(-90 18 18)"
                                      />
                                    </svg>
                                    <div className="pie-label">
                                      {Math.round(usedPercent)}%
                                    </div>
                                  </div>
                                  <div className="breakdown-stats">
                                    <div className="breakdown-stat">
                                      <span style={{ color: balance.color }}>●</span> Used: {balance.used_days}
                                    </div>
                                    <div className="breakdown-stat">
                                      <span style={{ color: '#fbbf24' }}>●</span> Pending: {balance.pending_days}
                                    </div>
                                    <div className="breakdown-stat">
                                      <span style={{ color: '#10b981' }}>●</span> Available: {calculateAvailable(balance)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
              </>
            )}
          </>
        )}

        {!selectedEmployeeId && (
          <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📊</div>
              <h3 style={{ color: '#6b7280', marginBottom: '0.5rem' }}>Select an Employee</h3>
              <p style={{ color: '#9ca3af' }}>Choose an employee from the dropdown above to view their leave reports</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeReports;
