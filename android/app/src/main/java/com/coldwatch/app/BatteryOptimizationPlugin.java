package com.coldwatch.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Exposes Android's stock "ignore battery optimizations" exemption request
 * to the web layer.
 *
 * Why this matters here: OEM battery managers (Tecno/Infinix "Phone
 * Manager" and similar, dominant in Ghana) aggressively kill background
 * processes — including this app's WebSocket connection — within minutes
 * of the screen locking, regardless of what the stock Android Doze
 * whitelist says. Requesting this exemption is the one lever the stock
 * Android API gives an app to ask not to be treated that way.
 *
 * Scope: this only covers the STOCK Android dialog
 * (ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS). Many OEM skins — including
 * Tecno's own "Phone Manager" battery control — have entirely separate,
 * non-standard settings screens that this system API does not reach at
 * all. Getting a user fully protected on those devices needs manufacturer
 * detection and per-brand deep links as a follow-up; this plugin is the
 * stock-Android half only.
 *
 * minSdkVersion for this project is 24 — isIgnoringBatteryOptimizations()
 * and ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS have both existed since
 * API 23, so no version-gating is needed here.
 */
@CapacitorPlugin(name = "BatteryOptimization")
public class BatteryOptimizationPlugin extends Plugin {

    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        JSObject output = new JSObject();
        output.put("ignoring", isIgnoring());
        call.resolve(output);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        if (isIgnoring()) {
            // Already exempted — nothing to prompt. Resolve immediately
            // rather than waiting on an activity result that will never
            // arrive if we skip launching the intent.
            JSObject output = new JSObject();
            output.put("ignoring", true);
            call.resolve(output);
            return;
        }

        Context context = getContext();
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + context.getPackageName()));
        startActivityForResult(call, intent, "handleRequestResult");
    }

    @ActivityCallback
    private void handleRequestResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            // Capacitor invokes this with a null call if the activity was
            // recreated (e.g. rotation) before the result came back — the
            // original JS caller has no way to receive a resolve() at that
            // point, so there's nothing to do.
            return;
        }
        // The dialog doesn't report its outcome via the activity result
        // code — whether the user tapped "Allow" or dismissed it, check
        // the actual exemption state directly rather than trust a result
        // code that isn't meaningful here.
        JSObject output = new JSObject();
        output.put("ignoring", isIgnoring());
        call.resolve(output);
    }

    private boolean isIgnoring() {
        Context context = getContext();
        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (powerManager == null) {
            // No PowerManager available to check against — treat as
            // nothing to fix rather than block the caller indefinitely.
            return true;
        }
        return powerManager.isIgnoringBatteryOptimizations(context.getPackageName());
    }
}
