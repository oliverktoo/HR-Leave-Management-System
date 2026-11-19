// Fleet Phase 4: Push Notification Service
// Device registration and local notifications

import { supabase } from '../lib/supabaseClient';

export async function initPushNotifications(): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;

    const { PushNotifications } = await import('@capacitor/push-notifications');

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') {
      console.warn('Push notification permission denied');
      return;
    }

    await PushNotifications.register();

    PushNotifications.addListener('registration', async (token) => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase
          .from('users_profile')
          .update({ push_token: token.value })
          .eq('id', user.id);
      } catch (err) {
        console.error('Failed to save push token:', err);
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration error:', err);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push notification received:', notification);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('Push notification action:', action);
    });
  } catch (err) {
    console.warn('Push notifications unavailable:', err);
  }
}

export async function sendLocalNotification(title: string, body: string, id = Date.now()): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;

    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({
      notifications: [{ title, body, id, schedule: { at: new Date(Date.now() + 100) } }],
    });
  } catch (err) {
    console.warn('Local notification failed:', err);
  }
}
