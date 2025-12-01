import { useState, useEffect, ChangeEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { AdminSidebar } from './AdminSidebar';

interface MonthlyTrend {
  month: string;
  label: string;
  requests: number;
  approved: number;
  rejected: number;
  pending: number;
  days: number;
}

interface Prediction {
  month: string;
  label: string;
  predicted_requests: number;
  confidence: number;
}

interface Insight {
  type: 'seasonal' | 'approval' | 'workflow';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  action: string;
}

interface KPIs {
  totalRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  pendingRequests: number;
  approvalRate: number;
  avgDaysPerRequest: number;
  avgProcessingHours: number;
  utilizationRate: number;
}

interface DepartmentMetric {
  name: string;
  requests: number;
  approved: number;
  avgDays: number;
  totalDays: number;
  approvalRate: number;
}

interface UserActivity {
  name: string;
  requests: number;
  days: number;
  lastRequest: string | null;
}

interface AnalyticsData {
  trends: MonthlyTrend[];
  predictions: Prediction[];
  insights: Insight[];
  kpis: Partial<KPIs>;
  departmentMetrics: DepartmentMetric[];
  userActivity: UserActivity[];
}

type TimeRange = '3_months' | '6_months' | '12_months' | '24_months';
type MetricType = 'leave_utilization' | 'approval_patterns' | 'department_trends' | 'seasonal_analysis';

const AnalyticsDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('leave_utilization');
  const [timeRange, setTimeRange] = useState<TimeRange>('12_months');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    trends: [],
    predictions: [],
    insights: [],
    kpis: {},
    departmentMetrics: [],
    userActivity: []
  });

  // Load analytics when component mounts or filters change
  useEffect(() => {
    loadAnalytics();
  }, [selectedMetric, timeRange]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      
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
          startDate.setMonth(endDate.getMonth() - 12);
          break;
        case '24_months':
          startDate.setMonth(endDate.getMonth() - 24);
          break;
        default:
          startDate.setMonth(endDate.getMonth() - 12);
      }

      // Load leave requests data
      const { data: requests, error } = await supabase
        .from('leave_requests')
        .select(`
          *,
          users_profile!leave_requests_user_id_fkey(first_name, last_name, department_id),
          leave_types(name, color_code)
        `)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (error) throw error;

      // Fetch departments to enrich data
      const { data: depts } = await supabase
        .from('departments')
        .select('id, name');
      
      const deptMap = new Map(depts?.map(d => [d.id, { name: d.name }]) || []);
      
      // Enrich requests with department names and full_name
      const enrichedRequests = (requests || []).map(req => ({
        ...req,
        users_profile: {
          ...req.users_profile,
          full_name: `${req.users_profile?.first_name || ''} ${req.users_profile?.last_name || ''}`.trim(),
          departments: deptMap.get(req.users_profile?.department_id) || { name: 'Unassigned' }
        }
      }));

      // Process analytics data
      const analytics = processAnalyticsData(enrichedRequests, startDate, endDate);
      setAnalyticsData(analytics);
      
    } catch (error) {
      console.error('Error loading analytics:', error);
      alert('Error loading analytics: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const processAnalyticsData = (requests: any[], startDate: Date, endDate: Date): AnalyticsData => {
    // Monthly trends
    const monthlyData = generateMonthlyTrends(requests, startDate, endDate);
    
    // Predictions (simple linear regression for next 3 months)
    const predictions = generatePredictions(monthlyData);
    
    // Key insights
    const insights = generateInsights(requests);
    
    // KPIs
    const kpis = calculateKPIs(requests);
    
    // Department metrics
    const departmentMetrics = calculateDepartmentMetrics(requests);
    
    // User activity patterns
    const userActivity = calculateUserActivity(requests);

    return {
      trends: monthlyData,
      predictions,
      insights,
      kpis,
      departmentMetrics,
      userActivity
    };
  };

  const generateMonthlyTrends = (requests: any[], startDate: Date, endDate: Date): MonthlyTrend[] => {
    const months: MonthlyTrend[] = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
      const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
      const monthRequests = requests.filter(r => {
        const requestDate = new Date(r.created_at);
        return requestDate.getFullYear() === current.getFullYear() &&
               requestDate.getMonth() === current.getMonth();
      });

      months.push({
        month: monthKey,
        label: current.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        requests: monthRequests.length,
        approved: monthRequests.filter(r => r.status === 'approved').length,
        rejected: monthRequests.filter(r => r.status === 'rejected').length,
        pending: monthRequests.filter(r => r.status === 'pending').length,
        days: monthRequests
          .filter(r => r.status === 'approved')
          .reduce((sum, r) => {
            const days = Math.ceil((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;
            return sum + days;
          }, 0)
      });
      
      current.setMonth(current.getMonth() + 1);
    }
    
    return months;
  };

  const generatePredictions = (monthlyData: MonthlyTrend[]): Prediction[] => {
    if (monthlyData.length < 3) return [];
    
    const predictions: Prediction[] = [];
    const recentData = monthlyData.slice(-6); // Use last 6 months for prediction
    
    // Simple trend calculation
    const totalRequests = recentData.reduce((sum, month) => sum + month.requests, 0);
    const avgRequests = totalRequests / recentData.length;
    const trend = recentData.length > 1 
      ? (recentData[recentData.length - 1].requests - recentData[0].requests) / (recentData.length - 1)
      : 0;
    
    // Generate next 3 months predictions
    for (let i = 1; i <= 3; i++) {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + i);
      
      predictions.push({
        month: `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}`,
        label: futureDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        predicted_requests: Math.max(0, Math.round(avgRequests + (trend * i))),
        confidence: Math.max(0.6, 1 - (i * 0.1)) // Decreasing confidence
      });
    }
    
    return predictions;
  };

  const generateInsights = (requests: any[]): Insight[] => {
    const insights: Insight[] = [];
    
    // Most active month
    const monthCounts: Record<number, number> = {};
    requests.forEach(r => {
      const month = new Date(r.created_at).getMonth();
      monthCounts[month] = (monthCounts[month] || 0) + 1;
    });
    
    const mostActiveMonth = Object.entries(monthCounts)
      .sort(([,a], [,b]) => b - a)[0];
    
    if (mostActiveMonth) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      insights.push({
        type: 'seasonal',
        title: 'Peak Leave Season',
        description: `${monthNames[Number(mostActiveMonth[0])]} is your busiest month with ${mostActiveMonth[1]} requests`,
        impact: 'high',
        action: 'Consider staffing adjustments during peak periods'
      });
    }
    
    // Approval rate trend
    const approvalRate = requests.length > 0 
      ? (requests.filter(r => r.status === 'approved').length / requests.length) * 100
      : 0;
    
    if (approvalRate < 80) {
      insights.push({
        type: 'approval',
        title: 'Low Approval Rate',
        description: `Only ${approvalRate.toFixed(1)}% of requests are approved`,
        impact: 'high',
        action: 'Review approval criteria and processes'
      });
    }
    
    // Long pending requests
    const pendingRequests = requests.filter(r => r.status === 'pending');
    const oldPending = pendingRequests.filter(r => {
      const daysSince = (new Date().getTime() - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 7;
    });
    
    if (oldPending.length > 0) {
      insights.push({
        type: 'workflow',
        title: 'Pending Request Backlog',
        description: `${oldPending.length} requests pending for over 7 days`,
        impact: 'medium',
        action: 'Expedite approval workflow and send reminders'
      });
    }
    
    return insights;
  };

  const calculateKPIs = (requests: any[]): KPIs => {
    const totalRequests = requests.length;
    const approvedRequests = requests.filter(r => r.status === 'approved').length;
    const rejectedRequests = requests.filter(r => r.status === 'rejected').length;
    const pendingRequests = requests.filter(r => r.status === 'pending').length;
    
    const totalDays = requests
      .filter(r => r.status === 'approved')
      .reduce((sum, r) => {
        const days = Math.ceil((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;
        return sum + days;
      }, 0);

    const avgProcessingTime = requests
      .filter(r => r.status !== 'pending' && r.reviewed_at)
      .reduce((sum, r) => {
        const hours = (new Date(r.reviewed_at).getTime() - new Date(r.created_at).getTime()) / (1000 * 60 * 60);
        return sum + hours;
      }, 0) / Math.max(1, approvedRequests + rejectedRequests);

    return {
      totalRequests,
      approvedRequests,
      rejectedRequests,
      pendingRequests,
      approvalRate: totalRequests > 0 ? (approvedRequests / totalRequests) * 100 : 0,
      avgDaysPerRequest: approvedRequests > 0 ? totalDays / approvedRequests : 0,
      avgProcessingHours: avgProcessingTime || 0,
      utilizationRate: totalDays // This could be calculated against total available days
    };
  };

  const calculateDepartmentMetrics = (requests: any[]): DepartmentMetric[] => {
    const deptMap = new Map<string, DepartmentMetric>();
    
    requests.forEach(request => {
      const deptName = request.users_profile?.departments?.name || 'Unassigned';
      if (!deptMap.has(deptName)) {
        deptMap.set(deptName, {
          name: deptName,
          requests: 0,
          approved: 0,
          avgDays: 0,
          totalDays: 0,
          approvalRate: 0
        });
      }
      
      const dept = deptMap.get(deptName)!;
      dept.requests++;
      
      if (request.status === 'approved') {
        dept.approved++;
        const days = Math.ceil((new Date(request.end_date).getTime() - new Date(request.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;
        dept.totalDays += days;
      }
    });

    return Array.from(deptMap.values()).map(dept => ({
      ...dept,
      approvalRate: dept.requests > 0 ? (dept.approved / dept.requests) * 100 : 0,
      avgDays: dept.approved > 0 ? dept.totalDays / dept.approved : 0
    }));
  };

  const calculateUserActivity = (requests: any[]): UserActivity[] => {
    const userMap = new Map<string, UserActivity>();
    
    requests.forEach(request => {
      const userName = request.users_profile?.full_name || 'Unknown';
      if (!userMap.has(userName)) {
        userMap.set(userName, {
          name: userName,
          requests: 0,
          days: 0,
          lastRequest: null
        });
      }
      
      const user = userMap.get(userName)!;
      user.requests++;
      user.lastRequest = request.created_at;
      
      if (request.status === 'approved') {
        const days = Math.ceil((new Date(request.end_date).getTime() - new Date(request.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;
        user.days += days;
      }
    });

    return Array.from(userMap.values())
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);
  };

  const getInsightIcon = (type: 'seasonal' | 'approval' | 'workflow'): string => {
    switch (type) {
      case 'seasonal': return '📅';
      case 'approval': return '✅';
      case 'workflow': return '⚡';
      default: return '💡';
    }
  };

  const getImpactColor = (impact: 'high' | 'medium' | 'low'): string => {
    switch (impact) {
      case 'high': return 'var(--danger-600)';
      case 'medium': return 'var(--warning-600)';
      case 'low': return 'var(--success-600)';
      default: return 'var(--primary-600)';
    }
  };

  if (loading) {
    return (
      <div className="app">
        <div className="content">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading analytics...</p>
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
              <span className="title-icon">📈</span>
              Advanced Analytics Dashboard
            </h1>
            <p className="page-subtitle">Predictive insights and data-driven leave management</p>
          </div>
          <div className="page-actions enhanced-actions">
            <select
              className="form-select enhanced-select"
              value={timeRange}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setTimeRange(e.target.value as TimeRange)}
              style={{ width: 'auto', minWidth: '150px' }}
            >
              <option value="3_months">Last 3 Months</option>
              <option value="6_months">Last 6 Months</option>
              <option value="12_months">Last 12 Months</option>
              <option value="24_months">Last 24 Months</option>
            </select>
            <select
              className="form-select enhanced-select"
              value={selectedMetric}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedMetric(e.target.value as MetricType)}
              style={{ width: 'auto', minWidth: '180px' }}
            >
              <option value="leave_utilization">📊 Leave Utilization</option>
              <option value="approval_patterns">✅ Approval Patterns</option>
              <option value="department_trends">🏢 Department Trends</option>
              <option value="seasonal_analysis">📅 Seasonal Analysis</option>
            </select>
          </div>
        </div>

        {/* KPI Overview */}
        <div className="kpi-grid mb-8">
          <div className="kpi-card">
            <div className="kpi-content">
              <div className="kpi-icon">📊</div>
              <div className="kpi-details">
                <h3 className="kpi-title">Total Requests</h3>
                <p className="kpi-value">{analyticsData.kpis.totalRequests}</p>
                <p className="kpi-trend">
                  Approval Rate: {analyticsData.kpis.approvalRate?.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-content">
              <div className="kpi-icon">⏱️</div>
              <div className="kpi-details">
                <h3 className="kpi-title">Avg Processing Time</h3>
                <p className="kpi-value">{analyticsData.kpis.avgProcessingHours?.toFixed(1)}h</p>
                <p className="kpi-trend">
                  Per request approval
                </p>
              </div>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-content">
              <div className="kpi-icon">📅</div>
              <div className="kpi-details">
                <h3 className="kpi-title">Avg Leave Duration</h3>
                <p className="kpi-value">{analyticsData.kpis.avgDaysPerRequest?.toFixed(1)}</p>
                <p className="kpi-trend">
                  Days per request
                </p>
              </div>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-content">
              <div className="kpi-icon">⏳</div>
              <div className="kpi-details">
                <h3 className="kpi-title">Pending Requests</h3>
                <p className="kpi-value">{analyticsData.kpis.pendingRequests}</p>
                <p className="kpi-trend">
                  Awaiting approval
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Trend Analysis */}
        <div className="analytics-section">
          <h2 className="section-title">
            <span className="section-icon">📈</span>
            Trend Analysis & Predictions
          </h2>
          
          <div className="chart-container">
            <div className="chart-header">
              <h3 className="chart-title">Leave Request Trends</h3>
              <p className="chart-subtitle">Historical data with 3-month forecast</p>
            </div>
            
            <div className="trend-chart">
              <div className="chart-grid">
                {([...analyticsData.trends, ...analyticsData.predictions] as (MonthlyTrend | Prediction)[]).map((data, index) => {
                  const isPrediction = index >= analyticsData.trends.length;
                  const maxValue = Math.max(
                    ...analyticsData.trends.map(t => t.requests),
                    ...analyticsData.predictions.map(p => p.predicted_requests || 0)
                  );
                  const height = isPrediction 
                    ? ((data as unknown as Prediction).predicted_requests / maxValue) * 100
                    : ((data as unknown as MonthlyTrend).requests / maxValue) * 100;

                  return (
                    <div key={data.month} className="chart-bar-container">
                      <div className="chart-bar-info">
                        <span className="bar-value">
                          {isPrediction ? (data as unknown as Prediction).predicted_requests : (data as unknown as MonthlyTrend).requests}
                          {isPrediction && (
                            <span className="confidence">
                              ({Math.round((data as unknown as Prediction).confidence * 100)}%)
                            </span>
                          )}
                        </span>
                      </div>
                      <div 
                        className={`chart-bar ${isPrediction ? 'predicted' : 'actual'}`}
                        style={{ height: `${height}%` }}
                      />
                      <div className="bar-label">{data.label}</div>
                    </div>
                  );
                })}
              </div>
              
              <div className="chart-legend">
                <div className="legend-item">
                  <span className="legend-color actual"></span>
                  <span className="legend-text">Historical Data</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color predicted"></span>
                  <span className="legend-text">Predicted Trend</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Insights & Recommendations */}
        {analyticsData.insights.length > 0 && (
          <div className="analytics-section">
            <h2 className="section-title">
              <span className="section-icon">💡</span>
              Smart Insights & Recommendations
            </h2>
            
            <div className="insights-grid">
              {analyticsData.insights.map((insight, index) => (
                <div key={index} className="insight-card">
                  <div className="insight-header">
                    <div className="insight-icon">{getInsightIcon(insight.type)}</div>
                    <div className="insight-meta">
                      <h4 className="insight-title">{insight.title}</h4>
                      <span 
                        className="insight-impact"
                        style={{ color: getImpactColor(insight.impact) }}
                      >
                        {insight.impact.toUpperCase()} IMPACT
                      </span>
                    </div>
                  </div>
                  <p className="insight-description">{insight.description}</p>
                  <div className="insight-action">
                    <span className="action-label">💡 Recommendation:</span>
                    <span className="action-text">{insight.action}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Department Performance */}
        <div className="analytics-section">
          <h2 className="section-title">
            <span className="section-icon">🏢</span>
            Department Performance Matrix
          </h2>
          
          <div className="department-matrix">
            {analyticsData.departmentMetrics.map((dept, index) => (
              <div key={index} className="dept-metric-card">
                <div className="dept-header">
                  <h4 className="dept-name">{dept.name}</h4>
                  <div className="dept-stats">
                    <span className="dept-requests">{dept.requests} requests</span>
                  </div>
                </div>
                
                <div className="dept-metrics">
                  <div className="metric-item">
                    <span className="metric-label">Approval Rate</span>
                    <div className="metric-bar">
                      <div 
                        className="metric-fill"
                        style={{ 
                          width: `${dept.approvalRate}%`,
                          backgroundColor: dept.approvalRate > 80 ? 'var(--success-500)' : 
                                         dept.approvalRate > 60 ? 'var(--warning-500)' : 'var(--danger-500)'
                        }}
                      />
                    </div>
                    <span className="metric-value">{dept.approvalRate.toFixed(1)}%</span>
                  </div>
                  
                  <div className="metric-item">
                    <span className="metric-label">Avg Leave Days</span>
                    <span className="metric-number">{dept.avgDays.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Users Activity */}
        <div className="analytics-section">
          <h2 className="section-title">
            <span className="section-icon">👥</span>
            User Activity Patterns
          </h2>
          
          <div className="activity-list">
            {analyticsData.userActivity.slice(0, 8).map((user, index) => (
              <div key={index} className="activity-item">
                <div className="activity-rank">#{index + 1}</div>
                <div className="activity-details">
                  <span className="activity-name">{user.name}</span>
                  <span className="activity-meta">
                    {user.requests} requests • {user.days} days total
                  </span>
                </div>
                <div className="activity-chart">
                  <div 
                    className="activity-bar"
                    style={{ 
                      width: `${analyticsData.userActivity[0] ? (user.requests / analyticsData.userActivity[0].requests) * 100 : 0}%` 
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
