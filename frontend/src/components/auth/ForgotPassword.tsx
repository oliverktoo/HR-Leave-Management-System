import { Link } from 'react-router-dom';

export const ForgotPassword = () => {
  return (
    <div className="app login-app">
      <div className="login-container">
        <div className="login-brand">
          <div className="brand-content">
            <div className="brand-logo">
              <div className="logo-icon">🔐</div>
              <h1 className="brand-title">Password Reset</h1>
            </div>
            <h2 className="brand-subtitle">Need access?</h2>
            <p className="brand-description">
              Contact your HR department or system administrator to have your password reset.
            </p>
          </div>
        </div>

        <div className="login-form-container">
          <div className="login-form-content">
            <div className="form-header">
              <h3 className="form-title">Forgot your password?</h3>
              <p className="form-subtitle">Self-service password reset is disabled.</p>
            </div>

            <div className="alert alert-info" style={{ marginBottom: '1.5rem', lineHeight: 1.6 }}>
              <strong>To reset your password:</strong>
              <ol style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
                <li>Contact your HR department or system administrator</li>
                <li>They will generate a new temporary password for you</li>
                <li>Log in with the temporary password</li>
                <li>You will be prompted to set a new password on first login</li>
              </ol>
            </div>

            <Link to="/login" className="btn btn-primary btn-block">
              ← Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
