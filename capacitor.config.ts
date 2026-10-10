import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'id.notula.assistent',
  appName: 'Notula Assistent',
  webDir: 'dist',
  // Rekaman di Android memakai WebView yang sama (MediaRecorder), dijaga
  // tetap hidup oleh RecordingForegroundService + notifikasi (PRD §28).
  android: {
    backgroundColor: '#F8FBFF',
  },
};

export default config;
