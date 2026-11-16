<template>
  <header class="sd-Toolbar flex items-center gap-2 px-3 py-2">
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
  </header>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { scanStore } from '@/stores/scan-store';
import { settingsStore, update } from '@/stores/settings-store';

export default defineComponent({
  name: 'SdToolbar',
  emits: ['refresh'],
  data() {
    return { scan: scanStore, settings: settingsStore };
  },
  methods: {
    toggleAccurate() {
      update({ accurate: !this.settings.accurate });
    },
    toggleLayout() {
      update({ layout: this.settings.layout === 'grouped' ? 'mixed' : 'grouped' });
    },
  },
});
</script>
