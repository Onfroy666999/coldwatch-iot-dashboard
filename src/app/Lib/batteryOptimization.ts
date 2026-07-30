import { registerPlugin } from '@capacitor/core';

/**
 * Bridges the custom native BatteryOptimizationPlugin (see
 * android/app/src/main/java/com/coldwatch/app/BatteryOptimizationPlugin.java)
 * — not an npm package, since there's no first-party Capacitor plugin for
 * ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS.
 *
 * Covers the STOCK Android battery-optimization exemption only. OEM battery
 * managers (Tecno/Infinix "Phone Manager" and similar) have their own,
 * separate settings screens this does not reach — see the native plugin's
 * doc comment for more on that scope boundary.
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
}

const BatteryOptimization = registerPlugin<BatteryOptimizationPlugin>('BatteryOptimization');

export default BatteryOptimization;
