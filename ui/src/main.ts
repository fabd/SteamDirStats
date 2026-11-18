import { createApp } from 'vue';

import SdApp from '@/app.vue';
import { restore, watch } from '@/lib/window-state';
import '@/styles/main.css';

createApp(SdApp).mount('#app');

// The window is created hidden; it is shown once its saved placement has been
// applied, so it does not jump across the screen on startup (plan.md §8).
void restore();
void watch();
