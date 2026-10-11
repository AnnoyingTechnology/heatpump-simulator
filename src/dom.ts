import { bindText, bindAttribute, localizedAttribute, getLanguage } from './i18n';
const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number | boolean | undefined | null>;

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  setAttrs(el, attrs);
  for (const c of children) { if (typeof c === 'string') { const text = document.createTextNode(''); bindText(text, c); el.append(text); } else el.append(c); }
  return el;
}

export function html<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  setAttrs(el, attrs);
  for (const c of children) { if (typeof c === 'string') { const text = document.createTextNode(''); bindText(text, c); el.append(text); } else el.append(c); }
  return el;
}

export function setAttrs(el: Element, attrs: Attrs): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    setAttr(el, k, v === true ? '' : String(v));
  }
}

/** Sets text only when it changed, to avoid needless layout. */
export function setText(el: Element, text: string): void {
  bindText(el, text);
}

export function setAttr(el: Element, name: string, value: string | number): void {
  const v = String(value);
  if (localizedAttribute(name)) { bindAttribute(el, name, v); return; }
  if (el.getAttribute(name) !== v) el.setAttribute(name, v);
}

export function toggleClass(el: Element, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

export function polyPath(pts: ReadonlyArray<readonly [number, number]>): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`).join(' ');
}

export function fmt(v: number | null | undefined, digits = 2, dash = '—'): string {
  if (v === null || v === undefined || Number.isNaN(v)) return dash;
  const text = v.toFixed(digits).replace('-', '−');
  return getLanguage() === 'fr' ? text.replace('.', ',') : text;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
