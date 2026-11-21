<template>
  <div class="sd-App">
    <SdToolbar @about="onAbout" @refresh="onRefresh" />
    <main ref="content" class="sd-App-content" :style="contentStyle">
      <div class="sd-App-table">
        <SdGameTable />
      </div>
      <SdSplitter @drag="onSplitDrag" @nudge="onSplitNudge" @reset="onSplitReset" />
      <div class="sd-App-map">
        <SdTreemap />
        <SdLegend />
      </div>
    </main>
    <SdStatusBar />
    <SdAboutDialog ref="about" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import SdAboutDialog from '@/components/dialogs/sd-about-dialog.vue';
import SdGameTable from '@/components/sd-game-table.vue';
import SdLegend from '@/components/sd-legend.vue';
import SdSplitter from '@/components/sd-splitter.vue';
import SdStatusBar from '@/components/sd-status-bar.vue';
import SdToolbar from '@/components/sd-toolbar.vue';
import SdTreemap from '@/components/sd-treemap.vue';
import { load, refresh } from '@/stores/scan-store';
import { loadSettings, settingsStore } from '@/stores/settings-store';

/**
 * The table's share of the content area at startup; the treemap takes the
 * rest. The split is deliberately not stored: every run starts here.
 */
const DEFAULT_SPLIT = 0.6;

/** Neither pane may be dragged below this height, in CSS pixels. */
const MIN_PANE = 90;

export default defineComponent({
  name: 'SdApp',
  components: {
    SdAboutDialog,
    SdGameTable,
    SdLegend,
    SdSplitter,
    SdStatusBar,
    SdToolbar,
    SdTreemap,
  },

  data() {
    return { split: DEFAULT_SPLIT };
  },

  computed: {
    /**
     * The split as two `fr` tracks with the handle's own row between them.
     *
     * Fractions rather than pixels, so the panes keep their proportions when
     * the window is resized. `minmax(0, …)` keeps a row from being pushed out
     * by its content: the treemap shrinks and the table scrolls instead.
     */
    contentStyle(): Record<string, string> {
      return {
        gridTemplateRows: `minmax(0, ${this.split}fr) auto minmax(0, ${1 - this.split}fr)`,
      };
    },
  },

  async created() {
    await loadSettings();
    await load({ accurate: settingsStore.accurate });
  },

  methods: {
    onAbout(): void {
      (this.$refs.about as InstanceType<typeof SdAboutDialog>).open();
    },

    onRefresh() {
      refresh({ accurate: settingsStore.accurate });
    },

    onSplitDrag(clientY: number): void {
      const box = this.contentBox();

      if (box) {
        this.applySplit((clientY - box.top) / box.height);
      }
    },

    onSplitNudge(delta: number): void {
      const box = this.contentBox();

      if (box) {
        this.applySplit(this.split + delta / box.height);
      }
    },

    onSplitReset(): void {
      this.split = DEFAULT_SPLIT;
    },

    /** Clamp so both panes stay usable, then apply live. */
    applySplit(fraction: number): void {
      const box = this.contentBox();

      if (!box) {
        return;
      }

      // A window too short for two minimums gets no clamp at all; the panes
      // are cramped either way, and half a limit would pin the handle.
      const limit = box.height > MIN_PANE * 2 ? MIN_PANE / box.height : 0;

      this.split = Math.min(Math.max(fraction, limit), 1 - limit);
    },

    contentBox(): DOMRect | null {
      const content = this.$refs.content as HTMLElement | undefined;

      return content ? content.getBoundingClientRect() : null;
    },
  },
});
</script>
