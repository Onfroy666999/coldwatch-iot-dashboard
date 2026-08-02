import { registerPlugin } from '@capacitor/core';

/**
 * Bridges the custom native BatteryOptimizationPlugin (see
 * android/app/src/main/java/com/coldwatch/app/BatteryOptimizationPlugin.java)
 * — not an npm package, since there's no first-party Capacitor plugin for
 * ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS or OEM battery-manager screens.
 *
 * isIgnoringBatteryOptimizations/requestIgnoreBatteryOptimizations cover
 * only the stock Android exemption dialog. openManufacturerBatterySettings
 * separately attempts an OEM-specific battery-manager screen — see its own
 * doc comment for an important confidence caveat: it's well-tested for
 * Xiaomi/Huawei/Oppo/Vivo/Samsung, but a best-effort guess for Tecno/Infinix
 * specifically, since those are far less publicly documented.
 */
export interface BatteryOptimizationPlugin {
  /** Whether the app is already exempt from battery optimization. */
  isIgnoringBatteryOptimizations(): Promise<{ ignoring: boolean }>;
  /**
   * Shows the system "Allow ColdWatch to ignore battery optimizations?"
   * dialog if not already exempt (resolves immediately, with no dialog, if
   * already exempt). Resolves once the dialog is dismissed either way —
   * Android doesn't report which button the user tapped, so the resolved
   * `ignoring` value reflects the actual exemption state afterward rather
   * than the user's choice.
   */
  requestIgnoreBatteryOptimizations(): Promise<{ ignoring: boolean }>;
  /**
   * Attempts to open the current device manufacturer's own battery-manager
   * settings screen (many OEM skins — Xiaomi, Huawei, Tecno/Infinix, etc. —
   * kill background apps via their own separate battery manager regardless
   * of the stock exemption above). Falls back to the app's general "App
   * Info" settings screen if no manufacturer-specific screen could be
   * opened, which always exists — this never resolves to a dead end, but
   * `fallback: true` in the result means the manufacturer-specific attempt
   * didn't work and the user landed on the generic screen instead.
   */
  openManufacturerBatterySettings(): Promise<{ opened: boolean; fallback: boolean }>;
}

const BatteryOptimization = registerPlugin<BatteryOptimizationPlugin>('BatteryOptimization');

export default BatteryOptimization;
