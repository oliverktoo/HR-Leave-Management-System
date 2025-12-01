import { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';

interface LoadingFallbackProps {
  children: ReactNode;
}

const LoadingFallback = ({ children }: LoadingFallbackProps) => {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <div className="app">
        <div className="content">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // If not loading but no user, let the auth flow handle it
  if (!user) {
    return children;
  }

  return children;
};

export default LoadingFallback;
