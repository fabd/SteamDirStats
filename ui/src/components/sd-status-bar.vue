<template>
  <footer class="sd-StatusBar flex items-center gap-4 px-3 py-1">
    <span>
      <span class="sd-StatusBar-value">{{ games.length }}</span> games in
      <span class="sd-StatusBar-value">{{ libraries.length }}</span> libraries
    </span>
    <span>
      Total <span class="sd-StatusBar-value">{{ formatSize(total) }}</span>
    </span>
    <span v-if="workshopTotal > 0">
      Workshop <span class="sd-StatusBar-value">{{ formatSize(workshopTotal) }}</span>
    </span>

    <span v-if="scan.progress" class="ml-auto">
      {{ scan.progress.done }} / {{ scan.progress.total }} — {{ scan.progress.name }}
    </span>
    <span v-else-if="scan.isLoading" class="ml-auto">Scanning…</span>
    <span v-else-if="scan.error" class="sd-StatusBar-note--error ml-auto">{{ scan.error }}</span>
    <span v-else-if="scan.isFixture" class="sd-StatusBar-note--fixture ml-auto">
      Fixture data (no backend)
    </span>
  </footer>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { formatSize } from '@core/format.ts';
import { games, libraries, scanStore } from '@/stores/scan-store';

export default defineComponent({
  name: 'SdStatusBar',
  data() {
    return { scan: scanStore };
  },
  computed: {
    games() {
      return games.value;
    },
    libraries() {
      return libraries.value;
    },
    total(): number {
      return this.scan.data?.total_size ?? 0;
    },
    workshopTotal(): number {
      return this.scan.data?.workshop_size ?? 0;
    },
  },
  methods: { formatSize },
});
</script>
