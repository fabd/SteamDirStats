<template>
  <div class="sd-App">
    <SdToolbar @refresh="onRefresh" />
    <main class="sd-App-content">
      <SdGameTable />
    </main>
    <SdStatusBar />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

import SdGameTable from "@/components/sd-game-table.vue";
import SdStatusBar from "@/components/sd-status-bar.vue";
import SdToolbar from "@/components/sd-toolbar.vue";
import { load, refresh } from "@/stores/scan-store";
import { loadSettings, settingsStore } from "@/stores/settings-store";

export default defineComponent({
  name: "SdApp",
  components: { SdGameTable, SdStatusBar, SdToolbar },
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
