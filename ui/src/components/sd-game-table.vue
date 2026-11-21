<template>
  <table ref="table" class="sd-GameTable">
    <thead>
      <tr>
        <th
          v-for="column in columns"
          :key="column.key"
          scope="col"
          class="sd-GameTable-header"
          :class="{
            'is-sorted': sortKey === column.key,
            'is-ascending': sortKey === column.key && isAscending,
          }"
          :aria-sort="ariaSort(column.key)"
        >
          <button
            type="button"
            class="sd-GameTable-sort flex w-full items-center gap-1"
            :class="{ 'justify-end': column.isNumeric }"
            @click="sortBy(column.key)"
          >
            {{ column.label }}
            <span class="sd-GameTable-sortIcon" aria-hidden="true">&#9662;</span>
          </button>
        </th>
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
          @contextmenu.prevent="onGameContextMenu($event, row.game)"
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
          @contextmenu.prevent="onItemContextMenu($event, row.game, row.item)"
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

  <SdContextMenu ref="menu" />
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import SdContextMenu from '@/components/sd-context-menu.vue';

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

/** The column a click on a header sorts the game rows by. */
type SortKey = 'name' | 'size' | 'workshop' | 'playtime' | 'lastPlayed' | 'library';

interface Column {
  key: SortKey;
  label: string;
  /** Right-aligned, and sorted largest first on the first click. */
  isNumeric: boolean;
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Game', isNumeric: false },
  { key: 'size', label: 'Size', isNumeric: true },
  { key: 'workshop', label: 'Workshop', isNumeric: true },
  { key: 'playtime', label: 'Playtime', isNumeric: true },
  { key: 'lastPlayed', label: 'Last played', isNumeric: false },
  { key: 'library', label: 'Library', isNumeric: false },
];

/** Numeric so "Portal 2" follows "Portal", not "Portal 12". */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * One comparator per column, all of them ascending; the header flips the
 * result when the sort is descending.
 *
 * A game that was never played has no playtime and no last-played date, and
 * a game without mods has no Workshop size, so those columns cluster every
 * such game together; the tie-break in `sortedGames` orders the cluster.
 */
const COMPARATORS: Record<SortKey, (a: Game, b: Game) => number> = {
  name: (a, b) => collator.compare(a.name, b.name),
  size: (a, b) => a.total_size - b.total_size,
  workshop: (a, b) => a.workshop_size - b.workshop_size,
  playtime: (a, b) => (a.playtime ?? 0) - (b.playtime ?? 0),
  lastPlayed: (a, b) => (a.last_played ?? 0) - (b.last_played ?? 0),
  // The label the cell shows, not the path, or the order looks arbitrary.
  library: (a, b) => collator.compare(libraryLabelFromGame(a), libraryLabelFromGame(b)),
};

export default defineComponent({
  name: 'SdGameTable',
  components: { SdContextMenu },

  data() {
    return {
      scan: scanStore,
      // Largest first, which is the order the scan store already hands us,
      // so the table looks the same until a header is clicked. Deliberately
      // not persisted: every run starts here, like the treemap / table split.
      sortKey: 'size' as SortKey,
      isAscending: false,
    };
  },

  computed: {
    columns(): Column[] {
      return COLUMNS;
    },

    sortedGames(): Game[] {
      const compare = COMPARATORS[this.sortKey];
      const direction = this.isAscending ? 1 : -1;

      return [...games.value].sort((a, b) => {
        const order = compare(a, b) * direction;

        // Ties keep the biggest games at the top of their cluster, and give
        // the sort a stable order of its own.
        return order || b.total_size - a.total_size;
      });
    },

    rows(): Row[] {
      return this.sortedGames.flatMap((game) => {
        const gameRow: Row = { kind: 'game', key: `game-${game.appid}`, game };

        if (!isExpanded(game.appid)) {
          return [gameRow];
        }

        // Always largest first, whatever the game rows are sorted by: an
        // item row is a child of its game, not a peer of the other rows.
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

    /** Clicking the sorted column flips it; a new one starts its own way. */
    sortBy(key: SortKey): void {
      if (this.sortKey === key) {
        this.isAscending = !this.isAscending;

        return;
      }

      this.sortKey = key;
      this.isAscending = !COLUMNS.find((column) => column.key === key)?.isNumeric;
    },

    ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
      if (this.sortKey !== key) {
        return 'none';
      }

      return this.isAscending ? 'ascending' : 'descending';
    },

    /** Items whose name the lookup could not resolve show their id instead. */
    itemName(item: WorkshopItem): string {
      return item.name || `Item ${item.itemid}`;
    },

    /**
     * Right-click a row for the same menu the treemap opens on a tile.
     *
     * The table has its own instance rather than sharing the treemap's: the
     * menu keeps no state between right-clicks, and a right-click elsewhere
     * light-dismisses the other popover, so only one is ever up.
     */
    onGameContextMenu(event: MouseEvent, game: Game): void {
      this.menu().open(event, { kind: 'game', game });
    },

    /** An item row's menu acts on the item, not on the game above it. */
    onItemContextMenu(event: MouseEvent, game: Game, item: WorkshopItem): void {
      this.menu().open(event, { kind: 'item', game, item });
    },

    menu(): InstanceType<typeof SdContextMenu> {
      return this.$refs.menu as InstanceType<typeof SdContextMenu>;
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
