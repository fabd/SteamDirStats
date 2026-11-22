<template>
  <!--
    Native <dialog> + showModal(): the backdrop, the top layer and Esc all come
    for free. `close` fires for Esc as well as for our own button, so there is
    one way out of the open state.
  -->
  <dialog ref="dialog" class="sd-AboutDialog">
    <!-- The window's own close button, classes and all, rather than a second
         red cross styled from scratch (plan.md, About Dialog). -->
    <button
      class="sd-Toolbar-windowButton sd-Toolbar-windowIcon--filled sd-Toolbar-windowButton--close absolute top-2 right-2"
      type="button"
      title="Close"
      aria-label="Close"
      @click="close"
    >
      <IconWindowClose aria-hidden="true" focusable="false" />
    </button>

    <h2 class="text-2xl font-semibold mb-0">
      <span class="sd-AboutDialog-name">SteamDirStats</span>
      <span class="sd-AboutDialog-version">v{{ version }}</span>
    </h2>

    <!-- The @2x file at half its pixel size, so it stays crisp under display
         scaling; imported through the alias, like the title bar's icon, so it
         follows whatever the exe carries. -->
    <img class="mx-auto mb-4 mt-4 block border border-stone-700" :src="iconUrl" alt="" width="128" height="128" />

    <p class="text-[var(--sd-text-dim)] mb-1">by Fabrice D. (<span class="font-bold">fabd</span>)</p>

    <p class="text-[var(--sd-text-dim)] mb-1">
      Source code on
      <button type="button" class="sd-AboutDialog-link" @click="onOpenRepo">Github</button>
    </p>
  </dialog>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import iconUrl from '@icons/128x128@2x.png';

import IconWindowClose from '@/assets/icons/window-close.svg?component';

import { openRepo } from '@/api/bridge';
import { notify } from '@/stores/scan-store';

export default defineComponent({
  name: 'SdAboutDialog',
  components: { IconWindowClose },

  data() {
    return {
      iconUrl,
      /** Injected at build time from the version the exe itself carries. */
      version: __APP_VERSION__,
    };
  },

  methods: {
    /** Called by the owner (app.vue) rather than driven by a prop. */
    open(): void {
      this.dialog().showModal();
    },

    close(): void {
      this.dialog().close();
    },

    async onOpenRepo(): Promise<void> {
      try {
        await openRepo();
      } catch (err) {
        notify(err instanceof Error ? err.message : String(err));
      }
    },

    dialog(): HTMLDialogElement {
      return this.$refs.dialog as HTMLDialogElement;
    },
  },
});
</script>
