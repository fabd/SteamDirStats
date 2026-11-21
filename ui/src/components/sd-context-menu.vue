<template>
  <div
    ref="menu"
    popover="auto"
    class="sd-ContextMenu"
    :style="position"
    @toggle="onToggle"
    @contextmenu.prevent
  >
    <template v-if="target?.kind === 'game'">
      <button
        v-if="hasWorkshopItems"
        type="button"
        class="sd-ContextMenu-item px-3 py-1"
        @click="onViewWorkshop"
      >
        View Workshop Items
      </button>
      <button type="button" class="sd-ContextMenu-item px-3 py-1" @click="onViewStorePage">
        View Store page
      </button>
    </template>

    <button v-else type="button" class="sd-ContextMenu-item px-3 py-1" @click="onViewOnWorkshop">
      View on Steam Workshop
    </button>

    <button type="button" class="sd-ContextMenu-item px-3 py-1" @click="onOpenFolder">
      Browse local files
    </button>

    <template v-if="target?.kind === 'game'">
      <hr class="sd-ContextMenu-separator" />
      <button type="button" class="sd-ContextMenu-item px-3 py-1" @click="onUninstall">
        Uninstall…
      </button>
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { openFolder, storePage, uninstall, workshopPage } from '@/api/bridge';
import type { Game, WorkshopItem } from '@core/models.ts';
import { expandWorkshop, notify, select } from '@/stores/scan-store';

/**
 * What the menu was opened on: game or workshop item.
 */
export type MenuTarget =
  { kind: 'game'; game: Game } | { kind: 'item'; game: Game; item: WorkshopItem };

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
      target: null as MenuTarget | null,
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
      return (this.target?.game.workshop_items.length ?? 0) > 0;
    },
  },

  methods: {
    /**
     * Open the menu for a game or one of its Workshop items, at the cursor.
     *
     * Called by the view that owns the menu (the treemap, the table) rather
     * than driven by a prop, so the menu holds no state of its own between
     * right-clicks.
     */
    open(event: MouseEvent, target: MenuTarget): void {
      this.target = target;
      select(target.game.appid);

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
        this.target = null;
      }

      this.$emit('open-change', isOpen);
    },

    /** Expand the game's Workshop items in the table (plan.md feature 5). */
    onViewWorkshop(): void {
      const target = this.target;
      this.close();

      if (target) {
        expandWorkshop(target.game.appid);
      }
    },

    /** The game's page in the Steam client's store. */
    async onViewStorePage(): Promise<void> {
      const target = this.target;
      this.close();

      if (!target) {
        return;
      }

      try {
        await storePage(target.game.appid);
      } catch (err) {
        notify(err instanceof Error ? err.message : String(err));
      }
    },

    /**
     * Open the item's page in Steam, where Unsubscribe removes it.
     *
     * Steam has no protocol action for unsubscribing from one item, so this
     * is as far as we can take the user (plan.md §7c), and why an item has no
     * uninstall entry of its own.
     */
    async onViewOnWorkshop(): Promise<void> {
      const target = this.target;
      this.close();

      if (target?.kind !== 'item') {
        return;
      }

      try {
        await workshopPage(target.item.itemid);
      } catch (err) {
        notify(err instanceof Error ? err.message : String(err));
      }
    },

    /** Explorer, via the `open_folder` command; the path comes from the scan. */
    async onOpenFolder(): Promise<void> {
      const target = this.target;
      this.close();

      if (!target) {
        return;
      }

      const path = target.kind === 'item' ? target.item.path : target.game.install_path;

      try {
        // A folder that is gone (uninstalled since the scan) makes the command
        // itself fail, so there is no separate "did it open?" answer to check.
        await openFolder(path);
      } catch (err) {
        notify(`Could not open the folder: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    /**
     * Hand the uninstall to Steam, with no confirmation of our own: Steam
     * shows its dialog, where the user can still cancel (plan.md, feature 4).
     */
    async onUninstall(): Promise<void> {
      const target = this.target;
      this.close();

      if (!target) {
        return;
      }

      try {
        await uninstall(target.game.appid);
      } catch (err) {
        notify(err instanceof Error ? err.message : String(err));
      }
    },
  },
});
</script>
