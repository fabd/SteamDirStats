<template>
  <div class="sd-Treemap" @mouseleave="onLeave">
    <canvas
      ref="canvas"
      class="sd-Treemap-canvas"
      @mousemove="onMove"
      @click="onClick"
      @dblclick="onDoubleClick"
      @contextmenu.prevent="onContextMenu"
    />

    <p v-if="message" class="sd-Treemap-message">{{ message }}</p>

    <div v-if="tooltip" class="sd-Treemap-tooltip p-2" :style="tooltipStyle">
      <strong class="sd-Treemap-tooltipName">{{ tooltip.game.name }}</strong>
      <span class="sd-Treemap-tooltipSize">{{ formatSize(tooltip.game.total_size) }}</span>
      <span v-if="tooltip.game.workshop_size" class="sd-Treemap-tooltipDim">
        {{ formatSize(tooltip.game.size_on_disk) }} game files +
        {{ formatSize(tooltip.game.workshop_size) }} Workshop
      </span>
      <span class="sd-Treemap-tooltipDim">{{ tooltip.libraryLabel }}</span>
      <span class="sd-Treemap-tooltipDim">{{ formatPath(tooltip.game.install_path) }}</span>
      <span class="sd-Treemap-tooltipDim">appid {{ tooltip.game.appid }}</span>
    </div>

    <SdContextMenu ref="menu" @open-change="onMenuOpenChange" />
  </div>
</template>

<script lang="ts">
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import { defineComponent } from 'vue';

import SdContextMenu from '@/components/sd-context-menu.vue';

import type { Game } from '@/api/types';
import { formatPath, formatSize } from '@/lib/format';
import { colors, expandWorkshop, libraries, scanStore, select } from '@/stores/scan-store';
import { settingsStore } from '@/stores/settings-store';

/** Height of the strip holding a library's name in the grouped layout. */
const GROUP_HEADER = 17;
/** Tiles smaller than this get no label; there is no room for one. */
const MIN_LABEL_WIDTH = 42;
const MIN_LABEL_HEIGHT = 16;
/** A second line (the size) only fits above this height. */
const MIN_SIZE_LINE_HEIGHT = 32;
const TOOLTIP_WIDTH = 260;
/** Canvas text takes no CSS, so the window's font and colours are repeated. */
const FONT_STACK = '"Segoe UI", system-ui, sans-serif';
const LABEL_COLOR = '#e6e8ea';
/** For a game whose library is not in the palette (an unavailable drive). */
const FALLBACK_COLOR = '#4a4f57';

/** What d3 lays out: one leaf per game, one branch per library when grouped. */
interface TreeNode {
  value?: number;
  game?: Game;
  libraryPath?: string;
  libraryLabel?: string;
  children?: TreeNode[];
}

/** A laid-out game tile, in CSS pixels. */
interface Tile {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  game: Game;
  color: string;
  libraryLabel: string;
}

/** A library's block in the grouped layout, drawn behind its games. */
interface Group {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  label: string;
  size: number;
  color: string;
}

interface Layout {
  tiles: Tile[];
  groups: Group[];
}

export default defineComponent({
  name: 'SdTreemap',

  components: { SdContextMenu },

  data() {
    return {
      scan: scanStore,
      settings: settingsStore,
      /** The canvas size in CSS pixels, kept up to date by the ResizeObserver. */
      width: 0,
      height: 0,
      hovered: null as Tile | null,
      /** True while the context menu is up; the tooltip stands down for it. */
      isMenuOpen: false,
      pointer: { x: 0, y: 0 },
      observer: null as ResizeObserver | null,
    };
  },

  computed: {
    message(): string {
      if (this.scan.isLoading) {
        return 'Scanning…';
      }

      if (this.scan.error) {
        return '';
      }

      return this.layout.tiles.length ? '' : 'No installed games found.';
    },

    /**
     * Games per library, largest first, in the order the layout needs them.
     *
     * Built from `libraries` rather than the flat `games` list so each game
     * keeps its library's colour and label without having to search for it.
     */
    byLibrary(): { path: string; label: string; games: Game[] }[] {
      return libraries.value
        .map((library) => ({
          path: library.path,
          label: library.label || formatPath(library.path),
          games: library.games
            .filter((game) => game.total_size > 0)
            .slice()
            .sort((a, b) => b.total_size - a.total_size),
        }))
        .filter((library) => library.games.length > 0);
    },

    layout(): Layout {
      return this.buildLayout();
    },

    /**
     * The tile the tooltip describes, or null for no tooltip.
     *
     * Suppressed while the context menu is open: the menu is in the top layer
     * and the tooltip would show through from behind it.
     */
    tooltip(): Tile | null {
      return this.isMenuOpen ? null : this.hovered;
    },

    /** Position the tooltip beside the cursor, flipped to stay in view. */
    tooltipStyle(): Record<string, string> {
      const left =
        this.pointer.x + 14 + TOOLTIP_WIDTH > this.width
          ? Math.max(0, this.pointer.x - 14 - TOOLTIP_WIDTH)
          : this.pointer.x + 14;

      return { left: `${left}px`, top: `${this.pointer.y + 16}px`, width: `${TOOLTIP_WIDTH}px` };
    },
  },

  watch: {
    layout: 'draw',
    'scan.selected': 'draw',
    hovered: 'draw',
  },

  mounted() {
    this.observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      this.width = box.width;
      this.height = box.height;
    });
    this.observer.observe(this.$el as Element);
  },

  beforeUnmount() {
    this.observer?.disconnect();
  },

  methods: {
    formatSize,
    formatPath,

    buildLayout(): Layout {
      const empty: Layout = { tiles: [], groups: [] };

      if (this.width <= 0 || this.height <= 0) {
        return empty;
      }

      const isGrouped = this.settings.layout === 'grouped';
      const root: TreeNode = { children: isGrouped ? this.groupedNodes() : this.mixedNodes() };

      if (!root.children?.length) {
        return empty;
      }

      const laid = treemap<TreeNode>()
        .tile(treemapSquarify)
        .size([this.width, this.height])
        .paddingInner(1)
        .paddingOuter(isGrouped ? 2 : 0)
        .paddingTop(isGrouped ? GROUP_HEADER : 0)
        .round(true)(
        hierarchy(root, (node) => node.children)
          .sum((node) => node.value ?? 0)
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
      );

      const palette = colors.value;
      const tiles = laid.leaves().flatMap<Tile>((leaf) => {
        const game = leaf.data.game;

        // Sub-pixel tiles are invisible but would still answer hit tests.
        if (!game || leaf.x1 - leaf.x0 < 1 || leaf.y1 - leaf.y0 < 1) {
          return [];
        }

        return [
          {
            x0: leaf.x0,
            y0: leaf.y0,
            x1: leaf.x1,
            y1: leaf.y1,
            game,
            color: palette.get(leaf.data.libraryPath ?? '') ?? FALLBACK_COLOR,
            libraryLabel: leaf.data.libraryLabel ?? '',
          },
        ];
      });

      const groups = isGrouped
        ? (laid.children ?? []).map((node) => ({
            x0: node.x0,
            y0: node.y0,
            x1: node.x1,
            y1: node.y1,
            label: node.data.libraryLabel ?? '',
            size: node.value ?? 0,
            color: palette.get(node.data.libraryPath ?? '') ?? FALLBACK_COLOR,
          }))
        : [];

      return { tiles, groups };
    },

    /** Grouped: one branch per library, so its games stay contiguous. */
    groupedNodes(): TreeNode[] {
      return this.byLibrary.map((library) => ({
        libraryPath: library.path,
        libraryLabel: library.label,
        children: library.games.map((game) => this.leafNode(game, library)),
      }));
    },

    /** Mixed: every game at the top level, laid out by size alone. */
    mixedNodes(): TreeNode[] {
      return this.byLibrary
        .flatMap((library) => library.games.map((game) => this.leafNode(game, library)))
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    },

    leafNode(game: Game, library: { path: string; label: string }): TreeNode {
      return {
        game,
        value: game.total_size,
        libraryPath: library.path,
        libraryLabel: library.label,
      };
    },

    draw(): void {
      const canvas = this.$refs.canvas as HTMLCanvasElement | undefined;

      if (!canvas || this.width <= 0 || this.height <= 0) {
        return;
      }

      // Back the canvas with device pixels, then work in CSS pixels throughout.
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(this.width * ratio);
      canvas.height = Math.round(this.height * ratio);

      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return;
      }

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, this.width, this.height);

      for (const group of this.layout.groups) {
        this.drawGroup(ctx, group);
      }

      for (const tile of this.layout.tiles) {
        this.drawTile(ctx, tile);
      }
    },

    /** The library block: a tinted backing plus its name in the top strip. */
    drawGroup(ctx: CanvasRenderingContext2D, group: Group): void {
      ctx.fillStyle = group.color;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(group.x0, group.y0, group.x1 - group.x0, group.y1 - group.y0);
      ctx.globalAlpha = 1;

      const width = group.x1 - group.x0 - 8;

      if (width < MIN_LABEL_WIDTH) {
        return;
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(group.x0 + 4, group.y0, width, GROUP_HEADER);
      ctx.clip();
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = `600 11px ${FONT_STACK}`;
      ctx.textBaseline = 'middle';

      const label = `${group.label} — ${formatSize(group.size)}`;
      ctx.fillText(this.fitText(ctx, label, width), group.x0 + 4, group.y0 + GROUP_HEADER / 2);
      ctx.restore();
    },

    drawTile(ctx: CanvasRenderingContext2D, tile: Tile): void {
      const width = tile.x1 - tile.x0;
      const height = tile.y1 - tile.y0;
      const isSelected = tile.game.appid === this.scan.selected;

      ctx.fillStyle = tile.color;
      ctx.fillRect(tile.x0, tile.y0, width, height);

      if (tile.game.appid === this.hovered?.game.appid) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.fillRect(tile.x0, tile.y0, width, height);
      }

      // The selection outline is drawn inside the tile, so it never covers a
      // neighbour.
      if (isSelected && width > 2 && height > 2) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(tile.x0 + 1, tile.y0 + 1, width - 2, height - 2);
      } else {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(tile.x0 + 0.5, tile.y0 + 0.5, width - 1, height - 1);
      }

      if (width < MIN_LABEL_WIDTH || height < MIN_LABEL_HEIGHT) {
        return;
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(tile.x0 + 3, tile.y0 + 2, width - 6, height - 4);
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'top';
      ctx.font = `12px ${FONT_STACK}`;
      ctx.fillText(this.fitText(ctx, tile.game.name, width - 6), tile.x0 + 3, tile.y0 + 3);

      if (height >= MIN_SIZE_LINE_HEIGHT) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.font = `11px ${FONT_STACK}`;
        ctx.fillText(formatSize(tile.game.total_size), tile.x0 + 3, tile.y0 + 18);
      }
      ctx.restore();
    },

    /** Shorten to fit with an ellipsis, the way the table cells do. */
    fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
      if (ctx.measureText(text).width <= maxWidth) {
        return text;
      }

      let cut = text.length;

      while (cut > 1 && ctx.measureText(`${text.slice(0, cut)}…`).width > maxWidth) {
        cut -= 1;
      }

      return `${text.slice(0, cut)}…`;
    },

    /** The tile under a point; tiles never overlap, so the first hit wins. */
    tileAt(x: number, y: number): Tile | null {
      return (
        this.layout.tiles.find(
          (tile) => x >= tile.x0 && x < tile.x1 && y >= tile.y0 && y < tile.y1,
        ) ?? null
      );
    },

    pointerTile(event: MouseEvent): Tile | null {
      const box = (event.currentTarget as HTMLCanvasElement).getBoundingClientRect();
      this.pointer = { x: event.clientX - box.left, y: event.clientY - box.top };

      return this.tileAt(this.pointer.x, this.pointer.y);
    },

    /** The menu holds the hover highlight while it is up, and drops it after. */
    onMenuOpenChange(isOpen: boolean): void {
      this.isMenuOpen = isOpen;

      // Closing the menu does not move the mouse, and the pointer is rarely
      // back over the tile, so start from no hover rather than a stale one.
      if (!isOpen) {
        this.hovered = null;
      }
    },

    onMove(event: MouseEvent): void {
      // The canvas still sees moves around an open menu; leave the highlight
      // on the tile the menu belongs to.
      if (this.isMenuOpen) {
        return;
      }

      this.hovered = this.pointerTile(event);
    },

    onLeave(): void {
      if (this.isMenuOpen) {
        return;
      }

      this.hovered = null;
    },

    onClick(event: MouseEvent): void {
      const tile = this.pointerTile(event);

      select(tile ? tile.game.appid : null);
    },

    /**
     * Double-click lists the game's Workshop items in the table.
     *
     * A game with no items has nothing to show, so it is left alone rather
     * than scrolling the table to a row that will not change.
     */
    onDoubleClick(event: MouseEvent): void {
      const tile = this.pointerTile(event);

      if (tile && tile.game.workshop_items.length > 0) {
        expandWorkshop(tile.game.appid);
      }
    },

    /** Right-click a tile for the game menu; empty space has no menu. */
    onContextMenu(event: MouseEvent): void {
      const tile = this.pointerTile(event);

      if (!tile) {
        return;
      }

      this.hovered = tile;
      (this.$refs.menu as InstanceType<typeof SdContextMenu>).open(event, tile.game);
    },
  },
});
</script>
