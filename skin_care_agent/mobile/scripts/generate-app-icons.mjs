/** Original Play Store icon concepts for Skin Care Agent.
 * Geometry is computed, not traced; palette comes from mobile/src/constants/theme.ts.
 * Rasterizes with the same headless Chrome path used by ui-visual-review.mjs.
 * Run from mobile/: node scripts/generate-app-icons.mjs
 */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const svgDir = path.join(root, 'design/app-icon/concepts');
const pngDir = path.join(root, 'artifacts/app-icon-concepts');
const SIZES = [512, 192, 48];

const c = {
  paper: '#F7F1E1', paperHi: '#FBF6E8', ground: '#EFE8D6', hairline: '#D9D2BB',
  sageSoft: '#C8CFAF', sage: '#A9B58F', moss: '#6D7A54', mossDeep: '#4A5638',
  earth: '#3E362B', ink: '#2E2A21', amber: '#C89A45', clay: '#8A4D3E',
};

const rad = (d) => (d * Math.PI) / 180;
const f = (n) => Number(n.toFixed(2));
const pt = (cx, cy, r, d) => [cx + r * Math.cos(rad(d)), cy + r * Math.sin(rad(d))];

/** Open arc, sweeping clockwise in screen space from a1 to a2 degrees. */
function arc(cx, cy, r, a1, a2) {
  const [x1, y1] = pt(cx, cy, r, a1);
  const [x2, y2] = pt(cx, cy, r, a2);
  const large = Math.abs(a2 - a1) > 180 ? 1 : 0;
  return `M ${f(x1)} ${f(y1)} A ${f(r)} ${f(r)} 0 ${large} 1 ${f(x2)} ${f(y2)}`;
}

/** Closed lens between A and B; b1/b2 are the bulge heights of the two arcs. */
function lens(ax, ay, bx, by, b1, b2) {
  const half = Math.hypot(bx - ax, by - ay) / 2;
  const r1 = (half * half + b1 * b1) / (2 * b1);
  const r2 = (half * half + b2 * b2) / (2 * b2);
  return `M ${f(ax)} ${f(ay)} A ${f(r1)} ${f(r1)} 0 0 1 ${f(bx)} ${f(by)}`
    + ` A ${f(r2)} ${f(r2)} 0 0 1 ${f(ax)} ${f(ay)} Z`;
}

/** Teardrop outline: a sharp tip above a circular body, joined by tangents. */
function drop(cx, tipY, bodyY, r) {
  const a = (Math.acos(r / (bodyY - tipY)) * 180) / Math.PI;
  const [lx, ly] = pt(cx, bodyY, r, -90 - a);
  const [rx, ry] = pt(cx, bodyY, r, -90 + a);
  return `M ${f(cx)} ${f(tipY)} L ${f(rx)} ${f(ry)}`
    + ` A ${f(r)} ${f(r)} 0 1 1 ${f(lx)} ${f(ly)} Z`;
}

const svg = (body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"`
  + ` viewBox="0 0 512 512" role="img" aria-label="Skin Care Agent">\n<defs>${defs}</defs>\n${body}\n</svg>\n`;

/** A. 年轮 — nested rings around an eccentric pith, the way a real trunk section grows. */
function conceptRings() {
  const rings = [
    { r: 44, w: 13, col: c.mossDeep },
    { r: 79, w: 12, col: c.moss },
    { r: 114, w: 11, col: c.moss },
    { r: 149, w: 10, col: c.sage },
    { r: 184, w: 9, col: c.sageSoft },
  ];
  // The pith sits off-centre; each successive ring drifts back toward the middle.
  const pith = { x: 296, y: 292 };
  const strokes = rings.map(({ r, w, col }, i) => {
    const t = i / (rings.length - 1);
    const cx = pith.x + (250 - pith.x) * t;
    const cy = pith.y + (246 - pith.y) * t;
    return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${r}" fill="none" stroke="${col}"`
      + ` stroke-width="${w}"/>`;
  }).join('\n  ');
  const defs = `<radialGradient id="pg" cx="50%" cy="42%" r="72%">`
    + `<stop offset="0" stop-color="${c.paperHi}"/><stop offset="1" stop-color="${c.ground}"/></radialGradient>`;
  return svg(`<rect width="512" height="512" fill="url(#pg)"/>\n  ${strokes}\n`
    + `  <circle cx="${pith.x}" cy="${pith.y}" r="15" fill="${c.amber}"/>`, defs);
}

/** B. 光圈花 — six blades reading as both a camera aperture and an opening flower. */
function conceptAperture() {
  const blades = Array.from({ length: 6 }, (_, i) => {
    const rot = i * 60;
    // Flat alternating tones, no opacity blending, so the pinwheel depth survives 48px.
    const fill = i % 2 === 0 ? c.sageSoft : c.sage;
    return `<path d="${lens(256, 196, 256, 66, 52, 14)}" fill="${fill}"`
      + ` transform="rotate(${rot} 256 256)"/>`;
  }).join('\n  ');
  const defs = `<radialGradient id="mg" cx="50%" cy="46%" r="76%">`
    + `<stop offset="0" stop-color="${c.moss}"/><stop offset="1" stop-color="${c.mossDeep}"/></radialGradient>`;
  return svg(`<rect width="512" height="512" fill="url(#mg)"/>\n  ${blades}\n`
    + `  <circle cx="256" cy="256" r="46" fill="${c.paper}"/>\n`
    + `  <circle cx="256" cy="256" r="13" fill="${c.amber}"/>`, defs);
}

/** C. 叶脉时间轴 — the midrib is a timeline; dots grow toward today. */
function conceptLeaf() {
  // 2.4:1 lens: slim enough to read as a leaf, with the tips left sharp.
  const leaf = lens(256, 404, 256, 108, 62, 62);
  // Dot radii stay well inside the leaf half-width at each position along the midrib.
  const dots = [
    { t: 0.18, r: 7, col: c.paper, op: 0.55 },
    { t: 0.40, r: 9, col: c.paper, op: 0.75 },
    { t: 0.62, r: 11, col: c.paper, op: 0.9 },
    { t: 0.84, r: 13, col: c.amber, op: 1 },
  ].map(({ t, r, col, op }) => {
    const y = 404 - t * (404 - 108);
    return `<circle cx="256" cy="${f(y)}" r="${r}" fill="${col}" opacity="${op}"/>`;
  }).join('\n    ');
  const defs = `<linearGradient id="lg" x1="0" y1="1" x2="0.35" y2="0">`
    + `<stop offset="0" stop-color="${c.mossDeep}"/><stop offset="1" stop-color="${c.moss}"/></linearGradient>`
    + `<radialGradient id="lbg" cx="42%" cy="38%" r="78%">`
    + `<stop offset="0" stop-color="${c.paperHi}"/><stop offset="1" stop-color="${c.ground}"/></radialGradient>`;
  return svg(`<rect width="512" height="512" fill="url(#lbg)"/>\n`
    + `  <g transform="rotate(-32 256 256)">\n`
    + `    <path d="${leaf}" fill="url(#lg)"/>\n`
    + `    <path d="M 256 378 L 256 134" stroke="${c.paper}" stroke-width="3.5"`
    + ` stroke-linecap="round" opacity="0.4"/>\n    ${dots}\n  </g>`, defs);
}

/** D. 晨露刻度 — a dew drop holding level marks; the amber one is today. */
function conceptDew() {
  const body = drop(256, 92, 300, 118);
  const marks = [
    { y: 356, x: 74, col: c.paper, op: 0.5 },
    { y: 316, x: 96, col: c.paper, op: 0.7 },
    { y: 268, x: 86, col: c.amber, op: 1 },
  ].map(({ y, x, col, op }) =>
    `<path d="M ${256 - x / 2} ${y} L ${256 + x / 2} ${y}" stroke="${col}"`
    + ` stroke-width="11" stroke-linecap="round" opacity="${op}"/>`).join('\n    ');
  const defs = `<linearGradient id="dg" x1="0.2" y1="0" x2="0.8" y2="1">`
    + `<stop offset="0" stop-color="${c.sageSoft}"/><stop offset="0.55" stop-color="${c.sage}"/>`
    + `<stop offset="1" stop-color="${c.moss}"/></linearGradient>`
    + `<radialGradient id="ebg" cx="50%" cy="40%" r="78%">`
    + `<stop offset="0" stop-color="${c.earth}"/><stop offset="1" stop-color="${c.ink}"/></radialGradient>`
    + `<clipPath id="dclip"><path d="${body}"/></clipPath>`;
  return svg(`<rect width="512" height="512" fill="url(#ebg)"/>\n`
    + `  <path d="${body}" fill="url(#dg)"/>\n`
    + `  <g clip-path="url(#dclip)">\n    ${marks}\n  </g>`, defs);
}

const concepts = [
  { id: 'a-growth-rings', label: 'A 年轮', build: conceptRings },
  { id: 'b-aperture-bloom', label: 'B 光圈花', build: conceptAperture },
  { id: 'c-leaf-timeline', label: 'C 叶脉时间轴', build: conceptLeaf },
  { id: 'd-dew-gauge', label: 'D 晨露刻度', build: conceptDew },
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(svgDir, { recursive: true });
await mkdir(pngDir, { recursive: true });

const wrappers = [];
for (const concept of concepts) {
  const markup = concept.build();
  await writeFile(path.join(svgDir, `${concept.id}.svg`), markup, 'utf8');
  const html = `<!doctype html><meta charset="utf-8"><style>`
    + `html,body{margin:0;padding:0;background:transparent;overflow:hidden}`
    + `svg{display:block;width:100vw;height:100vh}</style>${markup}`;
  const file = path.join(svgDir, `.render-${concept.id}.html`);
  await writeFile(file, html, 'utf8');
  wrappers.push({ ...concept, file });
}

const profile = await mkdtemp(path.join(tmpdir(), 'skin-icon-'));
const port = 9600 + Math.floor(Math.random() * 300);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
  ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });

let socket;
try {
  let tab;
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      tab = list.find((t) => t.type === 'page');
      if (tab) break;
    } catch {}
    await delay(250);
  }
  if (!tab) throw new Error('Headless Chrome did not start within 10 seconds');
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    const job = msg.id && pending.get(msg.id);
    if (!job) return;
    clearTimeout(job.timer); pending.delete(msg.id);
    if (msg.error) job.reject(new Error(JSON.stringify(msg.error))); else job.resolve(msg.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable');
  for (const concept of wrappers) {
    for (const size of SIZES) {
      await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
      await send('Page.navigate', { url: `file:///${concept.file.replace(/\\/g, '/')}` });
      await delay(320);
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(path.join(pngDir, `${concept.id}-${size}.png`), Buffer.from(data, 'base64'));
    }
    console.log(`rendered ${concept.label} -> ${concept.id} (${SIZES.join('/')}px)`);
  }
} finally {
  socket?.close();
  chrome.kill();
  await Promise.all(wrappers.map((w) => rm(w.file, { force: true })));
  // Chrome releases its profile locks a moment after exit; a leftover temp dir is harmless.
  await delay(600);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
console.log(`\nSVG  ${svgDir}\nPNG  ${pngDir}`);
