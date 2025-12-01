import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

/**
 * DEBUG COMPONENT - Use this to diagnose dashboard issues
 * 
 * To use:
 * 1. Temporarily replace AdminDashboard import in App.tsx with this component
 * 2. Check what data is actually being returned
 * 3. Check for any error messages
 */

export const DebugDashboard = () => {
  const { user, profile } = useAuth();
  const [debugInfo, setDebugInfo] = useState<any>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkDashboardAccess();
  }, []);

  const checkDashboardAccess = async () => {
    try {
      console.log('=== DEBUG: Starting Dashboard Check ===');
      console.log('User:', user);
      console.log('Profile:', profile);

      // Test 1: Can we count users?
      const usersTest = await supabase
        .from('users_profile')
        .select('id, role, is_active', { count: 'exact' })
        .neq('role', 'super_admin');
      
      console.log('Users Query Result:', usersTest);

      // Test 2: Can we count departments?
      const deptsTest = await supabase
        .from('departments')
        .select('id', { count: 'exact' });
      
      console.log('Departments Query Result:', deptsTest);

      // Test 3: Can we get leave requests?
      const requestsTest = await supabase
        .from('leave_requests')
        .select('id, status', { count: 'exact' })
        .limit(5);
      
      console.log('Leave Requests Query Result:', requestsTest);

      // Test 4: Can we get recent activity?
      const activityTest = await supabase
        .from('leave_requests')
        .select(`
          id,
          status,
          users_profile!leave_requests_user_id_fkey(first_name, last_name),
          leave_types(name)
        `)
        .limit(5);
      
      console.log('Recent Activity Query Result:', activityTest);

      setDebugInfo({
        auth: {
          userId: user?.id,
          email: user?.email,
          role: profile?.role,
          firstName: profile?.first_name,
          lastName: profile?.last_name
        },
        queries: {
          users: {
            count: usersTest.count,
            error: usersTest.error?.message,
            sampleData: usersTest.data?.slice(0, 3)
          },
          departments: {
            count: deptsTest.count,
            error: deptsTest.error?.message
          },
          requests: {
            count: requestsTest.count,
            error: requestsTest.error?.message,
            sampleData: requestsTest.data
          },
          activity: {
            count: activityTest.data?.length || 0,
            error: activityTest.error?.message,
            sampleData: activityTest.data
          }
        }
      });

      console.log('=== DEBUG: All Tests Complete ===');
      console.log('Debug Info:', debugInfo);

    } catch (err: any) {
      console.error('=== DEBUG: Error ===', err);
      setError(err.message);
    }
  };

  return (
    <div className="app" style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>🔍 Dashboard Debug Information</h1>
      
      <div style={{ 
        background: '#f5f5f5', 
        padding: '1rem', 
        marginTop: '1rem',
        borderRadius: '8px',
        border: '2px solid #ddd'
      }}>
        <h2>Authentication Status</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>User ID:</td>
              <td style={{ padding: '0.5rem' }}>{debugInfo.auth?.userId || 'Not loaded'}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>Email:</td>
              <td style={{ padding: '0.5rem' }}>{debugInfo.auth?.email || 'Not loaded'}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>Role:</td>
              <td style={{ padding: '0.5rem', color: 'blue', fontWeight: 'bold' }}>
                {debugInfo.auth?.role || 'Not loaded'}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>Name:</td>
              <td style={{ padding: '0.5rem' }}>
                {debugInfo.auth?.firstName} {debugInfo.auth?.lastName}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ 
        background: '#e8f5e9', 
        padding: '1rem', 
        marginTop: '1rem',
        borderRadius: '8px',
        border: '2px solid #4caf50'
      }}>
        <h2>Database Access Test Results</h2>
        
        <div style={{ marginTop: '1rem' }}>
          <h3>✅ Users Table</h3>
          <p>Count: <strong>{debugInfo.queries?.users?.count ?? 'Loading...'}</strong></p>
          {debugInfo.queries?.users?.error && (
            <p style={{ color: 'red' }}>❌ Error: {debugInfo.queries.users.error}</p>
          )}
          <details>
            <summary>Sample Data</summary>
            <pre style={{ background: '#fff', padding: '1rem', overflow: 'auto' }}>
              {JSON.stringify(debugInfo.queries?.users?.sampleData, null, 2)}
            </pre>
          </details>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <h3>🏢 Departments Table</h3>
          <p>Count: <strong>{debugInfo.queries?.departments?.count ?? 'Loading...'}</strong></p>
          {debugInfo.queries?.departments?.error && (
            <p style={{ color: 'red' }}>❌ Error: {debugInfo.queries.departments.error}</p>
          )}
        </div>

        <div style={{ marginTop: '1rem' }}>
          <h3>📋 Leave Requests Table</h3>
          <p>Count: <strong>{debugInfo.queries?.requests?.count ?? 'Loading...'}</strong></p>
          {debugInfo.queries?.requests?.error && (
            <p style={{ color: 'red' }}>❌ Error: {debugInfo.queries.requests.error}</p>
          )}
          <details>
            <summary>Sample Data</summary>
            <pre style={{ background: '#fff', padding: '1rem', overflow: 'auto' }}>
              {JSON.stringify(debugInfo.queries?.requests?.sampleData, null, 2)}
            </pre>
          </details>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <h3>⏱️ Recent Activity</h3>
          <p>Count: <strong>{debugInfo.queries?.activity?.count ?? 'Loading...'}</strong></p>
          {debugInfo.queries?.activity?.error && (
            <p style={{ color: 'red' }}>❌ Error: {debugInfo.queries.activity.error}</p>
          )}
          <details>
            <summary>Sample Data</summary>
            <pre style={{ background: '#fff', padding: '1rem', overflow: 'auto' }}>
              {JSON.stringify(debugInfo.queries?.activity?.sampleData, null, 2)}
            </pre>
          </details>
        </div>
      </div>

      {error && (
        <div style={{ 
          background: '#ffebee', 
          padding: '1rem', 
          marginTop: '1rem',
          borderRadius: '8px',
          border: '2px solid #f44336',
          color: '#c62828'
        }}>
          <h2>❌ Error Detected</h2>
          <p>{error}</p>
        </div>
      )}

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#fff3cd', borderRadius: '8px' }}>
        <h3>📝 Instructions:</h3>
        <ol>
          <li>Check the console (F12) for detailed logs</li>
          <li>Verify your role shows as "super_admin"</li>
          <li>Check if any queries show errors</li>
          <li>Verify counts are greater than 0</li>
          <li>If everything looks good, the dashboard should work - try refreshing</li>
        </ol>
        <p><strong>Open DevTools Console (F12) to see detailed query results</strong></p>
      </div>

      <button 
        onClick={checkDashboardAccess}
        style={{
          marginTop: '1rem',
          padding: '1rem 2rem',
          background: '#2196F3',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '1rem',
          fontWeight: 'bold'
        }}
      >
        🔄 Re-run Tests
      </button>
    </div>
  );
};

export default DebugDashboard;
