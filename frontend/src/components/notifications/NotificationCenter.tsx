import React, { useState, useEffect, useCallback } from 'react';
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

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

type FilterType = 'all' | 'unread' | 'read';

const NotificationCenter: React.FC<NotificationCenterProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<FilterType>('all');

  const handleRealtimeUpdate = useCallback((payload: any): void => {
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
  }, []);

  const loadNotifications = useCallback(async (): Promise<void> => {
    if (!user?.id) return;
    
    setLoading(true);
    const { data, error } = await getNotifications(user.id, 50);
    
    if (error) {
      console.error('Failed to load notifications:', error);
    } else {
      setNotifications((data as Notification[]) || []);
    }
    setLoading(false);
  }, [user?.id]);

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
          (payload: any) => {
            console.log('Realtime notification update:', payload);
            handleRealtimeUpdate(payload);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [isOpen, user, loadNotifications, handleRealtimeUpdate]);

  const handleMarkAsRead = async (notificationId: string): Promise<void> => {
    const { error } = await markNotificationAsRead(notificationId);
    
    if (!error) {
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
    }
  };

  const handleMarkAllAsRead = async (): Promise<void> => {
    if (!user?.id) return;
    
    const { error } = await markAllNotificationsAsRead(user.id);
    
    if (!error) {
      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true }))
      );
    }
  };

  const handleDelete = async (notificationId: string): Promise<void> => {
    const { error } = await deleteNotification(notificationId);
    
    if (!error) {
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    }
  };

  const getFilteredNotifications = (): Notification[] => {
    if (filter === 'unread') {
      return notifications.filter(n => !n.is_read);
    } else if (filter === 'read') {
      return notifications.filter(n => n.is_read);
    }
    return notifications;
  };

  const getNotificationIcon = (type: string): string => {
    switch (type) {
      case 'leave_request':
        return '📋';
      case 'approval':
        return '✅';
      case 'rejection':
        return '❌';
      default:
        return '🔔';
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