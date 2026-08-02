package com.coldwatch.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

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
 * Scope: isIgnoringBatteryOptimizations()/requestIgnoreBatteryOptimizations()
 * cover only the STOCK Android dialog
 * (ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS). Many OEM skins — including
 * Tecno's own "Phone Manager" battery control — have entirely separate,
 * non-standard settings screens that this system API does not reach at
 * all. openManufacturerBatterySettings() below attempts those separately,
 * with an important caveat: confidence in the specific screen it opens
 * varies a lot by manufacturer — see that method's doc comment.
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

    /**
     * Attempts to open the OEM-specific "auto-start" / battery-manager
     * settings screen for the current device's manufacturer, since many OEM
     * skins ignore the stock ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
     * result entirely and kill background apps via their own separate
     * battery manager regardless.
     *
     * IMPORTANT — confidence varies sharply by manufacturer:
     *   - Xiaomi, Huawei, Oppo, Vivo, Samsung: these package/activity names
     *     are widely and consistently documented across many production
     *     apps and community trackers (e.g. dontkillmyapp.com-style
     *     references), and have been stable for years. Reasonably high
     *     confidence.
     *   - Tecno / Infinix (Transsion Holdings' brands, the actual target
     *     here): MUCH less publicly documented than the above. The
     *     candidates below are a best-effort guess based on the most
     *     commonly cited package name, and may not match every HiOS/XOS
     *     version or region build. This has NOT been verified against a
     *     real Tecno or Infinix device.
     *
     * Every candidate is wrapped in try/catch — a wrong guess just means
     * that specific launch silently fails and the next candidate (or
     * eventually the universal App Info fallback, which exists on every
     * Android device) is tried instead. This method should never leave the
     * calling button doing nothing, even when every manufacturer-specific
     * guess is wrong.
     */
    @PluginMethod
    public void openManufacturerBatterySettings(PluginCall call) {
        String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase(Locale.ROOT);
        List<Intent> candidates = new ArrayList<>();

        if (manufacturer.contains("xiaomi")) {
            candidates.add(componentIntent("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"));
        } else if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
            candidates.add(componentIntent("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"));
            candidates.add(componentIntent("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"));
        } else if (manufacturer.contains("oppo")) {
            candidates.add(componentIntent("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"));
            candidates.add(componentIntent("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"));
        } else if (manufacturer.contains("vivo")) {
            candidates.add(componentIntent("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"));
        } else if (manufacturer.contains("samsung")) {
            candidates.add(componentIntent("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"));
        } else if (manufacturer.contains("tecno") || manufacturer.contains("infinix") || manufacturer.contains("itel") || manufacturer.contains("transsion")) {
            // LOW CONFIDENCE — see doc comment above. Best-effort only.
            candidates.add(componentIntent("com.transsion.phonemanager", "com.transsion.phonemanager.ui.PowerSecureActivity"));
            candidates.add(componentIntent("com.transsion.phonemanager", "com.transsion.phonemanager.MainActivity"));
        }

        for (Intent intent : candidates) {
            if (tryStartActivity(intent)) {
                JSObject output = new JSObject();
                output.put("opened", true);
                output.put("fallback", false);
                call.resolve(output);
                return;
            }
        }

        // Universal fallback: the app's own "App Info" settings page exists
        // on every Android device regardless of manufacturer. It's a less
        // direct path to battery settings than a manufacturer shortcut
        // would be, but it always works — the user can reach battery
        // controls from there manually.
        Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        fallback.setData(Uri.parse("package:" + getContext().getPackageName()));
        boolean openedFallback = tryStartActivity(fallback);

        JSObject output = new JSObject();
        output.put("opened", openedFallback);
        output.put("fallback", true);
        call.resolve(output);
    }

    private Intent componentIntent(String packageName, String className) {
        Intent intent = new Intent();
        intent.setComponent(new ComponentName(packageName, className));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return intent;
    }

    private boolean tryStartActivity(Intent intent) {
        try {
            getContext().startActivity(intent);
            return true;
        } catch (Exception e) {
            // ActivityNotFoundException (this screen doesn't exist on this
            // device/OS version) or SecurityException (blocked from
            // launching it) — either way, try the next candidate.
            return false;
        }
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
