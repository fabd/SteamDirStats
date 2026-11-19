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
        class="sd-Toolbar-windowButton sd-Toolbar-windowIcon--filled"
        type="button"
        title="Minimize"
        aria-label="Minimize"
        @click="onMinimize"
      >
        <svg viewBox="0 0 448 448" aria-hidden="true">
          <path
            d="M0 256c0-17.7 14.3-32 32-32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288c-17.7 0-32-14.3-32-32z"
          />
        </svg>
      </button>

      <button
        class="sd-Toolbar-windowButton"
        type="button"
        :title="isMaximized ? 'Restore' : 'Maximize'"
        :aria-label="isMaximized ? 'Restore' : 'Maximize'"
        @click="onToggleMaximize"
      >
        <svg v-if="isMaximized" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M3 8h6v5H3z" />
          <path d="M6 8V4h7v6H9" />
        </svg>
        <svg v-else viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M3.5 3.5h9v9h-9z" />
        </svg>
      </button>

      <button
        class="sd-Toolbar-windowButton sd-Toolbar-windowIcon--filled sd-Toolbar-windowButton--close"
        type="button"
        title="Close"
        aria-label="Close"
        @click="onClose"
      >
        <svg viewBox="0 0 384 512"><path d="M55.1 73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L147.2 256 9.9 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192.5 301.3 329.9 438.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.8 256 375.1 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192.5 210.7 55.1 73.4z"/></svg>
      </button>
    </template>
  </header>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import iconUrl from '@icons/32x32.png';

import { hasBackend } from '@/api/bridge';
import { close, minimize, toggleMaximize, watchMaximized } from '@/lib/window-state';
import { scanStore } from '@/stores/scan-store';
import { settingsStore, update } from '@/stores/settings-store';

export default defineComponent({
  name: 'SdToolbar',
  emits: ['refresh'],
  data() {
    return {
      scan: scanStore,
      settings: settingsStore,
      iconUrl,
      isInApp: hasBackend(),
      isMaximized: false,
      unwatchMaximized: null as (() => void) | null,
    };
  },
  async mounted() {
    this.unwatchMaximized = await watchMaximized((isMaximized) => {
      this.isMaximized = isMaximized;
    });
  },
  unmounted() {
    this.unwatchMaximized?.();
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
    onToggleMaximize() {
      void toggleMaximize();
    },
    onClose() {
      void close();
    },
  },
});
</script>
