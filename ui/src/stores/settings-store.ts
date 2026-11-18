/**
 * User preferences, stored in settings.json next to the exe (plan.md §9).
 *
 * The file is read and written by `core/settings.ts` through the same host the
 * scanner uses, so there is no backend call of our own here. Without the app
 * (a plain browser) the values live for the session only, and the UI behaves
 * the same.
 */

import { reactive } from 'vue';

import { hasBackend, host } from '@/api/bridge';
import { load as loadStored, save as saveStored } from '@core/settings.ts';

/** Grouped keeps each library's games in one contiguous block. */
export type Layout = 'grouped' | 'mixed';

interface SettingsState {
  layout: Layout;
  /** Accurate mode walks the folders instead of trusting the manifests. */
  accurate: boolean;
  isLoaded: boolean;
}

const DEFAULTS: Omit<SettingsState, 'isLoaded'> = {
  layout: 'grouped',
  accurate: false,
};

export const settingsStore = reactive<SettingsState>({ ...DEFAULTS, isLoaded: false });

export async function loadSettings(): Promise<void> {
  if (hasBackend()) {
    try {
      const stored = await loadStored(host());

      if (stored.layout === 'grouped' || stored.layout === 'mixed') {
        settingsStore.layout = stored.layout;
      }

      if (typeof stored.accurate === 'boolean') {
        settingsStore.accurate = stored.accurate;
      }
    } catch {
      // Keep the defaults: a missing or unreadable settings file is not an error.
    }
  }

  settingsStore.isLoaded = true;
}

/** Change one preference and write it back; failures are not worth a dialog. */
export async function update(values: Partial<Omit<SettingsState, 'isLoaded'>>): Promise<void> {
  Object.assign(settingsStore, values);

  if (!hasBackend()) {
    return;
  }

  try {
    await saveStored(host(), values);
  } catch {
    // Ignore: the value still applies for this session.
  }
}
