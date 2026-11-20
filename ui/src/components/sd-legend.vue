<template>
  <ul class="sd-Legend flex flex-wrap items-center gap-x-5 gap-y-1 px-3 py-2">
    <li v-for="entry in entries" :key="entry.path" class="flex items-center gap-2">
      <span class="sd-LibrarySwatch" :style="{ background: entry.color }" />
      <span class="sd-Legend-label">{{ entry.label }}</span>
      <span class="sd-Legend-size">{{ entry.size }}</span>
      <span v-if="entry.share" class="sd-Legend-share">{{ entry.share }}</span>
    </li>
  </ul>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { formatShare, formatSize } from '@core/format.ts';
import { libraryColor } from '@/lib/colors';
import { libraryLabel } from '@/lib/libraries';
import { libraries, scanStore } from '@/stores/scan-store';

interface Entry {
  path: string;
  label: string;
  color: string;
  size: string;
  share: string;
}

export default defineComponent({
  name: 'SdLegend',
  data() {
    return { scan: scanStore };
  },
  computed: {
    /** One row per library, matching the treemap's colours. */
    entries(): Entry[] {
      const total = (this.scan.data?.size_on_disk ?? 0) + (this.scan.data?.workshop_size ?? 0);
      return libraries.value.map((library) => {
        const size = library.size_on_disk + library.workshop_size;
        return {
          path: library.path,
          label: libraryLabel(library),
          color: libraryColor(library.path),
          size: formatSize(size),
          share: formatShare(size, total),
        };
      });
    },
  },
});
</script>
