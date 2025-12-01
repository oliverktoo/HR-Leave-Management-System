import '../styles/loading.css';

export const LoadingScreen = () => {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-logo-container">
          <img 
            src="/fkf-logo.jpeg" 
            alt="FKF Logo" 
            className="loading-logo"
          />
        </div>
        <h2 className="loading-title">FKF HR</h2>
        <p className="loading-subtitle">Leave Management System</p>
        <div className="loading-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
        <p className="loading-text">Loading...</p>
      </div>
    </div>
  );
};
