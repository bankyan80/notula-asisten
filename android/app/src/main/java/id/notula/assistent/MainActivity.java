package id.notula.assistent;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Terdaftar pada builder SEBELUM bridge dibangun di super.onCreate().
        registerPlugin(RecordingServicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
