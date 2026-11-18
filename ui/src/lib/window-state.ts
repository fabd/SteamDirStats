/**
 * Remember where the window was, and put it back there (plan.md §8).
 *
 * In TypeScript rather than Rust, and in our own `settings.json` rather than
 * `tauri-plugin-window-state`, which keeps its file in the OS config folder
 * and would break the portable single-file story.
 *
 * The window is created hidden (`"visible": false` in tauri.conf.json) and
 * shown by `restore()`, so it never appears at the default position first and
 * jumps to the saved one.
 */

import {
  getCurrentWindow,
  availableMonitors,
  LogicalSize,
  PhysicalPosition,
} from '@tauri-apps/api/window';

import { hasBackend, host } from '@/api/bridge';
import { load, save, type WindowPlacement } from '@core/settings.ts';

const MIN_VISIBLE = 80; // px of the window that must land on a monitor

/** Apply the saved placement, then show the window. */
export async function restore(): Promise<void> {
  if (!hasBackend()) {
    return;
  }

  const appWindow = getCurrentWindow();

  try {
    const placement = (await load(host())).window;

    if (placement && isSane(placement)) {
      await appWindow.setSize(new LogicalSize(placement.width, placement.height));

      if (await isOnScreen(placement)) {
        await appWindow.setPosition(new PhysicalPosition(placement.x, placement.y));
      } else {
        // The monitor it was on is gone (unplugged, or a different desk).
        await appWindow.center();
      }

      if (placement.maximized) {
        await appWindow.maximize();
      }
    }
  } catch (err) {
    // The window still opens, where Tauri put it. Logged rather than
    // swallowed: a missing window permission fails exactly like a missing
    // settings file, and silence here cost an afternoon once already.
    console.warn('Could not restore the window placement:', err);
  } finally {
    // Its own try: the window being shown matters more than it being focused,
    // and a hidden window is unrecoverable from the UI.
    try {
      await appWindow.show();
      await appWindow.setFocus();
    } catch (err) {
      console.warn('Could not show the window:', err);
    }
  }
}

/**
 * Start saving the placement as the window moves.
 *
 * Saved on close rather than on every move, and once more when the page is
 * hidden, because a window closed by the system may not run the close handler.
 */
export async function watch(): Promise<void> {
  if (!hasBackend()) {
    return;
  }

  const appWindow = getCurrentWindow();

  await appWindow.onCloseRequested(async () => {
    await persist();
  });

  window.addEventListener('pagehide', () => {
    void persist();
  });
}

async function persist(): Promise<void> {
  const appWindow = getCurrentWindow();

  try {
    const maximized = await appWindow.isMaximized();

    // Position and size of the restored window, not of the maximized one:
    // unmaximizing later should land where the user last had it.
    if (maximized) {
      const stored = (await load(host())).window;

      if (stored) {
        await save(host(), { window: { ...stored, maximized: true } });
      }

      return;
    }

    const position = await appWindow.outerPosition();
    const size = await appWindow.innerSize();
    const factor = await appWindow.scaleFactor();
    const logical = size.toLogical(factor);

    await save(host(), {
      window: {
        x: position.x,
        y: position.y,
        width: Math.round(logical.width),
        height: Math.round(logical.height),
        maximized: false,
      },
    });
  } catch {
    // A placement we could not save is not worth bothering the user about.
  }
}

function isSane(placement: WindowPlacement): boolean {
  return (
    Number.isFinite(placement.x) &&
    Number.isFinite(placement.y) &&
    placement.width >= 400 &&
    placement.height >= 300
  );
}

/**
 * Whether a usable part of the window would land on a monitor.
 *
 * Positions are physical pixels, which is what `availableMonitors()` reports,
 * so the two can be compared directly whatever the display scaling.
 *
 * It fails *closed*: when the monitors cannot be enumerated — which happens
 * while the window is still hidden, and is what sent a perfectly valid
 * placement to the centre of the screen once — the saved position is kept. It
 * was valid when it was written, so trusting it beats second-guessing it on
 * no evidence.
 */
async function isOnScreen(placement: WindowPlacement): Promise<boolean> {
  const monitors = await availableMonitors();

  if (monitors.length === 0) {
    return true;
  }

  return monitors.some((monitor) => {
    const right = monitor.position.x + monitor.size.width;
    const bottom = monitor.position.y + monitor.size.height;

    return (
      placement.x + MIN_VISIBLE > monitor.position.x &&
      placement.x < right - MIN_VISIBLE &&
      placement.y + MIN_VISIBLE > monitor.position.y &&
      placement.y < bottom - MIN_VISIBLE
    );
  });
}

/**
 * Send the window to the taskbar.
 *
 * Here rather than in the toolbar component because the window is this
 * module's business, and the custom title bar's buttons are the only reason
 * `allow-minimize` is in the capability file.
 */
export async function minimize(): Promise<void> {
  if (!hasBackend()) {
    return;
  }

  await getCurrentWindow().minimize();
}

/**
 * Close the window the way the system title bar used to.
 *
 * `close()` rather than `destroy()`: it fires the close request that `watch()`
 * listens for, so the placement is saved before the window goes away.
 */
export async function close(): Promise<void> {
  if (!hasBackend()) {
    return;
  }

  await getCurrentWindow().close();
}
