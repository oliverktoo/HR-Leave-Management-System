import React, { useState, useEffect, useCallback } from 'react';
import { getUnreadCount } from '../../services/leaveService';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import NotificationCenter from './NotificationCenter';
import './NotificationBell.css';

interface User {
  id: string;
}

const NotificationBell: React.FC = () => {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const loadUnreadCount = useCallback(async (): Promise<void> => {
    if (!user?.id) return;
    const { count } = await getUnreadCount(user.id);
    setUnreadCount(count || 0);
  }, [user?.id]);

  useEffect(() => {
    if (user) {
      loadUnreadCount();
      
      // Subscribe to realtime changes
      const channel = supabase
        .channel('notifications_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`
          },
          (payload: any) => {
            console.log('Notification change:', payload);
            loadUnreadCount(); // Refresh count on any change
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, loadUnreadCount]);

  const handleBellClick = (): void => {
    setIsOpen(!isOpen);
  };

  const handleClose = (): void => {
    setIsOpen(false);
    loadUnreadCount(); // Refresh count when closing
  };

  return (
    <>
      <button className="notification-bell" onClick={handleBellClick}>
        <span className="bell-icon">🔔</span>
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationCenter isOpen={isOpen} onClose={handleClose} />
    </>
  );
};

export default NotificationBell;