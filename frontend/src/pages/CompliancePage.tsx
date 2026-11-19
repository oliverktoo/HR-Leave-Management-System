import React from 'react';
import { Shield, FileText, Calendar, BarChart3 } from 'lucide-react';
import { AdminSidebar } from '../components/admin/AdminSidebar';
import { ComplianceDashboard } from '../components/compliance/ComplianceDashboard';
import { LicenseTracker } from '../components/compliance/LicenseTracker';
import { DocumentManager } from '../components/compliance/DocumentManager';
import { AlertsManager } from '../components/compliance/AlertsManager';

export const CompliancePage: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState('dashboard');

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'licenses', label: 'Driver Licenses', icon: Calendar },
    { id: 'documents', label: 'Vehicle Documents', icon: FileText },
    { id: 'alerts', label: 'Compliance Alerts', icon: Shield }
  ];

  return (
    <div className="app">
      <AdminSidebar />

      <div className="content">
        <div className="page-header">
          <div className="header-content">
            <h1 className="page-title">Fleet Compliance Management</h1>
            <p className="page-subtitle">
              Monitor and manage driver licenses, vehicle documents, and compliance alerts
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="compliance-tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                  >
                    <Icon className="tab-icon" />
                    <span className="tab-label">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="tab-content">
              {activeTab === 'dashboard' && <ComplianceDashboard />}

              {activeTab === 'licenses' && (
                <div className="tab-section">
                  <div className="section-header">
                    <h2 className="section-title">Driver License Management</h2>
                    <p className="section-description">Track and manage driver license information and expiry dates</p>
                  </div>
                  <div className="section-content">
                    <LicenseTracker showAllDrivers={true} />
                  </div>
                </div>
              )}

              {activeTab === 'documents' && (
                <div className="tab-section">
                  <div className="section-header">
                    <h2 className="section-title">Vehicle Document Management</h2>
                    <p className="section-description">Manage vehicle registration, insurance, and other compliance documents</p>
                  </div>
                  <div className="section-content">
                    <DocumentManager showAllVehicles={true} />
                  </div>
                </div>
              )}

              {activeTab === 'alerts' && (
                <div className="tab-section">
                  <div className="section-content">
                    <AlertsManager />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};