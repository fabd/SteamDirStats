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

    <button
      class="sd-Toolbar-windowButton sd-Toolbar-windowIcon--filled"
      type="button"
      title="About SteamDirStats"
      aria-label="About SteamDirStats"
      @click="$emit('about')"
    >
      <svg viewBox="0 0 512 512" aria-hidden="true">
        <path
          d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336l24 0 0-64-24 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l48 0c13.3 0 24 10.7 24 24l0 88 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"
        />
      </svg>
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
        <IconWindowMinimize aria-hidden="true" focusable="false" />
      </button>

      <button
        class="sd-Toolbar-windowButton"
        type="button"
        :title="isMaximized ? 'Restore' : 'Maximize'"
        :aria-label="isMaximized ? 'Restore' : 'Maximize'"
        @click="onToggleMaximize"
      >
        <IconWindowRestore v-if="isMaximized" aria-hidden="true" focusable="false" />
        <IconWindowMaximize v-else aria-hidden="true" focusable="false" />
      </button>

      <button
        class="sd-Toolbar-windowButton sd-Toolbar-windowIcon--filled sd-Toolbar-windowButton--close"
        type="button"
        title="Close"
        aria-label="Close"
        @click="onClose"
      >
        <IconWindowClose aria-hidden="true" focusable="false" />
      </button>
    </template>
  </header>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import iconUrl from '@icons/32x32.png';

import IconWindowClose from '@/assets/icons/window-close.svg?component';
import IconWindowMaximize from '@/assets/icons/window-maximize.svg?component';
import IconWindowMinimize from '@/assets/icons/window-minimize.svg?component';
import IconWindowRestore from '@/assets/icons/window-restore.svg?component';

import { hasBackend } from '@/api/bridge';
import { close, minimize, toggleMaximize, watchMaximized } from '@/lib/window-state';
import { scanStore } from '@/stores/scan-store';
import { settingsStore, update } from '@/stores/settings-store';

export default defineComponent({
  name: 'SdToolbar',
  components: { IconWindowClose, IconWindowMaximize, IconWindowMinimize, IconWindowRestore },
  emits: ['about', 'refresh'],
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
