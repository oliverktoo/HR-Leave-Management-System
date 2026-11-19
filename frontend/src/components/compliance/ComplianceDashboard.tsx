import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  Car,
  RefreshCw,
  Bell,
} from 'lucide-react';
import {
  getComplianceDashboardData,
  acknowledgeAlert,
  resolveAlert,
  generateComplianceAlerts
} from '@/services/complianceService';
import { ComplianceDashboardData, ComplianceAlert } from '@/types/fleetPhase3';

export const ComplianceDashboard: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<ComplianceDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('alerts');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const data = await getComplianceDashboardData();
      setDashboardData(data);
    } catch (error) {
      console.error('Error loading compliance dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadDashboardData();
      console.log('Dashboard data refreshed successfully');
    } catch (error) {
      // Error already handled in loadDashboardData
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleGenerateAlerts = async () => {
    try {
      const result = await generateComplianceAlerts();
      console.log(`Generated ${result.alerts_created} new compliance alerts`);
      await loadDashboardData(); // Refresh data
    } catch (error) {
      console.error('Failed to generate compliance alerts:', error);
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await acknowledgeAlert(alertId);
      console.log('Alert acknowledged successfully');
      await loadDashboardData();
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      await resolveAlert(alertId);
      console.log('Alert resolved successfully');
      await loadDashboardData();
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8">Loading compliance dashboard...</div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <div className="ml-3">
            <p className="text-sm text-red-700">
              Failed to load compliance dashboard data. Please try refreshing the page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { summary, recent_alerts, expiring_soon, vehicle_compliance, driver_compliance } = dashboardData;

  return (
    <div className="compliance-dashboard">
      <div className="page-header">
        <div className="header-content">
          <h1 className="page-title">Compliance Dashboard</h1>
          <p className="page-subtitle">Monitor fleet compliance and manage alerts</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={handleGenerateAlerts}>
            <Bell className="w-4 h-4 mr-2" />
            Generate Alerts
          </button>
          <button className="btn btn-outline" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="stats-card">
          <div className="stats-header">
            <div>
              <p className="stats-title">Active Alerts</p>
              <p className="stats-value text-danger">{summary.active_alerts}</p>
            </div>
            <div className="stats-icon stats-icon-danger">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
          <p className="stats-change">
            {summary.critical_alerts} critical, {summary.high_priority_alerts} high priority
          </p>
        </div>

        <div className="stats-card">
          <div className="stats-header">
            <div>
              <p className="stats-title">Expiring This Week</p>
              <p className="stats-value text-warning">{summary.expiring_this_week}</p>
            </div>
            <div className="stats-icon stats-icon-warning">
              <Clock className="w-6 h-6" />
            </div>
          </div>
          <p className="stats-change">Licenses and documents</p>
        </div>

        <div className="stats-card">
          <div className="stats-header">
            <div>
              <p className="stats-title">Resolved Today</p>
              <p className="stats-value text-success">{summary.resolved_today}</p>
            </div>
            <div className="stats-icon stats-icon-success">
              <CheckCircle className="w-6 h-6" />
            </div>
          </div>
          <p className="stats-change">Compliance issues fixed</p>
        </div>

        <div className="stats-card">
          <div className="stats-header">
            <div>
              <p className="stats-title">Total Alerts</p>
              <p className="stats-value text-primary">{summary.total_alerts}</p>
            </div>
            <div className="stats-icon stats-icon-primary">
              <Bell className="w-6 h-6" />
            </div>
          </div>
          <p className="stats-change">{summary.acknowledged_alerts} acknowledged</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header flex items-center justify-between">
          <div>
            <h2 className="card-title">Recent Compliance Alerts</h2>
            <p className="text-muted">View and triage compliance issues requiring attention</p>
          </div>
          <div className="subtab-nav">
            {[
              { id: 'alerts', label: 'Active Alerts', icon: AlertTriangle },
              { id: 'expiring', label: 'Expiring Soon', icon: Clock },
              { id: 'vehicles', label: 'Vehicle Compliance', icon: Car },
              { id: 'drivers', label: 'Driver Compliance', icon: Users }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`subtab-item ${activeTab === tab.id ? 'active' : ''}`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="card-body">
          {activeTab === 'alerts' && (
            <div className="space-y-4">
              {recent_alerts.length === 0 ? (
                <div className="alert alert-success">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    <p>No active compliance alerts. All systems are compliant!</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {recent_alerts.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onAcknowledge={() => handleAcknowledgeAlert(alert.id)}
                      onResolve={() => handleResolveAlert(alert.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'expiring' && (
            <div className="space-y-4">
              {expiring_soon.length === 0 ? (
                <div className="alert alert-success">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    <p>No items expiring in the next 30 days.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {expiring_soon.map((item) => (
                    <ExpiringItemCard key={`${item.type}-${item.id}`} item={item} />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'vehicles' && (
            <div className="space-y-4">
              {vehicle_compliance.length === 0 ? (
                <div className="alert alert-info">
                  <div className="flex items-center gap-2">
                    <Car className="w-5 h-5" />
                    <p>No vehicles found in the system.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {vehicle_compliance.map((vehicle) => (
                    <VehicleComplianceCard key={vehicle.vehicle_id} vehicle={vehicle} />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'drivers' && (
            <div className="space-y-4">
              {driver_compliance.length === 0 ? (
                <div className="alert alert-info">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    <p>No drivers found in the system.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {driver_compliance.map((driver) => (
                    <DriverComplianceCard key={driver.driver_id} driver={driver} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper Components

interface AlertCardProps {
  alert: ComplianceAlert;
  onAcknowledge: () => void;
  onResolve: () => void;
}

const AlertCard: React.FC<AlertCardProps> = ({ alert, onAcknowledge, onResolve }) => {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Active</span>;
      case 'acknowledged': return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Acknowledged</span>;
      case 'resolved': return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Resolved</span>;
      default: return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  return (
    <div className={`border-l-4 p-4 rounded-r-md ${getPriorityColor(alert.alert_priority)}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800 capitalize">{alert.alert_type}</span>
            {getStatusBadge(alert.status)}
          </div>
          <h4 className="font-medium mb-1">{alert.title}</h4>
          <p className="text-sm text-gray-600 mb-2">{alert.description}</p>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            {alert.vehicle && (
              <span>🚗 {alert.vehicle.make} {alert.vehicle.model} ({alert.vehicle.plate_number})</span>
            )}
            {alert.driver && (
              <span>👤 {alert.driver.first_name} {alert.driver.last_name}</span>
            )}
            {alert.due_date && (
              <span>📅 Due: {new Date(alert.due_date).toLocaleDateString()}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {alert.status === 'active' && (
            <button
              className="px-3 py-1 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              onClick={onAcknowledge}
            >
              Acknowledge
            </button>
          )}
          {alert.status !== 'resolved' && (
            <button
              className="px-3 py-1 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
              onClick={onResolve}
            >
              Resolve
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface ExpiringItemCardProps {
  item: {
    type: 'license' | 'document';
    id: string;
    name: string;
    expiry_date: string;
    days_until_expiry: number;
  };
}

const ExpiringItemCard: React.FC<ExpiringItemCardProps> = ({ item }) => {
  const getUrgencyColor = (days: number) => {
    if (days < 0) return 'text-red-600 bg-red-50 border-red-200';
    if (days <= 7) return 'text-red-600 bg-red-50 border-red-200';
    if (days <= 30) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-blue-600 bg-blue-50 border-blue-200';
  };

  const getBadgeVariant = (days: number) => {
    if (days < 0) return 'bg-red-100 text-red-800';
    if (days <= 7) return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className={`border-l-4 p-4 rounded-r-md ${getUrgencyColor(item.days_until_expiry)}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-2xl">
            {item.type === 'license' ? '🚗' : '📄'}
          </div>
          <div>
            <h4 className="font-medium">{item.name}</h4>
            <p className="text-sm text-gray-600">
              Expires: {new Date(item.expiry_date).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getBadgeVariant(item.days_until_expiry)}`}>
            {item.days_until_expiry < 0 ? 'Expired' : `${item.days_until_expiry} days`}
          </span>
        </div>
      </div>
    </div>
  );
};

interface VehicleComplianceCardProps {
  vehicle: {
    vehicle_id: string;
    plate_number: string;
    total_documents: number;
    active_documents: number;
    expiring_documents: number;
    expired_documents: number;
    compliance_score: number;
  };
}

const VehicleComplianceCard: React.FC<VehicleComplianceCardProps> = ({ vehicle }) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-medium">{vehicle.plate_number}</h4>
          <p className="text-sm text-gray-600">
            {vehicle.active_documents}/{vehicle.total_documents} documents active
          </p>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${getScoreColor(vehicle.compliance_score)}`}>
            {vehicle.compliance_score}%
          </div>
          <p className="text-xs text-gray-500">Compliance Score</p>
        </div>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
        <div
          className={`h-2 rounded-full ${vehicle.compliance_score >= 80 ? 'bg-green-600' : vehicle.compliance_score >= 60 ? 'bg-yellow-600' : 'bg-red-600'}`}
          style={{ width: `${vehicle.compliance_score}%` }}
        ></div>
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{vehicle.expired_documents} expired</span>
        <span>{vehicle.expiring_documents} expiring soon</span>
      </div>
    </div>
  );
};

import type { DriverComplianceStatus } from '@/types/fleetPhase3';

interface DriverComplianceCardProps {
  driver: DriverComplianceStatus;
}

const DriverComplianceCard: React.FC<DriverComplianceCardProps> = ({ driver }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'valid': return 'text-green-600';
      case 'expiring_soon': return 'text-yellow-600';
      case 'expired': return 'text-red-600';
      case 'no_license': return 'text-gray-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'valid': return '✅';
      case 'expiring_soon': return '⚠️';
      case 'expired': return '❌';
      case 'no_license': return '❓';
      default: return '❓';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-medium">{driver.driver_name}</h4>
          <p className="text-sm text-gray-600">
            {driver.license_status === 'no_license' ? 'No license on record' :
             driver.days_until_expiry !== null ? `${driver.days_until_expiry} days until expiry` :
             'License status unknown'}
          </p>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${getStatusColor(driver.license_status)}`}>
            {getStatusIcon(driver.license_status)}
          </div>
          <p className="text-xs text-gray-500 capitalize">
            {driver.license_status.replace('_', ' ')}
          </p>
        </div>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">
          Compliance Score: {driver.compliance_score}%
        </span>
        {driver.active_alerts > 0 && (
          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
            {driver.active_alerts} active alerts
          </span>
        )}
      </div>
    </div>
  );
};