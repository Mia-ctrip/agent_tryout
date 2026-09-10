/** Isolated visual fixtures, never a backend/real-device acceptance test.
 * Run with Expo web on localhost:8082. Uses an ephemeral headless Chrome profile.
 * Every API request is intercepted; no test account or record is persisted.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHistoryFaceSvg, HISTORY_FACE_BOUNDARY } from '../src/lib/history-face-visual.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'artifacts/ui-rebuild-review');
const assets = path.join(root, 'design/skin-care-ui-rebuild-handoff-v1/golden-screens/assets');
const profile = await mkdtemp(path.join(tmpdir(), 'skin-ui-review-'));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const photoData = `data:image/png;base64,${(await readFile(path.join(assets, 'demo-cheek-observation.png'))).toString('base64')}`;
const productData = `data:image/png;base64,${(await readFile(path.join(assets, 'medicine-benzihex.png'))).toString('base64')}`;
const date = '2026-09-01T08:00:00Z';
const target = { target_id: 1, scope_type: 'region', region_id: 'left_face', user_note: '昨晚睡得较晚，今天没有刺痛。', status: 'completed', result_source: 'photo_analysis', completed_at: date, facts: { main_locations: ['左侧脸颊'], estimated_amount: '少量可见痕迹', distribution: '分布较集中', coverage: '下颊局部', daily_appearance: ['局部泛红仍可见'], unknowns: ['单张照片无法判断变化原因'], summary: '左脸颊局部泛红可见，\n分布较集中。' } };
const photo = { photo_id: 1, mime_type: 'image/png', size_bytes: 1000, width: 1024, height: 1024, taken_at: date, quality_status: 'passed', quality_meta: { status: 'passed', primary_issue: null, issues: [], metrics: { width: 1024, height: 1024 }, regions: [] }, url: photoData, url_expires_at: '2030-01-01T00:00:00Z' };
const observation = { observation_id: 1, client_request_id: 'visual-fixture', recorded_at: date, recorded_timezone_offset_minutes: 480, recorded_local_date: '2026-09-01', status: 'saved', created_at: date, life_context_ids: [], life_context_completed_at: date, photo, targets: [target] };
const event = { event_id: 1, region_id: 'left_face', status: 'current', started_local_date: '2026-08-12', last_valid_local_date: '2026-09-01', ended_at: null, ended_local_date: null };
const product = { product_id: 1, client_request_id: 'visual-fixture', name: '过氧苯甲酰凝胶 5%', created_at: date, use_count: 3, last_used_at: date, source_type: 'custom', standard_product_id: null, brand_name: null, formula_version: null, regulatory_type: null, image_url: productData, image_expires_at: '2030-01-01T00:00:00Z' };
const use = { product_use_id: 1, client_request_id: 'visual-fixture', used_at: date, used_timezone_offset_minutes: 480, note: '按自己的原始记录回看。', created_at: date, products: [product] };
const auth = { user: { user_id: 1, email: 'visual-fixture@example.test', nickname: '视觉验收示例', created_at: date }, tokens: { access_token: 'fixture-only', refresh_token: 'fixture-only', token_type: 'bearer', expires_in: 3600, refresh_expires_in: 7200 } };
function fixture(url) {
  const pathname = new URL(url).pathname.replace(/^\/api\/v1/, '');
  if (pathname.startsWith('/auth/')) return auth;
  if (pathname === '/me/consents') return ['terms', 'privacy', 'health_disclaimer', 'ai_processing'].map((consent_type) => ({ consent_type, accepted: true, accepted_at: date, version: 'fixture' }));
  if (pathname === '/observations') return [observation];
  if (pathname === '/observations/1') return observation;
  if (pathname === '/observations/photo-quality') return { ...photo.quality_meta, regions: [{ region_id: 'left_face', points: [{x: 0.2, y: 0.2}, {x: 0.7, y: 0.2}, {x: 0.8, y: 0.75}, {x: 0.2, y: 0.8}] }] };
  if (pathname === '/region-events') return [event];
  if (pathname === '/region-events/1') return { ...event, timepoints: ['2026-08-12', '2026-08-21', '2026-09-01'].map((day, index) => ({ ...observation, recorded_at: `${day}T08:00:00Z`, recorded_local_date: day, target: { ...target, target_id: index + 1 } })) };
  if (pathname === '/products') return [product, { ...product, product_id: 2, name: '我的日常保湿产品', image_url: null, use_count: 0, last_used_at: null }];
  if (pathname === '/products/1') return { ...product, uses: [use] };
  if (pathname === '/product-uses') return [use];
  if (pathname === '/timeline') return [];
  if (pathname.includes('search')) return { items: [], next_cursor: null };
  throw new Error(`Unconfigured visual fixture: ${pathname}`);
}
await mkdir(output, { recursive: true });
const debugPort = 9400 + Math.floor(Math.random() * 500);
const edge = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
const errors = [];
const results = [];
const skipped = [];
try {
  let tab;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { tab = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find((item) => item.type === 'page'); if (tab) break; } catch {}
    await delay(250);
  }
  if (!tab) throw new Error('Headless preview did not start within 10 seconds');
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  socket.onmessage = async ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const job = pending.get(message.id);
      if (!job) return;
      clearTimeout(job.timer); pending.delete(message.id);
      if (message.error) job.reject(new Error(JSON.stringify(message.error))); else job.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description ?? ''));
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      try {
        const body = request.method === 'OPTIONS' ? '' : JSON.stringify(fixture(request.url));
        await send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,OPTIONS' }], body: Buffer.from(body).toString('base64') });
      } catch (error) { errors.push(error.message); await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); }
    }
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*:8000/*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  };
  async function waitText(text) {
    for (let i = 0; i < 100; i++) { if (await evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`)) return; await delay(300); }
    throw new Error(`Page never showed: ${text}; current page: ${await evaluate('location.pathname + " " + document.body.innerText')}`);
  }
  async function clickText(text) {
    const found = await evaluate(`(() => { const controls = Array.from(document.querySelectorAll('[role="button"],button,a,[role="tab"]')); const matches = n => n.textContent.trim().endsWith(${JSON.stringify(text)}); const node = controls.find(n => n.getAttribute('role') === 'tab' && matches(n)) || controls.find(matches); if (!node) return false; node.click(); return true; })()`);
    if (!found) throw new Error(`Missing control: ${text}`);
    await delay(500);
  }
  async function capture(name, width = 390) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
    await delay(500);
    const layout = await evaluate(`({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, path: location.pathname, text: document.body.innerText.slice(0, 100) })`);
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(output, `${name}-${width}.png`), Buffer.from(data, 'base64'));
    results.push({ name, ...layout, overflow: layout.scrollWidth > layout.width });
    console.log(`Captured ${name} at ${width}px`);
    if (name === 'result' && width === 320) {
      const bounds = await evaluate(`(() => { const heading = Array.from(document.querySelectorAll('div')).find(n => n.textContent === '今天看见的'); const photo = document.querySelector('[aria-label="照片检测区域图"]'); return { headingTop: heading.getBoundingClientRect().top, photoBottom: photo.getBoundingClientRect().bottom }; })()`);
      if (bounds.headingTop < bounds.photoBottom) errors.push(`Stacked result overlaps its photo: ${JSON.stringify(bounds)}`);
    }
  }
  await send('Page.navigate', { url: 'http://localhost:8082/login' });
  await waitText('登录');
  await capture('login');
  await clickText('登录'); await waitText('请输入邮箱和密码'); await capture('form-error', 320);
  await evaluate(`(() => { const fields = document.querySelectorAll('input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(fields[0], 'visual-fixture@example.test'); fields[0].dispatchEvent(new Event('input', {bubbles: true})); setter.call(fields[1], 'fixture-password'); fields[1].dispatchEvent(new Event('input', {bubbles: true})); })()`);
  await clickText('登录'); await waitText('开始今天的观察');
  for (const width of [320, 375, 390, 430]) await capture('observe', width);
  await clickText('历程'); await waitText('从你关心的区域');
  await capture('history');
  for (const width of [320, 375, 430]) await capture('history', width);
  const geometryCheck = await evaluate(`(() => {
    const svg = new DOMParser().parseFromString(${JSON.stringify(buildHistoryFaceSvg([]))}, 'image/svg+xml');
    const ctx = document.createElement('canvas').getContext('2d');
    const face = new Path2D(${JSON.stringify(HISTORY_FACE_BOUNDARY + ' Z')});
    const regions = Array.from(svg.querySelectorAll('[data-region]')).map(n => ({ id: n.getAttribute('data-region'), path: new Path2D(n.getAttribute('d')) }));
    const outside = [], overlaps = [];
    for (let y = 0; y <= 366; y += 2) for (let x = 0; x <= 340; x += 2) {
      const matches = regions.filter(r => ctx.isPointInPath(r.path, x, y));
      if (matches.length && !ctx.isPointInPath(face, x, y)) outside.push({ x, y, regions: matches.map(r => r.id) });
      if (matches.length > 1) overlaps.push({ x, y, regions: matches.map(r => r.id) });
    }
    return { outsideCount: outside.length, overlapCount: overlaps.length, firstOutside: outside[0], firstOverlap: overlaps[0] };
  })()`);
  console.log('Face geometry:', JSON.stringify(geometryCheck));
  if (geometryCheck.outsideCount || geometryCheck.overlapCount) errors.push(`Face geometry failed: ${JSON.stringify(geometryCheck)}`);
  await capture('history', 390);
  await evaluate(`Array.from(document.querySelectorAll('[role="button"]')).find(n => n.getAttribute('aria-label')?.includes('左脸颊') && n.getAttribute('aria-label')?.includes('正在记录')).click()`);
  await waitText('这一段记录'); await capture('region-event');
  await clickText('查看原图与完整记录'); await waitText('本次观察结论'); await capture('result'); await capture('result', 320);
  await evaluate(`history.back()`); await delay(600); await evaluate(`history.back()`); await waitText('历程');
  await clickText('产品'); await waitText('按使用频次排列'); await capture('products'); await capture('products', 320);
  await evaluate(`document.querySelector('[aria-label="过氧苯甲酰凝胶 5%，已记录 3 次使用"]').click()`);
  await waitText('官方说明书'); await capture('product-detail');
  await evaluate(`history.back()`); await waitText('开始今天的观察');
  await clickText('产品'); await waitText('按使用频次排列');
  await clickText('＋新增'); await waitText('添加产品'); await capture('product-add');
  await evaluate(`history.back()`); await waitText('开始今天的观察');
  await clickText('我的'); await waitText('退出当前账号'); await capture('me');
  await clickText('观察'); await waitText('开始今天的观察');
  await clickText('开始今天的观察'); await delay(1000); await capture('camera-entry');
  await evaluate(`history.back()`); await waitText('开始今天的观察');
  await send('Page.setInterceptFileChooserDialog', { enabled: true });
  await clickText('从相册选择原图');
  await send('DOM.enable');
  const { root: documentRoot } = await send('DOM.getDocument');
  const { nodeId: fileInput } = await send('DOM.querySelector', { nodeId: documentRoot.nodeId, selector: 'input[type="file"]' });
  if (!fileInput) throw new Error(`Photo picker input missing: ${await evaluate('document.body.innerText')}`);
  await send('DOM.setFileInputFiles', { nodeId: fileInput, files: [path.join(assets, 'demo-cheek-observation.png')] });
  // SDK 57's File calls validatePath(), which its web implementation does not provide.
  // Do not patch the app/SDK just to force a native-only flow through this review.
  await waitText('重试照片检查');
  await capture('photo-recovery'); await capture('photo-recovery', 320);
  skipped.push({ name: 'confirmation-and-live-camera', reason: 'Requires native device: expo-file-system File.validatePath is unavailable on web; no real camera is attached to the isolated browser.' });
  if (errors.length || results.some((item) => item.overflow)) throw new Error('Visual review found runtime errors or document overflow; inspect review-results.json');
} catch (error) {
  errors.push(error.message);
  throw error;
} finally {
  await writeFile(path.join(output, 'review-results.json'), JSON.stringify({ kind: 'VISUAL FIXTURES ONLY — not backend or native-device verification', status: errors.length ? 'failed' : 'partial-native-review-pending', results, errors, skipped }, null, 2));
  socket?.close(); edge.kill();
  // Only this script's unique temporary browser profile is removed.
  if (path.basename(profile).startsWith('skin-ui-review-') && path.dirname(profile) === tmpdir()) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }).catch(() => {});
}
