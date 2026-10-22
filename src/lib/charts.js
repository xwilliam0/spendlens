// Dependency-free chart components (SVG + HTML).
//
// Conventions: thin marks, 4px rounded data-ends, 2px surface-colored gaps,
// hairline recessive axes, a legend for every multi-series chart, and a
// hover/focus tooltip on every mark. All label text goes through
// textContent, never innerHTML, because merchant names come from untrusted CSVs.

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
  for (const c of children) if (c != null) node.append(c);
  return node;
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

/** Like node.replaceChildren(), but skips null/false (replaceChildren would render them as text). */
export function setChildren(node, ...children) {
  node.replaceChildren(...children.flat().filter((c) => c != null && c !== false));
}

// ---------- Tooltip (one shared instance) ----------

let tip;
function tooltipEl() {
  if (!tip) {
    tip = el('div', { class: 'viz-tooltip', role: 'tooltip' });
    document.body.append(tip);
  }
  return tip;
}

/**
 * @param {MouseEvent|FocusEvent} e
 * @param {string} title
 * @param {Array<{value: string, label: string, color?: string, line?: boolean}>} rows
 */
export function showTooltip(e, title, rows) {
  const t = tooltipEl();
  setChildren(t,
    title ? el('div', { class: 'viz-tooltip-title' }, title) : null,
    ...rows.map((r) => el('div', { class: 'viz-tooltip-row' },
      r.color ? el('span', { class: r.line ? 'key-line' : 'key-dot', style: { background: r.color } }) : null,
      el('strong', {}, r.value),
      el('span', { class: 'muted' }, r.label))),
  );
  t.style.display = 'block';
  let x, y;
  if (e.clientX != null && e.type !== 'focus' && e.type !== 'focusin') { x = e.clientX; y = e.clientY; }
  else { const b = e.target.getBoundingClientRect(); x = b.left + b.width / 2; y = b.top; }
  const { width, height } = t.getBoundingClientRect();
  const left = Math.min(window.innerWidth - width - 8, Math.max(8, x + 14));
  const top = y - height - 12 < 8 ? y + 16 : y - height - 12;
  t.style.left = `${left}px`;
  t.style.top = `${top}px`;
}

export function hideTooltip() { if (tip) tip.style.display = 'none'; }

function bindTooltip(node, getContent) {
  const show = (e) => { const [title, rows] = getContent(); showTooltip(e, title, rows); };
  node.addEventListener('pointermove', show);
  node.addEventListener('focus', show);
  node.addEventListener('pointerleave', hideTooltip);
  node.addEventListener('blur', hideTooltip);
}

// ---------- Scales ----------

/** Round a max value up to a clean axis number with ~4 ticks. */
export function niceTicks(max, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001 || ticks.length < 2; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

// ---------- Donut ----------

function arcPath(cx, cy, r0, r1, a0, a1) {
  const p = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
  return `M${x0},${y0}A${r1},${r1} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${r0},${r0} 0 ${large} 0 ${x3},${y3}Z`;
}

/**
 * Part-to-whole donut with a legend that carries labels, values and shares.
 * @param {HTMLElement} container
 * @param {{data: Array<{label: string, value: number, color: string}>, format: (n:number)=>string,
 *          centerLabel?: string, onSelect?: (label:string)=>void}} opts
 */
export function donutChart(container, { data, format, centerLabel = 'total', onSelect }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const size = 200, cx = size / 2, cy = size / 2, r1 = 92, r0 = 64;
  const root = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'donut', role: 'img', 'aria-label': `Donut chart, ${data.length} segments` });
  const segs = [];
  let angle = 0;
  data.forEach((d) => {
    const sweep = (d.value / total) * Math.PI * 2;
    const a1 = angle + sweep;
    // A full circle can't be drawn with one arc; split it.
    const path = sweep >= Math.PI * 2 - 1e-6
      ? `${arcPath(cx, cy, r0, r1, 0, Math.PI)}${arcPath(cx, cy, r0, r1, Math.PI, Math.PI * 2)}`
      : arcPath(cx, cy, r0, r1, angle, a1);
    const seg = svg('path', { d: path, fill: d.color, class: 'donut-seg', tabindex: 0, 'aria-label': `${d.label}: ${format(d.value)}` });
    bindTooltip(seg, () => [d.label, [{ value: format(d.value), label: `${((d.value / total) * 100).toFixed(1)}% of ${centerLabel}`, color: d.color }]]);
    seg.addEventListener('pointerenter', () => root.classList.add('has-hover'));
    seg.addEventListener('pointerleave', () => root.classList.remove('has-hover'));
    if (onSelect) { seg.style.cursor = 'pointer'; seg.addEventListener('click', () => onSelect(d.label)); }
    segs.push(seg);
    angle = a1;
  });
  root.append(...segs,
    svg('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', class: 'donut-total' }, format(total)),
    svg('text', { x: cx, y: cy + 18, 'text-anchor': 'middle', class: 'donut-sub' }, centerLabel));

  const legend = el('ul', { class: 'legend legend-list' },
    data.map((d) => el('li', {},
      el('span', { class: 'swatch', style: { background: d.color } }),
      el('span', { class: 'legend-label' }, d.label),
      el('span', { class: 'legend-value' }, format(d.value)),
      el('span', { class: 'legend-pct muted' }, `${((d.value / total) * 100).toFixed(0)}%`))));

  container.replaceChildren(el('div', { class: 'donut-wrap' }, root, legend));
}

// ---------- Horizontal bars (HTML) ----------

/**
 * Ranked horizontal bars, single color, value at the bar tip.
 * @param {{rows: Array<{label: string, value: number, sub?: string}>, format: (n:number)=>string,
 *          color?: string, onSelect?: (row)=>void}} opts
 */
export function barList(container, { rows, format, color = 'var(--series-1)', onSelect }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const list = el('div', { class: 'barlist' }, rows.map((r) => {
    const row = el('div', { class: `barlist-row${onSelect ? ' clickable' : ''}`, tabindex: 0 },
      el('span', { class: 'barlist-label', title: r.label }, r.label),
      el('span', { class: 'barlist-track' },
        el('span', { class: 'barlist-bar', style: { width: `${Math.max(0.5, (r.value / max) * 100)}%`, background: color } })),
      el('span', { class: 'barlist-value' }, format(r.value)));
    bindTooltip(row, () => [r.label, [{ value: format(r.value), label: r.sub || '' }]]);
    if (onSelect) {
      row.addEventListener('click', () => onSelect(r));
      row.addEventListener('keydown', (e) => e.key === 'Enter' && onSelect(r));
    }
    return row;
  }));
  container.replaceChildren(list);
}

// ---------- Grouped columns (SVG) ----------

function roundedTopBar(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Columns over time on one shared axis.
 * @param {{labels: string[], longLabels?: string[], series: Array<{name: string, color: string, values: number[]}>,
 *          format: (n:number)=>string, formatTick: (n:number)=>string, height?: number}} opts
 */
export function columnChart(container, { labels, longLabels = labels, series, format, formatTick, height = 260 }) {
  const width = Math.max(320, container.clientWidth || 600);
  const m = { top: 12, right: 8, bottom: 28, left: 52 };
  const plotW = width - m.left - m.right, plotH = height - m.top - m.bottom;
  const max = Math.max(...series.flatMap((s) => s.values), 0);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const yOf = (v) => m.top + plotH - (v / top) * plotH;
  const band = plotW / labels.length;
  const gap = 2;
  const barW = Math.min(24, (band * 0.72 - gap * (series.length - 1)) / series.length);
  const groupW = barW * series.length + gap * (series.length - 1);

  const root = svg('svg', { width, height, class: 'columns', role: 'img', 'aria-label': `Column chart: ${series.map((s) => s.name).join(', ')} by month` });
  for (const t of ticks) {
    const y = yOf(t);
    root.append(
      svg('line', { x1: m.left, x2: width - m.right, y1: y, y2: y, class: t === 0 ? 'axis-base' : 'gridline' }),
      svg('text', { x: m.left - 8, y: y + 4, 'text-anchor': 'end', class: 'tick' }, formatTick(t)));
  }
  // Thin out x labels when crowded.
  const every = Math.ceil(labels.length / Math.max(1, Math.floor(plotW / 56)));
  labels.forEach((label, i) => {
    const x0 = m.left + band * i + (band - groupW) / 2;
    const g = svg('g', { class: 'col-group' });
    series.forEach((s, si) => {
      const v = Math.max(0, s.values[i]);
      const y = yOf(v);
      g.append(svg('path', { d: roundedTopBar(x0 + si * (barW + gap), y, barW, m.top + plotH - y), fill: s.color, class: 'col-bar' }));
    });
    const hit = svg('rect', { x: m.left + band * i, y: m.top, width: band, height: plotH, class: 'hit', tabindex: 0, 'aria-label': `${longLabels[i]}: ${series.map((s) => `${s.name} ${format(s.values[i])}`).join(', ')}` });
    bindTooltip(hit, () => [longLabels[i], series.map((s) => ({ value: format(s.values[i]), label: s.name, color: s.color }))]);
    hit.addEventListener('pointerenter', () => g.classList.add('hover'));
    hit.addEventListener('pointerleave', () => g.classList.remove('hover'));
    root.append(g, hit);
    if (i % every === 0) {
      root.append(svg('text', { x: m.left + band * i + band / 2, y: height - 8, 'text-anchor': 'middle', class: 'tick' }, label));
    }
  });

  const parts = [root];
  if (series.length > 1) {
    parts.unshift(el('div', { class: 'legend legend-inline' },
      series.map((s) => el('span', {}, el('span', { class: 'swatch', style: { background: s.color } }), s.name))));
  }
  container.replaceChildren(...parts);
}

// ---------- Calendar heatmap (SVG) ----------

/**
 * GitHub-style daily calendar: one column per week, Sunday on top.
 * @param {{days: Map<string, number>, from: string, to: string, format: (n:number)=>string,
 *          addDays: Function, dayOfWeek: Function, fmtDate: Function, fmtMonthShort: Function}} opts
 */
export function calendarHeatmap(container, { days, from, to, format, addDays, dayOfWeek, fmtDate, monthLabel }) {
  const gap = 3, left = 30, topPad = 18;
  const width = Math.max(260, container.clientWidth || 600);
  // Align the first column to a Sunday; trim to what fits, keeping the most recent weeks.
  let start = addDays(from, -dayOfWeek(from));
  const totalWeeks = Math.ceil((Date.parse(to) - Date.parse(start)) / 86400000 / 7) + 1;
  // Cells grow to fill short ranges (up to 22px) and shrink to 11px for long ones.
  const cell = Math.max(11, Math.min(22, Math.floor((width - left) / totalWeeks) - gap));
  const maxWeeks = Math.floor((width - left) / (cell + gap));
  if (totalWeeks > maxWeeks) start = addDays(start, (totalWeeks - maxWeeks) * 7);
  const weeks = Math.min(totalWeeks, maxWeeks);
  const height = topPad + 7 * (cell + gap);

  // Five quantile bins over non-zero days.
  const values = [...days.entries()].filter(([d, v]) => d >= start && d <= to && v > 0).map(([, v]) => v).sort((a, b) => a - b);
  const q = [0.2, 0.4, 0.6, 0.8].map((p) => values[Math.floor(p * (values.length - 1))] ?? 0);
  const bin = (v) => (v <= 0 ? 0 : 1 + q.filter((t) => v > t).length);

  const root = svg('svg', { width: left + weeks * (cell + gap), height, class: 'heatmap', role: 'img', 'aria-label': 'Daily spending calendar' });
  ['Mon', 'Wed', 'Fri'].forEach((d, i) => root.append(svg('text', { x: 0, y: topPad + (i * 2 + 1) * (cell + gap) + cell - 2, class: 'tick' }, d)));

  let lastMonth = '';
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      if (date > to) break;
      if (d === 0 && date.slice(0, 7) !== lastMonth && Number(date.slice(8)) <= 7) {
        lastMonth = date.slice(0, 7);
        root.append(svg('text', { x: left + w * (cell + gap), y: 11, class: 'tick' }, monthLabel(lastMonth)));
      }
      const inRange = date >= from;
      const v = days.get(date) || 0;
      const rect = svg('rect', {
        x: left + w * (cell + gap), y: topPad + d * (cell + gap), width: cell, height: cell, rx: 3,
        class: inRange ? `heat heat-${bin(v)}` : 'heat heat-out', tabindex: inRange ? 0 : null,
        'aria-label': `${fmtDate(date)}: ${format(v)}`,
      });
      if (inRange) bindTooltip(rect, () => [fmtDate(date), [{ value: format(v), label: 'spent' }]]);
      root.append(rect);
    }
  }
  const legend = el('div', { class: 'heat-legend' }, el('span', { class: 'muted' }, 'Less'),
    [0, 1, 2, 3, 4, 5].map((i) => el('span', { class: `heat-swatch heat-${i}` })), el('span', { class: 'muted' }, 'More'));
  container.replaceChildren(root, legend);
}

// ---------- Weekday columns ----------

export function weekdayChart(container, { values, format }) {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  columnChart(container, {
    labels, longLabels: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    series: [{ name: 'Spent', color: 'var(--series-1)', values }], format, formatTick: format, height: 200,
  });
}

// ---------- Table view (accessible twin for every chart) ----------

/** @param {{columns: string[], rows: Array<Array<string>>, numeric?: number[]}} t */
export function dataTable({ columns, rows, numeric = [] }) {
  return el('table', { class: 'data-table' },
    el('thead', {}, el('tr', {}, columns.map((c, i) => el('th', { class: numeric.includes(i) ? 'num' : null }, c)))),
    el('tbody', {}, rows.map((r) => el('tr', {}, r.map((v, i) => el('td', { class: numeric.includes(i) ? 'num' : null }, v))))));
}
