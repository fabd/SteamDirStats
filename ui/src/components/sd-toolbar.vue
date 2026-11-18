<template>
  <!--
    Also the window's title bar: the window is undecorated (tauri.conf.json),
    so this row carries the icon, the title and the window buttons, and is the
    drag region. `deep` lets the whole row drag; Tauri's own script treats
    buttons as clickable and does not drag from them.
  -->
  <header class="sd-Toolbar flex items-center gap-2 px-3 py-2" data-tauri-drag-region="deep">
    <img class="sd-Toolbar-icon" :src="iconUrl" alt="" width="16" height="16" />

    <span class="sd-Toolbar-title mr-auto">SteamDirStats</span>

    <button
      class="sd-Toolbar-button px-2 py-1"
      :class="{ 'is-active': settings.accurate }"
      :disabled="scan.isLoading"
      type="button"
      @click="toggleAccurate"
    >
      {{ settings.accurate ? 'Accurate' : 'Fast' }}
    </button>

    <button
      class="sd-Toolbar-button px-2 py-1"
      :disabled="scan.isLoading"
      type="button"
      @click="toggleLayout"
    >
      {{ settings.layout === 'grouped' ? 'Grouped' : 'Mixed' }}
    </button>

    <button
      class="sd-Toolbar-button sd-Toolbar-button--refresh px-4 py-1"
      :disabled="scan.isLoading"
      type="button"
      @click="$emit('refresh')"
    >
      Refresh
    </button>

    <!-- Only in the app: in a browser there is no window to act on. -->
    <template v-if="isInApp">
      <span class="sd-Toolbar-separator"></span>

      <button
        class="sd-Toolbar-windowButton"
        type="button"
        title="Minimize"
        aria-label="Minimize"
        @click="onMinimize"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M3 6l5 5 5-5" />
        </svg>
      </button>

      <button
        class="sd-Toolbar-windowButton sd-Toolbar-windowButton--close"
        type="button"
        title="Close"
        aria-label="Close"
        @click="onClose"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </template>
  </header>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import iconUrl from '@icons/32x32.png';

import { hasBackend } from '@/api/bridge';
import { close, minimize } from '@/lib/window-state';
import { scanStore } from '@/stores/scan-store';
import { settingsStore, update } from '@/stores/settings-store';

export default defineComponent({
  name: 'SdToolbar',
  emits: ['refresh'],
  data() {
    return { scan: scanStore, settings: settingsStore, iconUrl, isInApp: hasBackend() };
  },
  methods: {
    toggleAccurate() {
      update({ accurate: !this.settings.accurate });
    },
    toggleLayout() {
      update({ layout: this.settings.layout === 'grouped' ? 'mixed' : 'grouped' });
    },
    onMinimize() {
      void minimize();
    },
    onClose() {
      void close();
    },
  },
});
</script>
