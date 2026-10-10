package id.notula.assistent;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

/**
 * Foreground service PRD §7/§28 — menjaga proses aplikasi tetap hidup selama
 * rekaman berjalan sehingga audio tidak terputus ketika layar dikunci atau
 * aplikasi berpindah ke background.
 *
 * DICATAT: file ini disiapkan di lingkungan tanpa JDK/Android SDK dan BELUM
 * dikompilasi/diuji di sini; validasi akhir (./gradlew assembleDebug) dijalankan
 * di mesin ber-SDK — lihat README "Build Android".
 */
public class RecordingForegroundService extends Service {
    public static final String CHANNEL_ID = "notula_recording";
    public static final int NOTIFICATION_ID = 8520;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        Notification notification =
                new NotificationCompat.Builder(this, CHANNEL_ID)
                        .setContentTitle("Notula Assistent")
                        .setContentText("Sedang merekam rapat — layar boleh dikunci.")
                        .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                        .setOngoing(true)
                        .build();
        startAsForeground(notification);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Bila sistem membunuh proses, layanan dihidupkan kembali (rekaman
        // chunk lokal tetap tersimpan; pemulihan dilakukan recovery.ts).
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void startAsForeground(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel =
                    new NotificationChannel(
                            CHANNEL_ID,
                            "Rekaman rapat",
                            NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Menjaga rekaman tetap berjalan di latar belakang.");
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }
}
