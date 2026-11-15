/**
 * User preferences, persisted by Python in settings.json (plan.md §9).
 *
 * Without a backend the values live for the session only, so the UI behaves
 * the same in a plain browser.
 */

import { reactive } from 'vue';

import { getSettings, hasBackend, api, setSettings } from '@/api/bridge';

/** Grouped keeps each library's games in one contiguous block. */
export type Layout = 'grouped' | 'mixed';

interface SettingsState {
  layout: Layout;
  /** Accurate mode walks the folders instead of trusting the manifests. */
  accurate: boolean;
  loaded: boolean;
}

const DEFAULTS: Omit<SettingsState, 'loaded'> = {
  layout: 'grouped',
  accurate: false,
};

export const settingsStore = reactive<SettingsState>({ ...DEFAULTS, loaded: false });

export async function loadSettings(): Promise<void> {
  await api();
  if (hasBackend()) {
    try {
      const stored = await getSettings();
      if (stored.layout === 'grouped' || stored.layout === 'mixed') {
        settingsStore.layout = stored.layout;
      }
      if (typeof stored.accurate === 'boolean') settingsStore.accurate = stored.accurate;
    } catch {
      // Keep the defaults: a missing or unreadable settings file is not an error.
    }
  }
  settingsStore.loaded = true;
}

/** Change one preference and write it back; failures are not worth a dialog. */
export async function update(values: Partial<Omit<SettingsState, 'loaded'>>): Promise<void> {
  Object.assign(settingsStore, values);
  if (!hasBackend()) return;
  try {
    await setSettings(values as Record<string, unknown>);
  } catch {
    // Ignore: the value still applies for this session.
  }
}
