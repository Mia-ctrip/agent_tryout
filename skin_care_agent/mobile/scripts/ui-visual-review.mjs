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
const productReview = process.argv.includes('--products-only');
const resultReview = process.argv.includes('--results-only');
const historyReview = process.argv.includes('--history-only');
const colorReview = process.argv.includes('--color-review');
const output = path.join(root, historyReview ? 'artifacts/history-refresh-review' : colorReview ? 'artifacts/color-refresh-review' : resultReview ? 'artifacts/result-refresh-review' : productReview ? 'artifacts/product-refresh-review' : 'artifacts/ui-rebuild-review');
const assets = path.join(root, 'design/skin-care-ui-rebuild-handoff-v1/golden-screens/assets');
const profile = await mkdtemp(path.join(tmpdir(), 'skin-ui-review-'));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const photoData = `data:image/png;base64,${(await readFile(path.join(assets, 'demo-cheek-observation.png'))).toString('base64')}`;
const productData = `data:image/png;base64,${(await readFile(path.join(assets, 'medicine-benzihex.png'))).toString('base64')}`;
const extraProductData = productReview ? await Promise.all(['阿达帕林.jpg', '鱼石脂软膏.jpg'].map(async file => `data:image/jpeg;base64,${(await readFile(path.join(root, 'pic/product', file))).toString('base64')}`)) : [];
let productScenario = 'normal';
let productRefreshCalls = 0;
let imageRecovered = false;
const requestedImageHosts = [];
const requestedApiHosts = new Set();
const brokenProductImage = 'http://localhost:8000/files/visual-product-missing.png?exp=1&sig=fixture';
const date = '2026-09-01T08:00:00Z';
const target = { target_id: 1, scope_type: 'region', region_id: 'left_face', user_note: '昨晚睡得较晚，今天没有刺痛。', status: 'completed', result_source: 'photo_analysis', completed_at: date, facts: { main_locations: ['左侧脸颊'], estimated_amount: '少量可见痕迹', distribution: '分布较集中', coverage: '下颊局部', daily_appearance: ['局部泛红仍可见'], unknowns: ['单张照片无法判断变化原因'], summary: '左脸颊局部泛红可见，\n分布较集中。' } };
const photo = { photo_id: 1, mime_type: 'image/png', size_bytes: 1000, width: 1024, height: 1024, taken_at: date, quality_status: 'passed', quality_meta: { status: 'passed', primary_issue: null, issues: [], metrics: { width: 1024, height: 1024 }, regions: [] }, url: photoData, url_expires_at: '2030-01-01T00:00:00Z' };
const observation = { observation_id: 1, client_request_id: 'visual-fixture', recorded_at: date, recorded_timezone_offset_minutes: 480, recorded_local_date: '2026-09-01', status: 'saved', created_at: date, life_context_ids: [], life_context_completed_at: date, photo, targets: [target] };
let historyScenario = 'normal';
if (historyReview) {
  const argument = name => process.argv[process.argv.indexOf(name) + 1];
  if (!process.argv.includes('--photo') || !process.argv.includes('--quality')) throw new Error('History review requires a local photo and its matching quality JSON');
  photo.url = `data:image/png;base64,${(await readFile(argument('--photo'))).toString('base64')}`;
  photo.quality_meta = JSON.parse(await readFile(argument('--quality'), 'utf8'));
  photo.width = photo.quality_meta.metrics.width;
  photo.height = photo.quality_meta.metrics.height;
}
if (resultReview) {
  const argument = name => process.argv[process.argv.indexOf(name) + 1];
  if (!process.argv.includes('--photo') || !process.argv.includes('--quality')) throw new Error('Result review requires --photo and --quality local fixture paths');
  photo.url = `data:image/png;base64,${(await readFile(argument('--photo'))).toString('base64')}`;
  photo.quality_meta = JSON.parse(await readFile(argument('--quality'), 'utf8'));
  photo.width = photo.quality_meta.metrics.width;
  photo.height = photo.quality_meta.metrics.height;
  observation.targets = ['left_face', 'nose_area', 'forehead', 'right_face', 'mouth_area', 'chin'].map((region_id, index) => ({
    ...target, target_id: index + 1, region_id, user_note: null,
    facts: { ...target.facts, summary: `区域 ${index + 1} 的排版测试小结：局部泛红可见。` + '这是用于检查长文字换行的隔离测试文本，不代表真实分析结果。'.repeat(5), estimated_amount: '少量', distribution: '散在', coverage: '局部可见', daily_appearance: [`区域 ${index + 1} 的外观测试文本`], main_locations: [`区域 ${index + 1} 的位置测试文本`], unknowns: [`区域 ${index + 1} 的照片局限测试文本`] },
  }));
}
const event = { event_id: 1, region_id: 'left_face', status: 'current', started_local_date: '2026-08-12', last_valid_local_date: '2026-09-01', ended_at: null, ended_local_date: null };
const product = { product_id: 1, client_request_id: 'visual-fixture', name: '过氧苯甲酰凝胶 5%', created_at: date, use_count: 3, last_used_at: date, source_type: 'custom', standard_product_id: null, brand_name: null, formula_version: null, regulatory_type: null, image_url: productData, image_expires_at: '2030-01-01T00:00:00Z' };
const use = { product_use_id: 1, client_request_id: 'visual-fixture', used_at: date, used_timezone_offset_minutes: 480, note: '按自己的原始记录回看。', created_at: date, products: [product] };
const auth = { user: { user_id: 1, email: 'visual-fixture@example.test', nickname: '视觉验收示例', created_at: date }, tokens: { access_token: 'fixture-only', refresh_token: 'fixture-only', token_type: 'bearer', expires_in: 3600, refresh_expires_in: 7200 } };
function productFixtures() {
  const first = { ...product };
  if (productScenario === 'failure' || productScenario === 'expired') first.image_url = brokenProductImage;
  if (productScenario === 'expired') first.image_expires_at = '2000-01-01T00:00:00Z';
  if (productScenario === 'long') {
    first.name = '用于窄屏排版检查的超长中英文产品名称 Adapalene Gel 0.1%';
    first.brand_name = '排版测试品牌 · Long English Brand';
    first.formula_version = '测试配方版本 2026';
    first.use_count = 12345;
  }
  return [first,
    { ...product, product_id: 2, name: '阿达帕林凝胶', image_url: extraProductData[0], use_count: 2 },
    { ...product, product_id: 3, name: '鱼石脂软膏', image_url: extraProductData[1], use_count: 1 },
    { ...product, product_id: 4, name: '我的日常保湿产品', image_url: null, use_count: 0, last_used_at: null },
  ];
}
function fixture(url) {
  const pathname = new URL(url).pathname.replace(/^\/api\/v1/, '');
  if (pathname.startsWith('/auth/')) return auth;
  if (pathname === '/me/consents') return ['terms', 'privacy', 'health_disclaimer', 'ai_processing'].map((consent_type) => ({ consent_type, accepted: true, accepted_at: date, version: 'fixture' }));
  if (pathname === '/observations') return [observation];
  if (pathname === '/observations/1') return observation;
  if (pathname === '/observations/photo-quality') return { ...photo.quality_meta, regions: [{ region_id: 'left_face', points: [{x: 0.2, y: 0.2}, {x: 0.7, y: 0.2}, {x: 0.8, y: 0.75}, {x: 0.2, y: 0.8}] }] };
  if (pathname === '/region-events') return [event];
  if (pathname === '/region-events/1') return { ...event, timepoints: (historyReview ? ['2026-08-12', '2026-08-16', '2026-08-21', '2026-08-26', '2026-09-01'] : ['2026-08-12', '2026-08-21', '2026-09-01']).map((day, index) => ({
    ...observation, recorded_at: `${day}T08:00:00Z`, recorded_local_date: day,
    photo: historyScenario === 'text' ? null : historyScenario === 'legacy' ? { ...photo, quality_meta: null } : photo,
    target: { ...target, target_id: index + 1,
      facts: historyScenario === 'text' ? null : target.facts,
      user_note: historyScenario === 'long' ? '这是用于检查长文字排版的记录。'.repeat(30) : target.user_note,
    },
  })) };
  if (pathname === '/products') return productReview ? productFixtures() : [product, { ...product, product_id: 2, name: '我的日常保湿产品', image_url: null, use_count: 0, last_used_at: null }];
  if (productReview && /^\/products\/\d+$/.test(pathname)) {
    productRefreshCalls++;
    const value = productFixtures().find(item => item.product_id === Number(pathname.split('/').at(-1)));
    if (!value) throw new Error('Unknown product fixture');
    return { ...value, image_url: productScenario === 'failure' && !imageRecovered ? brokenProductImage : value.product_id === 1 ? productData : value.image_url, image_expires_at: '2030-01-01T00:00:00Z', uses: [use] };
  }
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
    if ((productReview || resultReview || historyReview) && message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map(value => value.value ?? value.description ?? '').join(' '));
    }
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      try {
        if (new URL(request.url).pathname.startsWith('/api/v1/')) requestedApiHosts.add(new URL(request.url).hostname);
        if (request.url.includes('/files/visual-product-missing.png')) {
          requestedImageHosts.push(new URL(request.url).hostname);
          await send('Fetch.fulfillRequest', { requestId, responseCode: 404, responseHeaders: [{ name: 'Content-Type', value: 'text/plain' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from('fixture: missing image').toString('base64') });
          return;
        }
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
    const found = await evaluate(`(() => { const controls = Array.from(document.querySelectorAll('[role="button"],button,a,[role="tab"]')); const matches = n => n.textContent.trim().endsWith(${JSON.stringify(text)}) || n.getAttribute('aria-label') === ${JSON.stringify(text)}; const node = controls.find(n => n.getAttribute('role') === 'tab' && matches(n)) || controls.find(matches); if (!node) return false; node.click(); return true; })()`);
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
    if (!resultReview && name === 'result' && width === 320) {
      const bounds = await evaluate(`(() => { const heading = Array.from(document.querySelectorAll('div')).find(n => n.textContent === '今天看见的'); const photo = document.querySelector('[aria-label="照片检测区域图"]'); return { headingTop: heading.getBoundingClientRect().top, photoBottom: photo.getBoundingClientRect().bottom }; })()`);
      if (bounds.headingTop < bounds.photoBottom) errors.push(`Stacked result overlaps its photo: ${JSON.stringify(bounds)}`);
    }
  }
  await send('Page.navigate', { url: 'http://localhost:8082/login' });
  await waitText('登录');
  if (!productReview && !historyReview) {
    await capture('login');
    await clickText('登录'); await waitText('请输入邮箱和密码'); await capture('form-error', 320);
  }
  await evaluate(`(() => { const fields = document.querySelectorAll('input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(fields[0], 'visual-fixture@example.test'); fields[0].dispatchEvent(new Event('input', {bubbles: true})); setter.call(fields[1], 'fixture-password'); fields[1].dispatchEvent(new Event('input', {bubbles: true})); })()`);
  await clickText('登录'); await waitText('开始今天的观察');
  if (historyReview) {
    await clickText('历程'); await waitText('从你关心的区域');
    async function openHistoryRegion() {
      const clicked = await evaluate(`(() => { const node = Array.from(document.querySelectorAll('[role="button"]')).find(n => n.getAttribute('aria-label')?.includes('正在记录且已有时间点')); node?.click(); return Boolean(node); })()`);
      if (!clicked) throw new Error('Region history entry missing');
      await waitText('这一段记录'); await waitText('照片中可见'); await delay(700);
    }
    await openHistoryRegion();
    for (const width of [320, 375, 390, 430]) await capture('region-event-left', width);
    const previews = await evaluate(`(() => {
      const frames = Array.from(document.querySelectorAll('[data-testid="region-photo-crop"]'));
      return frames.map(frame => { const img = frame.querySelector('img'); const style = img && getComputedStyle(img); return { clipped: getComputedStyle(frame).overflow === 'hidden', loaded: img?.complete && img.naturalWidth > 0, filter: style?.filter, imageWidth: img?.getBoundingClientRect().width, viewportWidth: frame.getBoundingClientRect().width }; });
    })()`);
    if (previews.length !== 5 || previews.some(p => !p.clipped || !p.loaded || p.imageWidth <= p.viewportWidth || p.filter !== 'none')) throw new Error(`Cropped previews failed: ${JSON.stringify(previews)}`);
    await evaluate(`document.querySelector('[aria-label*="8月12日"][role="button"]').click()`);
    await waitText('8月12日的记录'); await capture('timepoint-first');
    await evaluate(`document.querySelector('[aria-label*="9月1日"][role="button"]').click()`);
    await waitText('9月1日的记录');
    await clickText('查看原图与完整记录'); await waitText('本次观察结论');
    await evaluate('history.back()'); await delay(700); await waitText('这一段记录');
    async function reloadHistoryFixture() {
      // Web review sessions are memory-only; authenticate each isolated fixture load.
      await send('Page.navigate', { url: 'http://localhost:8082/login' });
      await delay(700); await waitText('登录');
      await evaluate(`(() => { const fields = document.querySelectorAll('input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(fields[0], 'visual-fixture@example.test'); fields[0].dispatchEvent(new Event('input', {bubbles: true})); setter.call(fields[1], 'fixture-password'); fields[1].dispatchEvent(new Event('input', {bubbles: true})); })()`);
      await clickText('登录'); await waitText('开始今天的观察');
      await clickText('历程'); await waitText('从你关心的区域');
      await openHistoryRegion();
    }
    const cropPositions = [];
    for (const regionId of ['left_face', 'nose_area', 'right_face', 'forehead', 'mouth_area', 'chin']) {
      event.region_id = target.region_id = regionId;
      target.facts = { ...target.facts, summary: '局部可见外观，分布较集中。' };
      await reloadHistoryFixture();
      await capture(`region-${regionId}`, 390);
      cropPositions.push(await evaluate(`(() => { const img = document.querySelector('[data-testid="region-photo-crop"] img'); const style = getComputedStyle(img); return [style.left, style.top, style.width, style.height]; })()`));
    }
    if (new Set(cropPositions.map(value => JSON.stringify(value))).size !== 6) throw new Error('Different regions reused the same crop');
    for (const scenario of ['legacy', 'text', 'long']) {
      historyScenario = scenario;
      await reloadHistoryFixture();
      if (scenario === 'legacy') await waitText('原图预览');
      if (scenario === 'text') await waitText('这次没有照片');
      if (scenario === 'long') {
        const card = await evaluate(`(() => { const card = document.querySelector('[data-testid="timepoint-evidence-card"]'); return {height: card.getBoundingClientRect().height, icons: card.querySelectorAll('img').length, details: !!card.querySelector('[aria-label="查看原图与完整记录"]')}; })()`);
        if (card.height > 440 || card.icons !== 3 || !card.details) throw new Error(`Two-row evidence card failed: ${JSON.stringify(card)}`);
      }
      await capture(`region-${scenario}`, 320);
    }
  } else if (resultReview) {
    if (colorReview) for (const width of [320, 375, 390, 430]) await capture('observe', width);
    await clickText('历程'); await waitText('从你关心的区域');
    await evaluate(`Array.from(document.querySelectorAll('[role="button"]')).find(n => n.getAttribute('aria-label')?.includes('左脸颊') && n.getAttribute('aria-label')?.includes('正在记录')).click()`);
    await waitText('这一段记录'); await clickText('查看原图与完整记录');
    await waitText('本次观察结论');
    await delay(1500);
    for (const width of [320, 375, 390, 430]) await capture('result', width);
    await clickText('鼻周');
    await waitText('2 / 6');
    await capture('result-nose');
    await evaluate(`document.querySelector('[aria-label="查看鼻周完整事实"]').click()`); await delay(300);
    await waitText('完整小结');
    await evaluate(`document.querySelector('[aria-expanded="true"]').scrollIntoView({block:'start',inline:'nearest'})`);
    await capture('result-expanded');
    await evaluate(`document.querySelector('[aria-label="收起鼻周完整事实"]').click()`); await delay(300);
    await evaluate(`document.querySelector('[aria-label="查看鼻周"]').scrollIntoView({block:'start',inline:'nearest'})`);
    // Scroll the actual pager: clicking tabs cannot verify swipe synchronization.
    await evaluate(`(() => { const panel = document.querySelector('[data-testid="region-result-page"]:not([aria-hidden="true"])'); let scroll = panel.parentElement; while (scroll && !(scroll.scrollWidth > scroll.clientWidth && ['auto','scroll'].includes(getComputedStyle(scroll).overflowX))) scroll = scroll.parentElement; if (!scroll) throw new Error('No horizontal pager'); Element.prototype.scrollTo.call(scroll, {left: panel.getBoundingClientRect().width * 2, behavior: 'smooth'}); })()`);
    await delay(1500);
    await waitText('3 / 6');
    const synced = await evaluate(`document.querySelector('[role="tab"][aria-label="查看额头"]')?.getAttribute('aria-selected') === 'true' && document.body.innerText.includes('区域 3 的照片局限测试文本')`);
    if (!synced) throw new Error('Swipe did not synchronize region content');
    await capture('result-swiped');
    await clickText('下巴'); await waitText('6 / 6'); await capture('result-last');
    const hiddenPages = await evaluate(`document.querySelectorAll('[aria-hidden="true"][data-testid="region-result-page"]').length`);
    if (hiddenPages !== 5) throw new Error('Inactive pages are exposed to screen readers');
    // Check the scanner with the same real geometry and isolated processing state.
    observation.targets = observation.targets.map(item => ({ ...item, status: 'processing', facts: null, result_source: null }));
    await evaluate('history.back()'); await waitText('这一段记录'); await clickText('查看原图与完整记录');
    await waitText('正在读取'); await delay(800); await capture('scanner');
  } else if (productReview) {
    async function waitImages() {
      for (let i = 0; i < 50; i++) {
        if (await evaluate(`(() => { const images = Array.from(document.querySelectorAll('img')); return images.length >= 3 && images.every(image => image.complete && image.naturalWidth > 0) && !document.body.innerText.includes('点按重试'); })()`)) return;
        await delay(100);
      }
      throw new Error('Product images did not finish loading');
    }
    const returnToProducts = async () => {
      await clickText('观察'); await waitText('开始今天的观察');
      await clickText('产品'); await waitText('按使用频次排列');
    };
    await clickText('产品'); await waitText('按使用频次排列'); await waitImages();
    const backdropCheck = await evaluate(`(() => {
      const layer = document.querySelector('[data-testid="product-archive-backdrop"]');
      if (!layer) return { valid: false, reason: 'Missing page-wide illustration layer' };
      const main = layer.querySelector('[data-testid="product-backdrop-main"]');
      const echoes = Array.from(layer.querySelectorAll('[data-testid="product-backdrop-echo"]'));
      return { valid: !!main && main.getBoundingClientRect().width >= innerWidth * .65
        && Number(getComputedStyle(main).opacity) <= .24
        && echoes.length === 2 && echoes.every(n => Number(getComputedStyle(n).opacity) <= .1)
        && getComputedStyle(layer).pointerEvents === 'none', reason: 'Backdrop scale, layering or touch safety regressed' };
    })()`);
    if (!backdropCheck.valid) throw new Error(backdropCheck.reason);
    for (const width of [320, 375, 390, 430]) await capture('products', width);
    const scrollCheck = await evaluate(`(() => {
      const layer = document.querySelector('[data-testid="product-archive-backdrop"]');
      const before = layer.getBoundingClientRect().top;
      let scroller = layer.parentElement;
      while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
      if (!scroller) return false;
      scroller.scrollTop = 160;
      return Math.abs((before - layer.getBoundingClientRect().top) - scroller.scrollTop) < 2 && scroller.scrollTop > 0;
    })()`);
    if (!scrollCheck) throw new Error('Product decoration must scroll with content, not float over it');
    await capture('products-scrolled', 390);
    await evaluate(`document.querySelectorAll('div').forEach(n => { if(n.scrollTop) n.scrollTop = 0; })`);
    const swipeTarget = await evaluate(`(() => { const n = document.querySelector('[aria-label="过氧苯甲酰凝胶 5%，已记录 3 次使用"]'); const b = n.getBoundingClientRect(); return { x: b.right - 32, y: b.top + b.height / 2 }; })()`);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [swipeTarget] });
    for (const dx of [12, 32, 56, 80, 104]) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: swipeTarget.x - dx, y: swipeTarget.y }] });
      await delay(40);
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await delay(700);
    if (!await evaluate(`Number(getComputedStyle(document.querySelector('[aria-label="归档产品"]').parentElement).opacity) > .99`)) throw new Error('Swipe no longer reveals archive action');
    await capture('products-swipe', 390);
    await evaluate(`document.querySelector('[aria-label="归档产品"]').click()`);
    await waitText('暂未归档');
    // Spring settling is not a fixed-duration transition. Wait for its terminal state.
    for (let attempt = 0; attempt < 30; attempt++) {
      if (await evaluate(`Number(getComputedStyle(document.querySelector('[aria-label="归档产品"]').parentElement).opacity) === 0`)) break;
      await delay(100);
    }
    if (!await evaluate(`Number(getComputedStyle(document.querySelector('[aria-label="归档产品"]').parentElement).opacity) === 0`)) throw new Error('Closed archive action bleeds through transparent product rows');
    if (!await evaluate(`document.body.innerText.includes('暂无图片')`)) throw new Error('Missing image state is absent');
    await evaluate(`document.querySelector('[aria-label="过氧苯甲酰凝胶 5%，已记录 3 次使用"]').click()`);
    await waitText('官方说明书');
    await capture('product-detail', 390); await capture('product-detail', 320);
    await evaluate('history.back()'); await delay(500);
    await returnToProducts();
    productScenario = 'long';
    await returnToProducts(); await waitImages(); await capture('products-long-name', 320);
    productScenario = 'failure'; productRefreshCalls = 0;
    await returnToProducts(); await waitText('点按重试');
    await capture('products-image-error', 390);
    if (await evaluate(`Boolean(document.querySelector('button button'))`)) throw new Error('Image retry must not be nested inside the product navigation button');
    if (productRefreshCalls !== 1) throw new Error(`Automatic image refresh loop: ${productRefreshCalls}`);
    if (requestedImageHosts.some(host => !requestedApiHosts.has(host))) throw new Error('Product images did not use the configured API origin');
    imageRecovered = true;
    await evaluate(`document.querySelector('[aria-label="重新加载过氧苯甲酰凝胶 5% 产品图片"]').click()`);
    await waitImages();
    if (await evaluate('location.pathname') !== '/products') throw new Error('Image retry unexpectedly opened product details');
    if (productRefreshCalls !== 2) throw new Error('Manual retry did not request a fresh image');
    await capture('products-image-recovered', 390);
    productScenario = 'expired'; productRefreshCalls = 0;
    await returnToProducts(); await waitImages();
    if (productRefreshCalls !== 1) throw new Error(`Expired signature refresh count: ${productRefreshCalls}`);
    await capture('products-signature-refreshed', 390);
    productScenario = 'normal';
    await returnToProducts();
    await clickText('＋新增'); await waitText('添加产品'); await capture('product-add', 390);
    if (errors.length || results.some(item => item.overflow)) throw new Error('Product review found runtime errors or overflow');
  } else {
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
  }
  if (errors.length || results.some((item) => item.overflow)) throw new Error('Visual review found runtime errors or document overflow; inspect review-results.json');
} catch (error) {
  errors.push(error.message);
  throw error;
} finally {
  const reportFile = colorReview ? (productReview ? 'product-review.json' : 'result-review.json') : 'review-results.json';
  await writeFile(path.join(output, reportFile), JSON.stringify({ kind: 'VISUAL FIXTURES ONLY — not backend or native-device verification', status: errors.length ? 'failed' : (productReview || resultReview || historyReview) ? 'passed-web-native-review-pending' : 'partial-native-review-pending', results, errors, skipped }, null, 2));
  socket?.close(); edge.kill();
  // Only this script's unique temporary browser profile is removed.
  if (path.basename(profile).startsWith('skin-ui-review-') && path.dirname(profile) === tmpdir()) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }).catch(() => {});
}
