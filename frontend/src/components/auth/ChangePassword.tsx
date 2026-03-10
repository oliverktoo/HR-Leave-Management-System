import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

export const ChangePassword = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [isForced, setIsForced] = useState(false);

  useEffect(() => {
    // Check if this is a forced password change (after admin reset)
    if (profile?.must_change_password) {
      setIsForced(true);
    }
  }, [profile]);

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one number';
    }
    if (!/[!@#$%^&*]/.test(password)) {
      return 'Password must contain at least one special character (!@#$%^&*)';
    }
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate new password
    const validationError = validatePassword(newPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Check passwords match
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    // Check not same as current (only if not forced change)
    if (!isForced && newPassword === currentPassword) {
      setError('New password must be different from current password');
      return;
    }

    try {
      setLoading(true);

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) throw updateError;

      // Mark password as changed in user metadata
      await supabase.auth.updateUser({
        data: { password_changed: true }
      });

      // If this was a forced password change, clear the flag
      if (isForced) {
        const { data, error: clearError } = await supabase.rpc('clear_must_change_password');
        if (clearError) {
          console.error('Error clearing password flag:', clearError);
        }
      }

      alert('Password changed successfully! You can now access the system.');
      
      // Refresh the page to update the auth context
      window.location.href = '/dashboard';
      
    } catch (err) {
      console.error('Password change error:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app login-app">
      <div className="login-container">
        <div className="login-card change-password-card">
          <div className="login-header change-password-header">
            <div className="lock-icon-wrapper">
              <span className="lock-icon">🔐</span>
            </div>
            <h1 className="login-title">{isForced ? 'Password Reset Required' : 'Change Your Password'}</h1>
            <p className="login-subtitle">
              {isForced 
                ? 'Your password was reset by an administrator. For security, you must create a new password before accessing the system.'
                : 'For security reasons, you must change your password before accessing the system.'}
            </p>
          </div>

          {error && (
            <div className="alert alert-danger">
              <span className="alert-icon">⚠️</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form change-password-form">
            {!isForced && (
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  className="form-input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  placeholder="Enter your current password"
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                type={showPasswords ? 'text' : 'password'}
                className="form-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="Enter new password"
              />
              <small className="form-help">
                Must be 8+ characters with uppercase, lowercase, number, and special character
              </small>
            </div>

            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <input
                type={showPasswords ? 'text' : 'password'}
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Confirm new password"
              />
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showPasswords}
                  onChange={(e) => setShowPasswords(e.target.checked)}
                />
                <span>Show passwords</span>
              </label>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={loading}
            >
              {loading ? 'Changing Password...' : 'Change Password'}
            </button>
          </form>

          <div className="password-requirements">
            <h4>Password Requirements:</h4>
            <ul>
              <li className={newPassword.length >= 8 ? 'valid' : ''}>
                At least 8 characters
              </li>
              <li className={/[A-Z]/.test(newPassword) ? 'valid' : ''}>
                One uppercase letter (A-Z)
              </li>
              <li className={/[a-z]/.test(newPassword) ? 'valid' : ''}>
                One lowercase letter (a-z)
              </li>
              <li className={/[0-9]/.test(newPassword) ? 'valid' : ''}>
                One number (0-9)
              </li>
              <li className={/[!@#$%^&*]/.test(newPassword) ? 'valid' : ''}>
                One special character (!@#$%^&*)
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
