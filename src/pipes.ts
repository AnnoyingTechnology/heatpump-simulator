import { clamp, polyPath, setAttr, svg, toggleClass } from './dom';
import { phaseLabel, tempColor } from './circuit';
import type { SegState } from './circuit';

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
    setAttr(this.layers.fill, 'stroke', t !== null ? tempColor(t) : flowing ? TUBE_UNKNOWN : st.phase === 'off' ? TUBE_OFF : TUBE_IDLE);
    toggleClass(this.g, 'moving', st.dir !== 0 && flowing);
    this.title.textContent = `${this.spec.title} · ${phaseLabel(st.phase)} · ${tempLabel}`;
    if (this.arrow && this.arrowAt) {
      const deg = this.arrowAt.deg + (st.dir < 0 ? 180 : 0);
      setAttr(this.arrow, 'transform', `translate(${this.arrowAt.x} ${this.arrowAt.y}) rotate(${deg})`);
    }
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
