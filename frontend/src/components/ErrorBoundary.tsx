import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(_error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="app">
          <div className="content">
            <div className="card text-center" style={{ maxWidth: '600px', margin: '2rem auto' }}>
              <div className="card-header">
                <h3 className="card-title text-danger">⚠️ Something went wrong</h3>
              </div>
              <div className="card-body">
                <p className="text-muted mb-4">
                  An error occurred while loading this page. This might be due to:
                </p>
                <ul className="text-left mb-4" style={{ maxWidth: '400px', margin: '0 auto' }}>
                  <li>Network connection issues</li>
                  <li>Server configuration problems</li>
                  <li>CORS (Cross-Origin) restrictions</li>
                  <li>Authentication session expired</li>
                </ul>
                <div className="action-buttons justify-center">
                  <button 
                    onClick={() => window.location.reload()} 
                    className="btn btn-primary"
                  >
                    🔄 Refresh Page
                  </button>
                  <button 
                    onClick={() => window.location.href = '/dashboard'} 
                    className="btn btn-secondary"
                  >
                    🏠 Go to Dashboard
                  </button>
                </div>
                
                {/* Show error details in development */}
                {import.meta.env.DEV && this.state.error && (
                  <details className="mt-4 text-left">
                    <summary className="text-danger cursor-pointer mb-2">
                      🔍 Error Details (Development)
                    </summary>
                    <div className="bg-gray-100 p-3 rounded text-sm font-mono">
                      <div className="mb-2">
                        <strong>Error:</strong> {this.state.error.toString()}
                      </div>
                      <div>
                        <strong>Stack Trace:</strong>
                        <pre className="text-xs mt-1 whitespace-pre-wrap">
                          {this.state.errorInfo?.componentStack}
                        </pre>
                      </div>
                    </div>
                  </details>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
