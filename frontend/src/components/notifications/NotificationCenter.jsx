import { useState, useEffect } from 'react';
import { 
  getNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  deleteNotification 
} from '../../services/leaveService';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { formatDistanceToNow } from 'date-fns';
import './NotificationCenter.css';

const NotificationCenter = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, unread, read

  useEffect(() => {
    if (isOpen && user) {
      loadNotifications();
      
      // Subscribe to realtime changes when panel is open
      const channel = supabase
        .channel('notifications_panel')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            console.log('Realtime notification update:', payload);
            handleRealtimeUpdate(payload);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [isOpen, user]);

  const handleRealtimeUpdate = (payload) => {
    if (payload.eventType === 'INSERT') {
      // New notification - add to top of list
      setNotifications(prev => [payload.new, ...prev]);
    } else if (payload.eventType === 'UPDATE') {
      // Updated notification - update in list
      setNotifications(prev =>
        prev.map(n => n.id === payload.new.id ? payload.new : n)
      );
    } else if (payload.eventType === 'DELETE') {
      // Deleted notification - remove from list
      setNotifications(prev =>
        prev.filter(n => n.id !== payload.old.id)
      );
    }
  };

  const loadNotifications = async () => {
    setLoading(true);
    const { data, error } = await getNotifications(user.id, 50);
    
    if (error) {
      console.error('Failed to load notifications:', error);
    } else {
      setNotifications(data || []);
    }
    setLoading(false);
  };

  const handleMarkAsRead = async (notificationId) => {
    const { error } = await markNotificationAsRead(notificationId);
    
    if (!error) {
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
    }
  };

  const handleMarkAllAsRead = async () => {
    const { error } = await markAllNotificationsAsRead(user.id);
    
    if (!error) {
      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true }))
      );
    }
  };

  const handleDelete = async (notificationId) => {
    const { error } = await deleteNotification(notificationId);
    
    if (!error) {
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    }
  };

  const getFilteredNotifications = () => {
    if (filter === 'unread') {
      return notifications.filter(n => !n.is_read);
    } else if (filter === 'read') {
      return notifications.filter(n => n.is_read);
    }
    return notifications;
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'leave_request':    return '📋';
      case 'leave_approved':   return '✅';
      case 'leave_rejected':   return '❌';
      case 'leave_cancelled':  return '🚫';
      case 'approval':         return '✅';
      case 'rejection':        return '❌';
      case 'trip_approved':    return '🚗';
      case 'trip_assigned':    return '🚗';
      case 'trip_rejected':    return '❌';
      case 'trip_completed':   return '🏁';
      case 'fleet':            return '🚗';
      case 'payroll':          return '💰';
      case 'document':         return '📄';
      case 'attendance':       return '🕐';
      case 'system':           return 'ℹ️';
      default:                 return '🔔';
    }
  };

  if (!isOpen) return null;

  const filteredNotifications = getFilteredNotifications();
  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <>
      <div className="notification-overlay" onClick={onClose} />
      <div className="notification-center">
        <div className="notification-header">
          <h3>Notifications</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="notification-actions">
          <div className="notification-filters">
            <button 
              className={filter === 'all' ? 'active' : ''}
              onClick={() => setFilter('all')}
            >
              All ({notifications.length})
            </button>
            <button 
              className={filter === 'unread' ? 'active' : ''}
              onClick={() => setFilter('unread')}
            >
              Unread ({unreadCount})
            </button>
            <button 
              className={filter === 'read' ? 'active' : ''}
              onClick={() => setFilter('read')}
            >
              Read ({notifications.length - unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <button 
              className="mark-all-read-btn"
              onClick={handleMarkAllAsRead}
            >
              Mark all as read
            </button>
          )}
        </div>

        <div className="notification-list">
          {loading ? (
            <div className="notification-loading">Loading notifications...</div>
          ) : filteredNotifications.length === 0 ? (
            <div className="notification-empty">
              <span className="empty-icon">🔔</span>
              <p>No notifications</p>
              <small>You're all caught up!</small>
            </div>
          ) : (
            filteredNotifications.map(notification => (
              <div 
                key={notification.id}
                className={`notification-item ${!notification.is_read ? 'unread' : ''}`}
              >
                <div className="notification-icon">
                  {getNotificationIcon(notification.type)}
                </div>
                
                <div className="notification-content">
                  <div className="notification-title">{notification.title}</div>
                  <div className="notification-message">{notification.message}</div>
                  <div className="notification-time">
                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                  </div>
                </div>

                <div className="notification-actions-icons">
                  {!notification.is_read && (
                    <button
                      className="mark-read-btn"
                      onClick={() => handleMarkAsRead(notification.id)}
                      title="Mark as read"
                    >
                      ✓
                    </button>
                  )}
                  <button
                    className="delete-btn"
                    onClick={() => handleDelete(notification.id)}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};

export default NotificationCenter;
