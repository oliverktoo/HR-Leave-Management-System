import { useState, FormEvent, ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { resetPassword } from '../../services/authService';

export const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await resetPassword(email);

    if (error) {
      setError(error.message || 'Failed to send reset email.');
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="app login-app">
        <div className="login-container">
          <div className="login-brand">
            <div className="brand-content">
              <div className="brand-logo">
                <div className="logo-icon">📧</div>
                <h1 className="brand-title">Email Sent</h1>
              </div>
              <h2 className="brand-subtitle">Check your inbox</h2>
              <p className="brand-description">
                We've sent password reset instructions to your email address.
              </p>
            </div>
          </div>
          <div className="login-form-container">
            <div className="login-form-content">
              <div className="alert alert-success mb-6">
                Password reset email sent! Check your inbox for instructions.
              </div>
              <div className="action-buttons justify-center">
                <Link to="/login" className="btn btn-primary">
                  ← Back to Login
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app login-app">
      <div className="login-container">
        {/* Left side - Branding */}
        <div className="login-brand">
          <div className="brand-content">
            <div className="brand-logo">
              <div className="logo-icon">🔐</div>
              <h1 className="brand-title">Reset</h1>
            </div>
            <h2 className="brand-subtitle">Password Recovery</h2>
            <p className="brand-description">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>
        </div>

        {/* Right side - Reset Form */}
        <div className="login-form-container">
          <div className="login-form-content">
            <div className="form-header">
              <h3 className="form-title">Forgot Password</h3>
              <p className="form-subtitle">Enter your email to receive reset instructions</p>
            </div>

            {error && (
              <div className="alert alert-danger">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="email" className="form-label">
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  className="form-input"
                  placeholder="Enter your email address"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary btn-block"
              >
                {loading ? (
                  <>
                    <span className="loading-spinner mr-2"></span>
                    Sending...
                  </>
                ) : (
                  'Send Reset Link'
                )}
              </button>

              <div className="form-footer">
                <p className="help-text">
                  Remember your password?{' '}
                  <Link to="/login" className="text-primary font-semibold">
                    Back to Login
                  </Link>
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
