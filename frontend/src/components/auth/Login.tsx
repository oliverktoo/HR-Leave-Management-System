import { useState, FormEvent, ChangeEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signIn } from '../../services/authService';
import { getUserProfile } from '../../services/authService';

type LoginType = 'staff' | 'admin';

interface LoginFormData {
  email: string;
  password: string;
}

export const Login = () => {
  const navigate = useNavigate();
  const [loginType, setLoginType] = useState<LoginType>('staff');
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error } = await signIn(formData.email, formData.password);

    if (error) {
      setError(error.message || 'Failed to sign in. Please check your credentials.');
      setLoading(false);
    } else if (data?.user) {
      // Check if user needs to change password (first login)
      const passwordChanged = data.user.user_metadata?.password_changed;
      
      if (!passwordChanged) {
        // Redirect to change password page
        navigate('/change-password');
        return;
      }

      // Fetch user profile to check role
      const { data: profile, error: profileError } = await getUserProfile(data.user.id);
      
      if (profileError) {
        setError('Failed to load user profile. Please try again.');
        setLoading(false);
        return;
      }

      if (!profile) {
        setError('User profile not found. Please contact HR.');
        setLoading(false);
        return;
      }

      // Validate role based on login type
      if (loginType === 'admin') {
        if (profile.role === 'hr_admin' || profile.role === 'super_admin') {
          navigate('/admin/dashboard');
        } else {
          setError('Access denied. This login is for HR Administrators only.');
          setLoading(false);
        }
      } else {
        // Staff login - all roles can access
        if (profile.role === 'hr_admin' || profile.role === 'super_admin') {
          // HR Admin and Super Admin can choose, redirect to admin dashboard
          navigate('/admin/dashboard');
        } else {
          navigate('/dashboard');
        }
      }
    }
  };

  return (
    <div className="app login-app">
      <div className="login-container">
        {/* Left side - Branding */}
        <div className="login-brand">
          <div className="brand-content">
            <div className="brand-logo-container">
              <img 
                src="/fkf-logo.jpeg" 
                alt="FKF Logo" 
                className="brand-logo-image"
              />
              <h1 className="brand-title">FKF HR</h1>
              <h2 className="brand-subtitle">Leave Management System</h2>
            </div>
          </div>
        </div>

        {/* Right side - Login Form */}
        <div className="login-form-container">
          <div className="login-form-content">
            <div className="form-header">
              <h3 className="form-title">Welcome back</h3>
              <p className="form-subtitle">Sign in to your account to continue</p>
            </div>

            {/* Login Type Tabs */}
            <div className="login-tabs">
              <button
                type="button"
                className={`login-tab ${loginType === 'staff' ? 'active' : ''}`}
                onClick={() => {
                  setLoginType('staff');
                  setError('');
                }}
              >
                <span className="tab-icon">👥</span>
                <span className="tab-text">Staff Login</span>
              </button>
              <button
                type="button"
                className={`login-tab ${loginType === 'admin' ? 'active' : ''}`}
                onClick={() => {
                  setLoginType('admin');
                  setError('');
                }}
              >
                <span className="tab-icon">🔐</span>
                <span className="tab-text">Admin Login</span>
              </button>
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
                  value={formData.email}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="Enter your email address"
                />
              </div>

              <div className="form-group">
                <label htmlFor="password" className="form-label">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="Enter your password"
                />
              </div>

              <div className="form-actions">
                <Link
                  to="/forgot-password"
                  className="forgot-password-link"
                >
                  Forgot your password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary btn-block"
              >
                {loading ? (
                  <>
                    <span className="loading-spinner mr-2"></span>
                    Signing in...
                  </>
                ) : (
                  loginType === 'admin' ? 'Sign In as Admin' : 'Sign In'
                )}
              </button>

              <div className="form-footer">
                <p className="help-text">
                  {loginType === 'admin' ? (
                    <>
                      <span className="text-warning">⚠️ Admin access only.</span>{' '}
                      Staff should use the Staff Login tab.
                    </>
                  ) : (
                    <>
                      Don't have an account?{' '}
                      <span className="text-primary font-semibold">Contact your HR Administrator</span>
                    </>
                  )}
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
