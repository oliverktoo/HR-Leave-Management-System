import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface PasswordResetModalProps {
  userId: string;
  userEmail: string;
  userName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const PasswordResetModal = ({ userId: _userId, userEmail, userName, onClose, onSuccess }: PasswordResetModalProps) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const generatePassword = () => {
    const password = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10).toUpperCase() + '123!';
    setNewPassword(password);
    setConfirmPassword(password);
  };

  const handleResetPassword = async () => {
    setError('');
    setSuccess('');

    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      // Use Supabase RPC function to reset password
      const { data, error: rpcError } = await supabase.rpc('reset_employee_password', {
        p_email: userEmail,
        p_new_password: newPassword
      });

      if (rpcError) throw rpcError;
      
      if (data && !data.success) {
        throw new Error(data.error || 'Failed to reset password');
      }

      setSuccess('Password reset successfully! The user will be prompted to change their password on next login. Please share the temporary password with them securely.');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2500);
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError(err.message || 'Failed to reset password. Make sure you have HR admin permissions.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(newPassword);
    alert('Password copied to clipboard!');
  };

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div className="modal-header">
          <h3>Reset Password</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="user-info-box" style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
            <p><strong>User:</strong> {userName}</p>
            <p><strong>Email:</strong> {userEmail}</p>
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
              <span>⚠️</span> {error}
            </div>
          )}

          {success && (
            <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
              <span>✓</span> {success}
            </div>
          )}

          <div className="form-group">
            <label>New Password *</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="form-control"
                placeholder="Enter new password (min 8 characters)"
                disabled={loading}
              />
              <button
                type="button"
                onClick={generatePassword}
                className="btn btn-secondary"
                disabled={loading}
                style={{ whiteSpace: 'nowrap' }}
              >
                🎲 Generate
              </button>
            </div>
            <small style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Must be at least 8 characters long
            </small>
          </div>

          <div className="form-group">
            <label>Confirm Password *</label>
            <input
              type="text"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="form-control"
              placeholder="Confirm new password"
              disabled={loading}
            />
          </div>

          {newPassword && newPassword === confirmPassword && (
            <div style={{ background: 'var(--success-50)', border: '1px solid var(--success-200)', padding: '1rem', borderRadius: '8px', marginTop: '1rem' }}>
              <p style={{ margin: 0, marginBottom: '0.5rem', fontWeight: 600 }}>📋 Share this password securely:</p>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <code style={{ flex: 1, padding: '0.5rem', background: 'white', borderRadius: '4px', fontSize: '1rem' }}>
                  {newPassword}
                </code>
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="btn btn-sm btn-secondary"
                >
                  📋 Copy
                </button>
              </div>
            </div>
          )}

          <div style={{ background: 'var(--info-50)', border: '1px solid var(--info-200)', padding: '0.75rem', borderRadius: '8px', marginTop: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--info-800)', marginBottom: '0.5rem' }}>
              🔐 <strong>Automatic Password Change:</strong> When the user logs in with this temporary password, they will be automatically prompted to create their own secure password before accessing the system.
            </p>
          </div>

          <div style={{ background: 'var(--warning-50)', border: '1px solid var(--warning-200)', padding: '0.75rem', borderRadius: '8px', marginTop: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--warning-800)' }}>
              ⚠️ <strong>Important:</strong> Make sure to securely share the new password with the user via phone, WhatsApp, or in-person. Do not send via email.
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleResetPassword}
            disabled={loading || !newPassword || newPassword !== confirmPassword}
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </div>
      </div>
    </div>
  );
};
