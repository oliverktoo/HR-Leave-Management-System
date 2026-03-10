import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fkf.hr',
  appName: 'FKF HR',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    Geolocation: {
      requestPermissions: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#488AFF',
      sound: 'beep.wav',
    },
    BackgroundGeolocation: {
      notificationTitle: 'FKF HR Attendance',
      notificationText: 'Tracking your location for attendance',
      notificationIcon: 'ic_launcher',
    },
    SQLite: {
      iosDatabaseLocation: 'Library/LocalDatabase',
      androidDatabaseLocation: 'default',
    },
  },
};

export default config;
