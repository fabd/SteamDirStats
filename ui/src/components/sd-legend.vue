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
import { libraries } from '@/stores/scan-store';

interface Entry {
  path: string;
  label: string;
  color: string;
  size: string;
  share: string;
}

export default defineComponent({
  name: 'SdLegend',
  computed: {
    /** One row per library, matching the treemap's colours. */
    entries(): Entry[] {
      return libraries.value.map((library) => {
        const size = library.size_on_disk + library.workshop_size;
        // How much of its own drive the library takes; blank for a library on
        // a drive we could not measure (unplugged, or disk_usage refused).
        const share = formatShare(size, library.disk_total ?? 0);

        return {
          path: library.path,
          label: libraryLabel(library),
          color: libraryColor(library.path),
          size: formatSize(size),
          share: share ? `(${share} of disk)` : '',
        };
      });
    },
  },
});
</script>
