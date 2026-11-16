<template>
  <div class="sd-App">
    <SdToolbar @refresh="onRefresh" />
    <main class="sd-App-content">
      <div class="sd-App-table">
        <SdGameTable />
      </div>
      <div class="sd-App-map">
        <SdTreemap />
        <SdLegend />
      </div>
    </main>
    <SdStatusBar />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import SdGameTable from '@/components/sd-game-table.vue';
import SdLegend from '@/components/sd-legend.vue';
import SdStatusBar from '@/components/sd-status-bar.vue';
import SdToolbar from '@/components/sd-toolbar.vue';
import SdTreemap from '@/components/sd-treemap.vue';
import { load, refresh } from '@/stores/scan-store';
import { loadSettings, settingsStore } from '@/stores/settings-store';

export default defineComponent({
  name: 'SdApp',
  components: { SdGameTable, SdLegend, SdStatusBar, SdToolbar, SdTreemap },
  async created() {
    await loadSettings();
    await load({ accurate: settingsStore.accurate });
  },
  methods: {
    onRefresh() {
      refresh({ accurate: settingsStore.accurate });
    },
  },
});
</script>
