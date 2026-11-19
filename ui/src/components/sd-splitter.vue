<template>
  <div
    class="sd-Splitter"
    :class="{ 'is-active': isDragging }"
    role="separator"
    aria-orientation="horizontal"
    aria-label="Resize the table and treemap panes"
    tabindex="0"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @lostpointercapture="onPointerCancel"
    @pointercancel="onPointerCancel"
    @dblclick="$emit('reset')"
    @keydown="onKeyDown"
  />
</template>

<script lang="ts">
import { defineComponent } from 'vue';

/** How far one arrow-key press moves the split, in CSS pixels. */
const NUDGE = 16;

/**
 * The drag handle between two panes.
 *
 * It owns the pointer, not the geometry: the parent knows where its panes
 * are, so the handle only reports where the pointer is (`drag`), how far the
 * keyboard asked to move (`nudge`), and that a double-click asked for the
 * default back (`reset`).
 */
export default defineComponent({
  name: 'SdSplitter',

  emits: ['drag', 'nudge', 'reset'],

  data() {
    return { isDragging: false };
  },

  methods: {
    /**
     * Pointer capture keeps the drag alive over the table and the canvas,
     * which both answer mouse events of their own, and `preventDefault()`
     * stops the gesture from selecting the text it passes over.
     */
    onPointerDown(event: PointerEvent): void {
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      this.isDragging = true;
    },

    onPointerMove(event: PointerEvent): void {
      if (!this.isDragging) {
        return;
      }

      this.$emit('drag', event.clientY);
    },

    onPointerUp(event: PointerEvent): void {
      const handle = event.currentTarget as HTMLElement;

      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }

      this.onPointerCancel();
    },

    /** Also the end of the drag when the capture is lost to something else. */
    onPointerCancel(): void {
      this.isDragging = false;
    },

    onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
        return;
      }

      event.preventDefault();
      this.$emit('nudge', event.key === 'ArrowUp' ? -NUDGE : NUDGE);
    },
  },
});
</script>
