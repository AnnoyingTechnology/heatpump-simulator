import { clamp, fmt, polyPath, setAttr, setText, svg, toggleClass } from './dom';
import { phaseLabel, tempColor } from './circuit';
import type { SegState } from './circuit';
import { PILL } from './geometry';

export type Pt = readonly [number, number];
export type PipeClass = 'gas' | 'liq' | 'coil';

export interface PipeSpec {
  id: string;
  pts: ReadonlyArray<Pt>;
  cls: PipeClass;
  title: string;
  /** Insulation sleeve under the tube (field lines). */
  insul?: boolean;
  /** Draw a background-coloured halo so the tube visibly hops over crossing tubes. */
  halo?: boolean;
}

/**
 * Tube interiors that carry no temperature. Solid grey: nothing flows. Hatched (`#pTempNone`, defined with the scene
 * gradients): fluid flows but the model reports no temperature for this segment, so nothing is fabricated.
 */
const TUBE_IDLE = '#a5abb1';
const TUBE_OFF = '#aeb5bb';
const TUBE_UNKNOWN = 'url(#pTempNone)';

/**
 * One refrigerant tube. Layers: halo / insulation / wall / temperature fill (full interior width) / phase marks
 * (dark under-stroke + white stroke, thin, centred) / static direction arrowhead. The phase marks drift along the flow
 * direction, so flow is shown without painting over the temperature colour.
 */
export class Pipe {
  readonly g: SVGGElement;
  readonly title: SVGTitleElement;
  private readonly layers: Record<'halo' | 'insul' | 'wall' | 'fill' | 'markBack' | 'mark', SVGPathElement>;
  private readonly arrow: SVGPolygonElement | null;
  private readonly arrowAt: { x: number; y: number; deg: number } | null;
  private lastKey = '';

  constructor(readonly spec: PipeSpec) {
    const d = polyPath(spec.pts);
    const mk = (cls: string): SVGPathElement => svg('path', { class: cls, d });
    this.layers = {
      halo: mk('p-halo'), insul: mk('p-insul'), wall: mk('p-wall'), fill: mk('p-fill'),
      markBack: mk('p-mkd'), mark: mk('p-mk'),
    };
    this.title = svg('title');
    this.g = svg('g', { class: `pipe pipe-${spec.cls}`, 'data-seg': spec.id });
    this.g.append(this.title);
    for (const [k, el] of Object.entries(this.layers)) {
      if (k === 'halo' && !spec.halo) continue;
      if (k === 'insul' && !spec.insul) continue;
      this.g.append(el);
    }
    this.arrowAt = longestMid(spec.pts);
    this.arrow = this.arrowAt
      ? svg('polygon', { class: 'p-arrow', points: '-3.4,-2.8 3.4,0 -3.4,2.8' })
      : null;
    if (this.arrow) this.g.append(this.arrow);
  }

  setWidth(w: number): void {
    const l = this.layers;
    const m = clamp(w * 0.3, 0.8, 1.6);
    setAttr(l.halo, 'stroke-width', w + 5);
    setAttr(l.insul, 'stroke-width', w + 4.5);
    setAttr(l.wall, 'stroke-width', w + 1.8);
    setAttr(l.fill, 'stroke-width', w);
    // Marks stay thin so the temperature colour keeps the interior; narrow coil tubes get a thinner dark outline.
    setAttr(l.markBack, 'stroke-width', m + (w < 3.4 ? 0.5 : 0.9));
    setAttr(l.mark, 'stroke-width', m);
  }

  update(st: SegState, tempLabel: string): void {
    const key = `${st.phase}|${st.dir}|${st.tempC}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const flowing = st.phase === 'vapor' || st.phase === 'liquid' || st.phase === 'two';
    const t = flowing ? st.tempC : null;
    setAttr(this.g, 'data-phase', st.phase);
    setAttr(this.g, 'data-dir', st.dir);
    setAttr(this.g, 'data-temp', t === null ? 'unknown' : t.toFixed(1));
    setAttr(this.layers.fill, 'stroke', t !== null ? tempColor(t) : flowing || st.phase === 'unknown' ? TUBE_UNKNOWN : st.phase === 'off' ? TUBE_OFF : TUBE_IDLE);
    toggleClass(this.g, 'moving', st.dir !== 0 && flowing);
    this.title.textContent = `${this.spec.title} · ${phaseLabel(st.phase)} · ${tempLabel}`;
    if (this.arrow && this.arrowAt) {
      const deg = this.arrowAt.deg + (st.dir < 0 ? 180 : 0);
      setAttr(this.arrow, 'transform', `translate(${this.arrowAt.x} ${this.arrowAt.y}) rotate(${deg})`);
    }
  }
}

/** Pill and chip size of every temperature probe, in scene units (defined with the anchors in geometry.ts). */
const PROBE = PILL;

export interface ProbeSpec {
  /** Stable identifier written to `data-probe`, e.g. `indoor-gas-0`. */
  id: string;
  /** Accessible name, e.g. `Indoor 1 gas-end refrigerant`. */
  label: string;
  /** Top-left corner of the pill. */
  at: Pt;
  /** Point on the pipe where the clamp sits. */
  clamp: Pt;
  /** Pill edge point where the leader leaves the pill. */
  lead: Pt;
}

/**
 * A materialised refrigerant temperature probe: clamp ring on the pipe, leader, and a small pill with a role chip
 * (IN / OUT / D / S) and the exact temperature rounded to 0.1 °C with a separate unit. Built once; update() writes text and
 * attributes only. The swatch under the value repeats the refrigerant-scale colour of that exact value.
 */
export class Probe {
  readonly g: SVGGElement;
  private readonly chip: SVGTextElement;
  private readonly val: SVGTextElement;
  private readonly swatch: SVGRectElement;
  private readonly title: SVGTitleElement;
  private lastKey = '';

  constructor(readonly spec: ProbeSpec) {
    const [x, y] = spec.at;
    this.chip = svg('text', { x: PROBE.chip / 2, y: 13.4, class: 's-tag', 'text-anchor': 'middle' });
    this.val = svg('text', { x: PROBE.w - 17, y: 14.8, class: 's-val', 'text-anchor': 'end' });
    this.swatch = svg('rect', { class: 's-swatch', x: PROBE.chip, y: PROBE.h - 3, width: PROBE.w - PROBE.chip - 1, height: 2, rx: 1 });
    this.title = svg('title');
    const unit = svg('text', { x: PROBE.w - 15, y: 14.4, class: 's-unit' });
    unit.textContent = '°C';
    this.g = svg('g', { class: 'probe', 'data-probe': spec.id, 'aria-label': spec.label, role: 'img' },
      this.title,
      svg('path', { class: 's-leader', d: `M${spec.lead[0]} ${spec.lead[1]}L${spec.clamp[0]} ${spec.clamp[1]}` }),
      svg('circle', { class: 's-clamp', cx: spec.clamp[0], cy: spec.clamp[1], r: 3.2 }),
      svg('circle', { class: 's-dot', cx: spec.clamp[0], cy: spec.clamp[1], r: 1.1 }),
      svg('g', { class: 's-pill-g', transform: `translate(${x} ${y})` },
        svg('rect', { class: 's-pill', width: PROBE.w, height: PROBE.h, rx: 3.4 }),
        svg('path', { class: 's-chip', d: `M3.4 0H${PROBE.chip}V${PROBE.h}H3.4A3.4 3.4 0 0 1 0 ${PROBE.h - 3.4}V3.4A3.4 3.4 0 0 1 3.4 0z` }),
        this.chip, this.val, unit, this.swatch));
  }

  /** `role` is the chip text; `tempC` null shows a dimmed dash, never a zero. */
  update(role: string, tempC: number | null, source: 'live' | 'example', held: boolean, detail: string): void {
    const key = `${role}|${tempC}|${source}|${held}|${detail}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const text = tempC === null ? '—' : fmt(tempC, 1);
    setText(this.chip, role);
    setText(this.val, text);
    toggleClass(this.g, 'na', tempC === null);
    toggleClass(this.g, 'held', held);
    setAttr(this.g, 'data-role', role);
    setAttr(this.g, 'data-source', source);
    setAttr(this.g, 'data-temp', tempC === null ? 'unknown' : tempC.toFixed(1));
    setAttr(this.g, 'data-exact', tempC === null ? '' : String(tempC));
    setAttr(this.swatch, 'fill', tempC === null ? 'transparent' : tempColor(tempC));
    setText(this.title, `${this.spec.label} · ${role} · ${tempC === null ? 'unavailable' : `${text} °C`} · ${detail}`);
  }
}

/** Signed value with an explicit plus; a value that rounds to zero carries no sign. */
export function signed(v: number, digits: number): string {
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return r === 0 ? fmt(0, digits) : r > 0 ? `+${fmt(r, digits)}` : fmt(r, digits);
}

/**
 * Two or three quiet lines beside a probe pair: signed ΔT (OUT − IN) from the exact values and the refrigerant-side coil heat
 * named as absorbed or released. Heat is the refrigerant's, never the room's net kW (they differ while the building stores heat).
 */
export class CoilNote {
  readonly g: SVGGElement;
  private readonly l1: SVGTextElement;
  private readonly l2: SVGTextElement;
  private readonly l3: SVGTextElement;
  private lastKey = '';

  constructor(readonly id: string, at: Pt, anchor: 'start' | 'end' = 'start', lineGap = 11.5) {
    const mk = (cls: string, k: number): SVGTextElement => svg('text', { x: at[0], y: at[1] + k * lineGap, class: cls, 'text-anchor': anchor });
    this.l1 = mk('s-note', 0);
    this.l2 = mk('s-note', 1);
    this.l3 = mk('s-note s-ill', 2);
    this.g = svg('g', { class: 'coil-note', 'data-readout': id }, this.l1, this.l2, this.l3);
  }

  /** `illustrativeLine` adds the Examples tag as its own visible line (indoor notes reuse line 2 instead). */
  update(deltaK: number | null, heatW: number | null, source: 'live' | 'example', mode: 'line2-illustrative' | 'line3-illustrative'): void {
    const key = `${deltaK}|${heatW}|${source}|${mode}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const ex = source === 'example';
    setText(this.l1, `REF ΔT ${deltaK === null ? '—' : signed(deltaK, 1)} K`);
    let heat = heatW === null ? 'coil heat —' : heatW === 0 ? '0.00 kW' : `${heatW < 0 ? 'absorbs' : 'releases'} ${fmt(Math.abs(heatW) / 1000, 2)} kW`;
    if (ex && mode === 'line2-illustrative') heat = heatW === null ? 'illustrative' : `${heat} · illustr.`;
    setText(this.l2, heat);
    setText(this.l3, ex && mode === 'line3-illustrative' ? 'illustrative' : '');
    setAttr(this.g, 'data-delta-k', deltaK === null ? 'unknown' : String(deltaK));
    setAttr(this.g, 'data-heat-w', heatW === null ? 'unknown' : String(heatW));
    setAttr(this.g, 'data-source', source);
  }
}

function longestMid(pts: ReadonlyArray<Pt>): { x: number; y: number; deg: number } | null {
  let best = 0;
  let out: { x: number; y: number; deg: number } | null = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > best && len >= 22) {
      best = len;
      out = { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, deg: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI };
    }
  }
  return out;
}
