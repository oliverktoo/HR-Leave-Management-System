import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import '../../styles/reports.css';

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
  myUsage: number;
  companyAvg: number;
}

interface YearOverYear {
  year: number;
  daysUsed: number;
  requests: number;
}

export const StaffReports = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [viewType, setViewType] = useState<'overview' | 'trends' | 'comparison'>('overview');
  const [timeRange, setTimeRange] = useState<'3_months' | '6_months' | '12_months'>('12_months');
  
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaveHistory, setLeaveHistory] = useState<LeaveHistory[]>([]);
  const [monthlyUsage, setMonthlyUsage] = useState<MonthlyUsage[]>([]);
  const [departmentComparison, setDepartmentComparison] = useState<DepartmentComparison>({
    departmentAvg: 0,
    myUsage: 0,
    companyAvg: 0
  });
  const [yearOverYear, setYearOverYear] = useState<YearOverYear[]>([]);

  useEffect(() => {
    if (profile?.id) {
      loadReportData();
    }
  }, [profile?.id, timeRange]);

  // Format date without timezone issues
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    // Add timezone offset to get correct local date
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() + userTimezoneOffset);
    return localDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const loadReportData = async () => {
    if (!profile?.id) return;
    
    setLoading(true);
    
    try {
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
          *,
          leave_types (name, color)
        `)
        .eq('user_id', profile.id)
        .eq('year', new Date().getFullYear());

      if (balanceData) {
        setBalances(balanceData.map((b: any) => ({
          leave_type: b.leave_types?.name || 'Unknown',
          annual_allocation: b.allocated_days || 0,
          used_days: b.used_days || 0,
          pending_days: b.pending_days || 0,
          carryforward_days: b.carryforward_days || 0,
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
        .eq('user_id', profile.id)
        .gte('start_date', startDate.toISOString())
        .lte('start_date', endDate.toISOString())
        .order('start_date', { ascending: false });

      if (historyData) {
        setLeaveHistory(historyData.map((h: any) => ({
          id: h.id,
          leave_type: h.leave_types?.name || 'Unknown',
          start_date: h.start_date,
          end_date: h.end_date,
          days: h.total_days || 0,
          status: h.status,
          created_at: h.created_at
        })));
      }

      // Calculate monthly usage
      await calculateMonthlyUsage(profile.id, startDate, endDate);

      // Load department comparison
      await loadDepartmentComparison(profile.id, profile.department_id, startDate, endDate);

      // Load year-over-year data
      await loadYearOverYear(profile.id);

    } catch (error) {
      console.error('Error loading report data:', error);
    } finally {
      setLoading(false);
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
        const date = new Date(request.start_date);
        const userTimezoneOffset = date.getTimezoneOffset() * 60000;
        const localDate = new Date(date.getTime() + userTimezoneOffset);
        const month = localDate.toLocaleDateString('en-US', { 
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
    // Get my usage
    const { data: myData } = await supabase
      .from('leave_requests')
      .select('total_days')
      .eq('user_id', employeeId)
      .gte('start_date', startDate.toISOString())
      .lte('start_date', endDate.toISOString())
      .eq('status', 'approved');

    const myUsage = myData?.reduce((sum, r) => sum + (r.total_days || 0), 0) || 0;

    // Get department average
    let departmentAvg = 0;
    if (departmentId) {
      const { data: deptData } = await supabase
        .from('leave_requests')
        .select(`
          total_days,
          user_id,
          users_profile!inner (department_id)
        `)
        .eq('users_profile.department_id', departmentId)
        .gte('start_date', startDate.toISOString())
        .lte('start_date', endDate.toISOString())
        .eq('status', 'approved');

      if (deptData && deptData.length > 0) {
        const totalDays = deptData.reduce((sum, r) => sum + (r.total_days || 0), 0);
        const uniqueEmployees = new Set(deptData.map((r: any) => r.user_id)).size;
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
      myUsage,
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
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading your reports...</p>
      </div>
    );
  }

  return (
    <div className="reports-container">
      <div className="reports-header">
        <div>
          <h1 className="reports-title">📊 My Reports</h1>
          <p className="reports-subtitle">View your leave usage statistics and trends</p>
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="btn btn-secondary"
        >
          ← Back to Dashboard
        </button>
      </div>

      {/* Filters */}
      <div className="reports-filters">
        <div className="filter-group">
          <label>View Type</label>
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

        <div className="filter-group">
          <label>Time Range</label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="form-control"
          >
            <option value="3_months">Last 3 Months</option>
            <option value="6_months">Last 6 Months</option>
            <option value="12_months">Last 12 Months</option>
          </select>
        </div>
      </div>

      {/* Overview Tab */}
      {viewType === 'overview' && (
        <div className="reports-content">
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
                        <td>{formatDate(leave.start_date)}</td>
                        <td>{formatDate(leave.end_date)}</td>
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
        <div className="reports-content">
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
                <p style={{ textAlign: 'center', color: '#6b7280', padding: '3rem' }}>
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
        <div className="reports-content">
          <div className="section">
            <h2 className="section-title">Usage Comparison</h2>
            <p className="section-description">
              Compare your leave usage with department and company averages
            </p>

            <div className="comparison-grid">
              <div className="comparison-card highlight">
                <div className="comparison-icon">👤</div>
                <h3>My Usage</h3>
                <div className="comparison-value">{departmentComparison.myUsage.toFixed(1)}</div>
                <div className="comparison-label">Days Used</div>
              </div>

              <div className="comparison-card">
                <div className="comparison-icon">👥</div>
                <h3>Department Average</h3>
                <div className="comparison-value">{departmentComparison.departmentAvg.toFixed(1)}</div>
                <div className="comparison-label">Days Used</div>
                <div className="comparison-difference">
                  {departmentComparison.myUsage > departmentComparison.departmentAvg ? (
                    <span className="above">
                      ↑ {(departmentComparison.myUsage - departmentComparison.departmentAvg).toFixed(1)} above avg
                    </span>
                  ) : (
                    <span className="below">
                      ↓ {(departmentComparison.departmentAvg - departmentComparison.myUsage).toFixed(1)} below avg
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
                  {departmentComparison.myUsage > departmentComparison.companyAvg ? (
                    <span className="above">
                      ↑ {(departmentComparison.myUsage - departmentComparison.companyAvg).toFixed(1)} above avg
                    </span>
                  ) : (
                    <span className="below">
                      ↓ {(departmentComparison.companyAvg - departmentComparison.myUsage).toFixed(1)} below avg
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="insight-box">
              <h4>💡 Insight</h4>
              <p>
                {departmentComparison.myUsage < departmentComparison.companyAvg ? (
                  <>You're using less leave than the company average. Consider taking time off to maintain work-life balance!</>
                ) : departmentComparison.myUsage < departmentComparison.companyAvg * 1.2 ? (
                  <>Your leave usage is within normal range compared to company averages.</>
                ) : (
                  <>You're utilizing your leave allocation well. Make sure to plan ahead for any remaining leave days.</>
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
    </div>
  );
};
