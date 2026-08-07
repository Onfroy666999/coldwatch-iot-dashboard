import { Preferences } from '@capacitor/preferences';

/**
 * Text-size preference — device-local (Capacitor Preferences), not synced
 * via the backend. This is a display/accessibility preference, similar to
 * OS-level font-size settings, which are conventionally per-device rather
 * than per-account. Preferences already has a localStorage-backed web
 * fallback, so this works identically on native and web with no platform
 * branching needed.
 *
 * Application mechanism: --font-size is a CSS custom property already
 * driving `html { font-size: var(--font-size) }` in theme.css, which
 * Tailwind's rem-based text-* utilities (text-sm, text-base, etc.) are all
 * relative to. Setting this one variable scales text across the entire
 * app — no per-component changes needed.
 */

export type TextSize = 'small' | 'medium' | 'large';

const KEY = 'cw_text_size';
const DEFAULT_SIZE: TextSize = 'medium';

const SIZE_PX: Record<TextSize, string> = {
  small:  '14px',
  medium: '16px', // matches theme.css's original hardcoded default — existing users see no change unless they opt in
  large:  '18px',
};

const VALID_SIZES: readonly string[] = ['small', 'medium', 'large'];

function isValidTextSize(v: string | null): v is TextSize {
  return v !== null && VALID_SIZES.includes(v);
}

/** Applies a text size to the document root. The only place that touches the DOM for this. */
export function applyTextSize(size: TextSize): void {
  document.documentElement.style.setProperty('--font-size', SIZE_PX[size]);
}

/**
 * Loads the stored preference (falling back to 'medium' if unset or
 * unreadable) and applies it immediately. Call once on app boot.
 */
export async function loadAndApplyTextSize(): Promise<TextSize> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    const size = isValidTextSize(value) ? value : DEFAULT_SIZE;
    applyTextSize(size);
    return size;
  } catch (err) {
    console.error('[textSize] Failed to load stored preference:', err);
    applyTextSize(DEFAULT_SIZE);
    return DEFAULT_SIZE;
  }
}

/** Persists and immediately applies a new text size preference. */
export async function setTextSize(size: TextSize): Promise<void> {
  applyTextSize(size); // apply immediately — don't make the user wait on the write
  try {
    await Preferences.set({ key: KEY, value: size });
  } catch (err) {
    console.error('[textSize] Failed to persist preference:', err);
  }
}
