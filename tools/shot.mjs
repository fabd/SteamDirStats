/**
 * Screenshot the running app's window contents.
 *
 * WebView2 is Edge, so it speaks the Chrome DevTools Protocol when started
 * with a debugging port. Node 18+ has fetch and Node 22+ a global WebSocket,
 * so this needs no packages.
 *
 *   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222" npx tauri dev
 *   node tools/shot.mjs window.png
 *
 * Either order: it waits for the window, and then for the page to have
 * something on it, since the first scan takes a moment to come back.
 * Captures the page only, not the native title bar or window frame.
 *
 *   node tools/shot.mjs out.png --port 9222 --wait-for ".sd-GameTable-row"
 *   node tools/shot.mjs out.png --wait-for ""      # shoot as soon as loaded
 */

const args = process.argv.slice(2);

function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}

const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const out = positional[0] ?? 'window.png';
const port = flag('port', '9222');
// Default to a table row: the app renders its chrome before the scan returns,
// so waiting only for "loaded" catches an empty window.
const waitFor = flag('wait-for', '.sd-GameTable-row');

const WAIT_MS = 30000;
const POLL_MS = 500;
const deadline = Date.now() + WAIT_MS;

const endpoint = `http://127.0.0.1:${port}/json/list`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll `check` until it returns a truthy value, or the deadline passes. */
async function until(check, message) {
  let announced = false;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() >= deadline) return null;
    if (!announced) {
      console.log(message);
      announced = true;
    }
    await sleep(POLL_MS);
  }
}

const page = await until(async () => {
  try {
    const targets = await (await fetch(endpoint)).json();
    return targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  } catch {
    return null; // Not listening yet.
  }
}, `Waiting for ${endpoint} ...`);

if (!page) {
  console.error(
    `No app window on port ${port} after ${WAIT_MS / 1000}s. Start it with:\n` +
      '  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222" npx tauri dev',
  );
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  pending.get(message.id)?.(message);
};

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const reply = await send('Runtime.evaluate', { expression, returnByValue: true });
  return reply.result?.result?.value;
}

const ready = await until(
  () =>
    evaluate(
      `document.readyState === 'complete'` +
        (waitFor ? ` && Boolean(document.querySelector(${JSON.stringify(waitFor)}))` : ''),
    ),
  waitFor ? `Waiting for ${waitFor} ...` : 'Waiting for the page to load ...',
);

if (!ready) {
  console.error(`Page never showed ${waitFor || 'content'} within ${WAIT_MS / 1000}s.`);
  ws.close();
  process.exit(1);
}

const shot = await send('Page.captureScreenshot', { format: 'png' });
const title = await evaluate('document.title');
ws.close();

if (!shot.result?.data) {
  console.error(`captureScreenshot failed: ${JSON.stringify(shot)}`);
  process.exit(1);
}

const { writeFileSync } = await import('node:fs');
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(`${title} -> ${out}`);
