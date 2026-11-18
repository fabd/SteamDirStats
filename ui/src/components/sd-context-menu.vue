<template>
  <div
    ref="menu"
    popover="auto"
    class="sd-ContextMenu"
    :style="position"
    @toggle="onToggle"
    @contextmenu.prevent
  >
    <button
      v-if="hasWorkshopItems"
      type="button"
      class="sd-ContextMenu-item px-3 py-1"
      @click="onViewWorkshop"
    >
      View Workshop Items
    </button>
    <button type="button" class="sd-ContextMenu-item px-3 py-1" @click="onOpenFolder">
      Browse local files
    </button>
    <hr class="sd-ContextMenu-separator" />
    <button type="button" class="sd-ContextMenu-item px-3 py-1" @click="onUninstall">
      Uninstall…
    </button>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { openFolder, uninstall } from '@/api/bridge';
import type { Game } from '@core/models.ts';
import { expandWorkshop, notify, select } from '@/stores/scan-store';

/** Gap between the cursor and the menu, so the pointer never sits on an item. */
const CURSOR_OFFSET = 2;
/** Keep the menu this far from the window edges when it has to be nudged back. */
const EDGE_MARGIN = 4;

export default defineComponent({
  name: 'SdContextMenu',

  /** So the view that owns the menu can hide its own hover affordances. */
  emits: ['open-change'],

  data() {
    return {
      game: null as Game | null,
      left: 0,
      top: 0,
    };
  },

  computed: {
    position(): Record<string, string> {
      return { left: `${this.left}px`, top: `${this.top}px` };
    },

    /** Most games have none, and then the entry is left out entirely. */
    hasWorkshopItems(): boolean {
      return (this.game?.workshop_items.length ?? 0) > 0;
    },
  },

  methods: {
    /**
     * Open the menu for a game at the cursor.
     *
     * Called by the view that owns the menu (the treemap) rather than driven
     * by a prop, so the menu holds no state of its own between right-clicks.
     */
    open(event: MouseEvent, game: Game): void {
      this.game = game;
      select(game.appid);

      // Position at the cursor first: the menu has no box to measure until it
      // is shown, and starting from the right place avoids a visible jump.
      this.left = event.clientX + CURSOR_OFFSET;
      this.top = event.clientY + CURSOR_OFFSET;

      const menu = this.$refs.menu as HTMLElement;

      // `popover="auto"` gives us Esc and outside-click dismissal for free,
      // but a second right-click would otherwise land on an open menu.
      if (menu.matches(':popover-open')) {
        menu.hidePopover();
      }

      menu.showPopover();
      this.keepInView(menu);
      menu.querySelector<HTMLButtonElement>('.sd-ContextMenu-item')?.focus();
    },

    close(): void {
      const menu = this.$refs.menu as HTMLElement | undefined;

      if (menu?.matches(':popover-open')) {
        menu.hidePopover();
      }
    },

    /** Flip the menu back over the cursor when it would fall off-screen. */
    keepInView(menu: HTMLElement): void {
      const width = menu.offsetWidth;
      const height = menu.offsetHeight;

      if (this.left + width > window.innerWidth) {
        this.left = Math.max(EDGE_MARGIN, this.left - CURSOR_OFFSET * 2 - width);
      }

      if (this.top + height > window.innerHeight) {
        this.top = Math.max(EDGE_MARGIN, window.innerHeight - EDGE_MARGIN - height);
      }
    },

    onToggle(event: Event): void {
      const isOpen = (event as ToggleEvent).newState === 'open';

      if (!isOpen) {
        this.game = null;
      }

      this.$emit('open-change', isOpen);
    },

    /** Expand the game's Workshop items in the table (plan.md feature 5). */
    onViewWorkshop(): void {
      const game = this.game;
      this.close();

      if (game) {
        expandWorkshop(game.appid);
      }
    },

    /** Explorer, via the opener plugin; the path comes from the scan, not the page. */
    async onOpenFolder(): Promise<void> {
      const game = this.game;
      this.close();

      if (!game) {
        return;
      }

      try {
        // A folder that is gone (uninstalled since the scan) makes the opener
        // itself fail, so there is no separate "did it open?" answer to check.
        await openFolder(game.install_path);
      } catch {
        notify(`Could not open the folder: ${game.install_path}`);
      }
    },

    /**
     * Hand the uninstall to Steam, with no confirmation of our own: Steam
     * shows its dialog, where the user can still cancel (plan.md, feature 4).
     */
    async onUninstall(): Promise<void> {
      const game = this.game;
      this.close();

      if (!game) {
        return;
      }

      try {
        await uninstall(game.appid);
      } catch (err) {
        notify(err instanceof Error ? err.message : String(err));
      }
    },
  },
});
</script>
