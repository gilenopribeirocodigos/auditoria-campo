package com.dpl.auditoriacampo;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final int REQ_FOREGROUND_TRACKING = 9101;
    private static final int REQ_BACKGROUND_LOCATION = 9102;
    private static final long BATTERY_PROMPT_INTERVAL_MS = 6L * 60L * 60L * 1000L;
    private static final String POST_NOTIFICATIONS = "android.permission.POST_NOTIFICATIONS";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().getDecorView().postDelayed(() -> {
            requestForegroundTrackingPermissions();
            requestIgnoreBatteryOptimizations();
        }, 900);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_FOREGROUND_TRACKING) {
            getWindow().getDecorView().postDelayed(this::requestBackgroundLocationIfReady, 600);
        }
    }

    private void requestForegroundTrackingPermissions() {
        List<String> permissions = new ArrayList<>();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }

        if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(this, POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(POST_NOTIFICATIONS);
        }

        if (!permissions.isEmpty()) {
            ActivityCompat.requestPermissions(this, permissions.toArray(new String[0]), REQ_FOREGROUND_TRACKING);
        } else {
            requestBackgroundLocationIfReady();
        }
    }

    private void requestBackgroundLocationIfReady() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;

        boolean hasFineLocation = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean hasBackgroundLocation = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;

        if (hasFineLocation && !hasBackgroundLocation) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION}, REQ_BACKGROUND_LOCATION);
        }
    }

    private void requestIgnoreBatteryOptimizations() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;

            PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
            if (powerManager == null || powerManager.isIgnoringBatteryOptimizations(getPackageName())) return;

            long now = System.currentTimeMillis();
            long lastPrompt = getPreferences(MODE_PRIVATE).getLong("last_battery_prompt", 0L);
            if (now - lastPrompt < BATTERY_PROMPT_INTERVAL_MS) return;

            getPreferences(MODE_PRIVATE).edit().putLong("last_battery_prompt", now).apply();

            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (Exception ignored) {
            // Alguns fabricantes bloqueiam esse fluxo; nesses casos o ajuste fica manual.
        }
    }
}
