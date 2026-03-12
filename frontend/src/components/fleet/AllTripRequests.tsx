// All Trip Requests Component
// Admin view of all trip requests across the organization

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminSidebar } from '../admin/AdminSidebar';
import { getTripRequests } from '../../services/fleetService';
import { TripRequest, TripRequestStatus } from '../../types/fleet';

export function AllTripRequests() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<TripRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TripRequestStatus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const data = await getTripRequests();
      setRequests(data);
    } catch (err) {
      console.error('Error loading requests:', err);
      setError('Failed to load trip requests');
    } finally {
      setLoading(false);
    }
  };

  const filteredRequests = requests.filter(req => {
    const matchesFilter = filter === 'all' || req.status === filter;
    const matchesSearch = searchTerm === '' || 
      req.request_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.destination.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.purpose.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.requester_profile?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getStatusColor = (status: TripRequestStatus) => {
    switch (status) {
      case 'pending': return 'status-pending';
      case 'approved': return 'status-approved';
      case 'rejected': return 'status-rejected';
      case 'assigned': return 'status-assigned';
      case 'in_progress': return 'status-in-progress';
      case 'completed': return 'status-completed';
      case 'cancelled': return 'status-cancelled';
      default: return '';
    }
  };

  const getStatusIcon = (status: TripRequestStatus) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'approved': return '✅';
      case 'rejected': return '❌';
      case 'assigned': return '🚗';
      case 'in_progress': return '🔄';
      case 'completed': return '✔️';
      case 'cancelled': return '🚫';
      default: return '📋';
    }
  };

  const statusCounts = {
    all: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    assigned: requests.filter(r => r.status === 'assigned').length,
    in_progress: requests.filter(r => r.status === 'in_progress').length,
    completed: requests.filter(r => r.status === 'completed').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    cancelled: requests.filter(r => r.status === 'cancelled').length,
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-container">
          <header className="page-header">
            <div className="header-content">
              <h1>📋 All Trip Requests</h1>
              <p className="header-subtitle">View and manage all trip requests across the organization</p>
            </div>
          </header>

          {error && (
            <div className="alert alert-error mb-4">
              <span>{error}</span>
              <button onClick={() => setError(null)}>×</button>
            </div>
          )}

          {/* Summary Cards */}
          <div className="summary-cards mb-4">
            <div className="summary-card">
              <div className="summary-icon">📊</div>
              <div className="summary-content">
                <span className="summary-value">{requests.length}</span>
                <span className="summary-label">Total Requests</span>
              </div>
            </div>
            <div className="summary-card pending">
              <div className="summary-icon">⏳</div>
              <div className="summary-content">
                <span className="summary-value">{statusCounts.pending}</span>
                <span className="summary-label">Pending</span>
              </div>
            </div>
            <div className="summary-card success">
              <div className="summary-icon">🚗</div>
              <div className="summary-content">
                <span className="summary-value">{statusCounts.assigned + statusCounts.in_progress}</span>
                <span className="summary-label">Active Trips</span>
              </div>
            </div>
            <div className="summary-card info">
              <div className="summary-icon">✔️</div>
              <div className="summary-content">
                <span className="summary-value">{statusCounts.completed}</span>
                <span className="summary-label">Completed</span>
              </div>
            </div>
          </div>

          {/* Search & Filter */}
          <div className="controls-bar mb-4">
            <div className="search-box">
              <input
                type="text"
                className="form-control"
                placeholder="Search by request #, destination, requester..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="filter-tabs">
              {(['all', 'pending', 'approved', 'assigned', 'in_progress', 'completed', 'rejected', 'cancelled'] as const).map(status => (
                <button
                  key={status}
                  className={`filter-tab ${filter === status ? 'active' : ''}`}
                  onClick={() => setFilter(status)}
                >
                  {status === 'all' ? 'All' : status.replace('_', ' ')}
                  <span className="count">({statusCounts[status]})</span>
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Loading requests...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <h3>No Requests Found</h3>
              <p>
                {searchTerm ? 'No requests match your search criteria.' : 'No trip requests have been made yet.'}
              </p>
            </div>
          ) : (
            <div className="requests-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Request #</th>
                    <th>Requester</th>
                    <th>Destination</th>
                    <th>Date/Time</th>
                    <th>Passengers</th>
                    <th>Status</th>
                    <th>Vehicle</th>
                    <th>Driver</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map(request => (
                    <tr key={request.id}>
                      <td className="request-number">
                        <strong>{request.request_number}</strong>
                      </td>
                      <td>
                        <div className="requester-info">
                          <span className="name">{request.requester_profile?.full_name || 'Unknown'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="destination-info">
                          <span className="destination">{request.destination}</span>
                          <small className="purpose">{request.purpose.substring(0, 50)}...</small>
                        </div>
                      </td>
                      <td>
                        <div className="datetime-info">
                          <span>{new Date(request.start_datetime).toLocaleDateString()}</span>
                          <small>{new Date(request.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                        </div>
                      </td>
                      <td className="text-center">
                        <span className="passenger-count">{request.passenger_count}</span>
                      </td>
                      <td>
                        <span className={`status-badge ${getStatusColor(request.status)}`}>
                          {getStatusIcon(request.status)} {request.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        {request.assigned_vehicle ? (
                          <span className="vehicle-info">{request.assigned_vehicle.plate_number}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        {request.assigned_driver_profile ? (
                          <span className="driver-info">{request.assigned_driver_profile.full_name}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <div className="action-buttons">
                          {request.status === 'approved' && (
                            <button 
                              className="btn btn-sm btn-primary"
                              onClick={() => navigate(`/fleet/assignments/${request.id}`)}
                            >
                              Assign
                            </button>
                          )}
                          {request.status === 'pending' && (
                            <button 
                              className="btn btn-sm btn-secondary"
                              onClick={() => navigate('/fleet/trip-approvals')}
                            >
                              Review
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default AllTripRequests;
