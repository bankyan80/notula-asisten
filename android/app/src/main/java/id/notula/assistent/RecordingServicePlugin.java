package id.notula.assistent;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Jembatan JS → foreground service rekaman (PRD §28). Dipanggil dari web
 * lewat `startNativeRecordingService()` / `stopNativeRecordingService()`
 * (src/modules/recording/nativeService.ts) — no-op pada browser biasa.
 *
 * DICATAT: belum dikompilasi/diuji di lingkungan tanpa Android SDK.
 */
@CapacitorPlugin(name = "RecordingService")
public class RecordingServicePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), RecordingForegroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            JSObject result = new JSObject();
            result.put("started", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Gagal memulai layanan rekaman: " + error.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), RecordingForegroundService.class));
            JSObject result = new JSObject();
            result.put("stopped", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Gagal menghentikan layanan rekaman: " + error.getMessage());
        }
    }
}
