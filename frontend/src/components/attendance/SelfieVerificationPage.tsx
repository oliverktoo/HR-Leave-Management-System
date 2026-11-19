// SelfieVerificationPage — HR/supervisor page to review and verify clock-in selfies

import { useState } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import { SelfieVerificationPanel } from './SelfieVerificationPanel';

export function SelfieVerificationPage() {
  const [activeTab, setActiveTab] = useState<'attendance' | 'field'>('attendance');

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main">
        <div style={{ padding: '24px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--gray-900)' }}>
                🤳 Selfie Verification
              </h1>
              <p style={{ margin: '4px 0 0', color: 'var(--gray-500)', fontSize: '0.875rem' }}>
                Review and verify employee clock-in selfies. Flag suspicious entries for investigation.
              </p>
            </div>
            <NotificationBell />
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid var(--gray-200)', paddingBottom: '0' }}>
            <button
              onClick={() => setActiveTab('attendance')}
              style={{
                padding: '10px 20px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontWeight: activeTab === 'attendance' ? 700 : 400,
                color: activeTab === 'attendance' ? 'var(--primary-600)' : 'var(--gray-500)',
                borderBottom: activeTab === 'attendance' ? '2px solid var(--primary-600)' : '2px solid transparent',
                marginBottom: '-2px',
                fontSize: '0.9rem',
              }}
            >
              🕐 Office Check-In Selfies
            </button>
            <button
              onClick={() => setActiveTab('field')}
              style={{
                padding: '10px 20px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontWeight: activeTab === 'field' ? 700 : 400,
                color: activeTab === 'field' ? 'var(--primary-600)' : 'var(--gray-500)',
                borderBottom: activeTab === 'field' ? '2px solid var(--primary-600)' : '2px solid transparent',
                marginBottom: '-2px',
                fontSize: '0.9rem',
              }}
            >
              📍 Field Assignment Selfies
            </button>
          </div>

          {/* Panel */}
          <SelfieVerificationPanel type={activeTab} />
        </div>
      </div>
    </div>
  );
}
