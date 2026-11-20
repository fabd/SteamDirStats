<template>
  <table ref="table" class="sd-GameTable">
    <thead>
      <tr>
        <th class="sd-GameTable-header">Game</th>
        <th class="sd-GameTable-header text-right">Size</th>
        <th class="sd-GameTable-header text-right">Workshop</th>
        <th class="sd-GameTable-header text-right">Playtime</th>
        <th class="sd-GameTable-header">Last played</th>
        <th class="sd-GameTable-header">Library</th>
      </tr>
    </thead>
    <tbody>
      <template v-for="row in rows" :key="row.key">
        <tr
          v-if="row.kind === 'game'"
          class="sd-GameTable-row"
          :class="{ 'is-selected': row.game.appid === scan.selected }"
          :data-appid="row.game.appid"
          @click="select(row.game.appid)"
          @dblclick="onGameDoubleClick(row.game)"
        >
          <td class="sd-GameTable-cell">{{ row.game.name }}</td>
          <td class="sd-GameTable-cell sd-GameTable-cell--size">
            {{ formatSize(row.game.total_size) }}
          </td>
          <td class="sd-GameTable-cell sd-GameTable-cell--dim">
            <span class="flex items-center justify-end gap-2">
              <button
                v-if="row.game.workshop_items.length"
                type="button"
                class="sd-GameTable-toggle mr-auto"
                :class="{ 'is-expanded': isExpanded(row.game.appid) }"
                :aria-expanded="isExpanded(row.game.appid)"
                :title="`${row.game.workshop_items.length} Workshop items`"
                @click.stop="toggleExpanded(row.game.appid)"
              >
                <span class="sd-GameTable-chevron" aria-hidden="true">&#9656;</span>
              </button>
              <span class="sd-GameTable-num">
                {{ row.game.workshop_size ? formatSize(row.game.workshop_size) : '' }}
              </span>
            </span>
          </td>
          <td class="sd-GameTable-cell sd-GameTable-cell--play sd-GameTable-cell--dim">
            {{ formatPlaytime(row.game.playtime) }}
          </td>
          <td class="sd-GameTable-cell sd-GameTable-cell--dim">
            {{ formatLastPlayed(row.game.last_played) }}
          </td>
          <td class="sd-GameTable-cell sd-GameTable-cell--dim">
            <span
              class="sd-LibrarySwatch mr-2 align-middle"
              :style="{ background: gameColor(row.game) }"
            />{{ libraryLabelFromGame(row.game) }}
          </td>
        </tr>

        <tr
          v-else
          class="sd-GameTable-row sd-GameTable-row--item"
          :class="{ 'is-selected': row.game.appid === scan.selected }"
          @click="select(row.game.appid)"
        >
          <td class="sd-GameTable-cell sd-GameTable-cell--item">
            {{ itemName(row.item) }}
          </td>
          <td class="sd-GameTable-cell sd-GameTable-cell--size" />
          <td class="sd-GameTable-cell sd-GameTable-cell--size sd-GameTable-cell--dim">
            {{ formatSize(row.item.size) }}
          </td>
          <td class="sd-GameTable-cell" />
          <td class="sd-GameTable-cell" />
          <td class="sd-GameTable-cell">
            <button
              type="button"
              class="sd-GameTable-danger"
              @click.stop="onViewOnWorkshop(row.item)"
            >
              View on Steam Workshop
            </button>
          </td>
        </tr>
      </template>
    </tbody>
  </table>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { workshopPage } from '@/api/bridge';
import { gameColor } from '@/lib/colors';
import { libraryLabelFromGame } from '@/lib/libraries';
import type { Game, WorkshopItem } from '@core/models.ts';
import { formatLastPlayed, formatPlaytime, formatSize } from '@core/format.ts';
import {
  clearRevealed,
  games,
  isExpanded,
  notify,
  scanStore,
  select,
  toggleExpanded,
} from '@/stores/scan-store';

/**
 * One table row: a game, or one of its Workshop items underneath it.
 *
 * Both kinds live in the same flat list so the table stays a single loop and
 * the browser keeps one set of column widths across game and item rows.
 */
type Row =
  | { kind: 'game'; key: string; game: Game }
  | { kind: 'item'; key: string; game: Game; item: WorkshopItem };

export default defineComponent({
  name: 'SdGameTable',

  data() {
    return { scan: scanStore };
  },

  computed: {
    rows(): Row[] {
      return games.value.flatMap((game) => {
        const gameRow: Row = { kind: 'game', key: `game-${game.appid}`, game };

        if (!isExpanded(game.appid)) {
          return [gameRow];
        }

        // Largest first, like the game rows, and independently of them. The
        // scan's own order is left alone: it is shared with the treemap.
        const items = [...game.workshop_items].sort((a, b) => b.size - a.size);

        return [
          gameRow,
          ...items.map((item): Row => ({ kind: 'item', key: `item-${item.itemid}`, game, item })),
        ];
      });
    },
  },

  watch: {
    /** Scroll to a game the treemap just expanded, then drop the request. */
    'scan.revealed'(appid: number | null) {
      if (appid === null) {
        return;
      }

      this.$nextTick(() => {
        const table = this.$refs.table as HTMLElement | undefined;
        const row = table?.querySelector(`[data-appid="${appid}"]`);

        row?.scrollIntoView({ block: 'nearest' });
        clearRevealed();
      });
    },
  },

  methods: {
    formatSize,
    formatPlaytime,
    formatLastPlayed,
    select,
    isExpanded,
    toggleExpanded,
    gameColor,
    libraryLabelFromGame,

    /** Items whose name the lookup could not resolve show their id instead. */
    itemName(item: WorkshopItem): string {
      return item.name || `Item ${item.itemid}`;
    },

    onGameDoubleClick(game: Game): void {
      if (game.workshop_items.length) {
        toggleExpanded(game.appid);
      }
    },

    /**
     * Open the item's page in Steam, where Unsubscribe removes it.
     *
     * Steam has no protocol action for unsubscribing from one item, so this
     * is as far as we can take the user (plan.md §7c).
     */
    async onViewOnWorkshop(item: WorkshopItem): Promise<void> {
      try {
        await workshopPage(item.itemid);
      } catch (err) {
        notify(err instanceof Error ? err.message : String(err));
      }
    },
  },
});
</script>
