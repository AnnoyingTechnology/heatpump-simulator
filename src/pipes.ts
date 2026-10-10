import { polyPath, setAttr, svg, toggleClass } from './dom';
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
 * One refrigerant tube. Layers: halo / insulation / wall / phase fill / two-phase stripes / temperature core /
 * animated flow dashes / static direction arrowhead. Phase and temperature are independent encodings.
 */
export class Pipe {
  readonly g: SVGGElement;
  readonly title: SVGTitleElement;
  private readonly layers: Record<'halo' | 'insul' | 'wall' | 'fill' | 'pat' | 'core' | 'flow', SVGPathElement>;
  private readonly arrow: SVGPolygonElement | null;
  private readonly arrowAt: { x: number; y: number; deg: number } | null;
  private lastKey = '';

  constructor(readonly spec: PipeSpec) {
    const d = polyPath(spec.pts);
    const mk = (cls: string): SVGPathElement => svg('path', { class: cls, d });
    this.layers = {
      halo: mk('p-halo'), insul: mk('p-insul'), wall: mk('p-wall'), fill: mk('p-fill'),
      pat: mk('p-pat'), core: mk('p-core'), flow: mk('p-flow'),
    };
    this.title = svg('title');
    this.g = svg('g', { class: `pipe pipe-${spec.cls}`, 'data-seg': spec.id });
    this.g.append(this.title);
    if (!spec.halo) this.layers.halo.remove();
    for (const [k, el] of Object.entries(this.layers)) {
      if (k === 'halo' && !spec.halo) continue;
      if (k === 'insul' && !spec.insul) continue;
      this.g.append(el);
    }
    this.arrowAt = longestMid(spec.pts);
    this.arrow = this.arrowAt
      ? svg('polygon', { class: 'p-arrow', points: '-3.6,-3 3.6,0 -3.6,3' })
      : null;
    if (this.arrow) this.g.append(this.arrow);
  }

  setWidth(w: number): void {
    const l = this.layers;
    setAttr(l.halo, 'stroke-width', w + 5);
    setAttr(l.insul, 'stroke-width', w + 4.5);
    setAttr(l.wall, 'stroke-width', w + 1.8);
    setAttr(l.fill, 'stroke-width', w);
    setAttr(l.pat, 'stroke-width', Math.max(1.2, w * 0.82));
    setAttr(l.core, 'stroke-width', Math.min(1.5, Math.max(0.9, w * 0.34)));
    setAttr(l.flow, 'stroke-width', Math.min(1.6, Math.max(0.9, w * 0.32)));
  }

  update(st: SegState, tempLabel: string): void {
    const key = `${st.phase}|${st.dir}|${st.tempC}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    setAttr(this.g, 'data-phase', st.phase);
    setAttr(this.g, 'data-dir', st.dir);
    setAttr(this.layers.core, 'stroke', st.tempC === null || st.phase === 'idle' || st.phase === 'off' ? 'transparent' : tempColor(st.tempC));
    toggleClass(this.g, 'moving', st.dir !== 0 && (st.phase === 'vapor' || st.phase === 'liquid' || st.phase === 'two'));
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
