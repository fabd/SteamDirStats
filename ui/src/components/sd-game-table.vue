<template>
  <table class="sd-GameTable">
    <thead>
      <tr>
        <th class="sd-GameTable-header px-3 py-1">Game</th>
        <th class="sd-GameTable-header px-3 py-1 text-right">Size</th>
        <th class="sd-GameTable-header px-3 py-1 text-right">Workshop</th>
        <th class="sd-GameTable-header px-3 py-1 text-right">Playtime</th>
        <th class="sd-GameTable-header px-3 py-1">Last played</th>
        <th class="sd-GameTable-header px-3 py-1">Library</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="game in rows"
        :key="game.appid"
        class="sd-GameTable-row"
        :class="{ 'is-selected': game.appid === scan.selected }"
        @click="select(game.appid)"
        @dblclick="inspect(game.appid)"
      >
        <td class="sd-GameTable-cell px-3 py-1">{{ game.name }}</td>
        <td class="sd-GameTable-cell sd-GameTable-cell--size px-3 py-1">
          {{ formatSize(game.total_size) }}
        </td>
        <td class="sd-GameTable-cell sd-GameTable-cell--size sd-GameTable-cell--dim px-3 py-1">
          {{ game.workshop_size ? formatSize(game.workshop_size) : '' }}
        </td>
        <td class="sd-GameTable-cell sd-GameTable-cell--play sd-GameTable-cell--dim px-3 py-1">
          {{ formatPlaytime(game.playtime) }}
        </td>
        <td class="sd-GameTable-cell sd-GameTable-cell--dim px-3 py-1">
          {{ formatLastPlayed(game.last_played) }}
        </td>
        <td class="sd-GameTable-cell sd-GameTable-cell--dim px-3 py-1">
          <span
            class="sd-GameTable-swatch mr-2 align-middle"
            :style="{ background: colorOf(game) }"
          />{{ libraryLabel(game) }}
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import type { Game } from '@/api/types';
import { formatLastPlayed, formatPath, formatPlaytime, formatSize } from '@/lib/format';
import { colors, games, inspect, libraryOf, scanStore, select } from '@/stores/scan-store';

export default defineComponent({
  name: 'SdGameTable',
  data() {
    return { scan: scanStore };
  },
  computed: {
    rows(): Game[] {
      return games.value;
    },
  },
  methods: {
    formatSize,
    formatPlaytime,
    formatLastPlayed,
    select,
    inspect,
    colorOf(game: Game): string {
      const library = libraryOf(game);
      return library ? (colors.value.get(library.path) ?? 'transparent') : 'transparent';
    },
    /** The library's label, or its path when Steam stored no label. */
    libraryLabel(game: Game): string {
      const library = libraryOf(game);
      if (!library) return '';
      return library.label || formatPath(library.path);
    },
  },
});
</script>
