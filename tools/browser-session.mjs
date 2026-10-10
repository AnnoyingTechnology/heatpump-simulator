// Local QA only: native CDP connection to the project's isolated Chromium profile.
import { writeFile } from 'node:fs/promises';

export async function openPage(url, width = 1600, height = 1000, options = {}) {
  const response = await fetch(`http://127.0.0.1:9223/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Chromium target creation: ${response.status}`);
  const target = await response.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const events = [];
  let nextId = 0;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const handler = pending.get(message.id);
      if (handler) {
        pending.delete(message.id);
        clearTimeout(handler.timeout);
        if (message.error) handler.reject(new Error(JSON.stringify(message.error)));
        else handler.resolve(message.result);
      }
    } else events.push(message);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  // A long numerical QA run must not be replaced by Vite's development reload during concurrent source edits.
  // Blocking applies only to this isolated test target; production checks leave networking untouched.
  if (options.blockedUrls?.length) await send('Network.setBlockedURLs', { urls: options.blockedUrls });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  await send('Page.navigate', { url });
  return {
    send, evaluate, events, target,
    async waitFor(expression, timeoutMs = 20000) {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        if (await evaluate(expression)) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Browser condition timeout: ${expression}`);
    },
    async screenshot(path) {
      const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      await writeFile(path, Buffer.from(result.data, 'base64'));
    },
    async close() {
      socket.close();
      await fetch(`http://127.0.0.1:9223/json/close/${target.id}`);
    },
  };
}
