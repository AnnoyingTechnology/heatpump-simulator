import { temperatureSymbol } from './measurement-symbols';
import { html } from './dom';
import { bindFragment } from './i18n';

export interface Field {
  root: HTMLElement;
  refresh(): void;
}

interface SliderOpts {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  digits: number;
  get(): number;
  set(v: number): void;
  hint?: string;
  temperatureScale?: 'air' | 'refrigerant';
}

let uid = 0;
export const nextId = (p: string): string => `${p}-${++uid}`;

/**
 * Range + number pair. Inputs are created once; refresh() writes values only to inputs that are not focused,
 * so dragging or typing is never interrupted by a state notification.
 */
export function slider(o: SliderOpts): Field {
  const id = nextId('f');
  const range = html('input', { type: 'range', id, min: o.min, max: o.max, step: o.step });
  const num = html('input', { type: 'number', min: o.min, max: o.max, step: o.step, class: 'num', 'aria-label': `${o.label} [${o.unit}]` });
  const thermometer = o.unit === '°C' ? temperatureSymbol(o.temperatureScale) : null;
  const unit = html('span', { class: 'unit' }, o.unit);
  const root = html('div', { class: 'field' },
    html('div', { class: 'field-head' }, html('label', { for: id }, o.label), html('span', { class: 'num-wrap' }, ...(thermometer ? [thermometer.root] : []), num, unit)),
    range);
  if (o.hint) root.append(html('p', { class: 'hint' }, o.hint));
  const commit = (raw: string): void => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    o.set(Math.min(o.max, Math.max(o.min, v)));
  };
  range.addEventListener('input', () => commit(range.value));
  num.addEventListener('input', () => commit(num.value));
  num.addEventListener('blur', () => { num.value = o.get().toFixed(o.digits); });
  const refresh = (): void => {
    const v = o.get();
    thermometer?.update(v);
    if (document.activeElement !== range) range.value = String(v);
    if (document.activeElement !== num) num.value = v.toFixed(o.digits);
  };
  refresh();
  return { root, refresh };
}

export interface SelectOpts<T extends string> {
  label: string;
  options: ReadonlyArray<{ value: T; text: string; disabled?: boolean }>;
  get(): T;
  set(v: T): void;
  hint?: string;
}

export function select<T extends string>(o: SelectOpts<T>): Field & { sel: HTMLSelectElement } {
  const id = nextId('s');
  const sel = html('select', { id });
  const rebuild = (): void => {
    sel.replaceChildren(...o.options.map((op) => html('option', { value: op.value, disabled: op.disabled }, op.text)));
  };
  rebuild();
  sel.addEventListener('change', () => o.set(sel.value as T));
  const root = html('div', { class: 'field' }, html('div', { class: 'field-head' }, html('label', { for: id }, o.label)), sel);
  if (o.hint) root.append(html('p', { class: 'hint' }, o.hint));
  return {
    root, sel,
    refresh(): void {
      if (document.activeElement !== sel || sel.value !== o.get()) sel.value = o.get();
    },
  };
}

export interface SegOpts<T extends string | number> {
  label: string;
  options: ReadonlyArray<{ value: T; text: string; disabled?: boolean; title?: string }>;
  get(): T;
  set(v: T): void;
  compact?: boolean;
  isDisabled?(v: T): boolean;
}

export function segmented<T extends string | number>(o: SegOpts<T>): Field & { buttons: HTMLButtonElement[] } {
  const buttons = o.options.map((op) => {
    const b = html('button', { type: 'button', class: 'seg-btn', title: op.title, disabled: op.disabled }, op.text);
    b.addEventListener('click', () => o.set(op.value));
    return b;
  });
  const root = html('div', { class: `seg${o.compact ? ' compact' : ''}`, role: 'group', 'aria-label': o.label }, ...buttons);
  return {
    root, buttons,
    refresh(): void {
      const cur = o.get();
      o.options.forEach((op, i) => {
        const b = buttons[i];
        if (!b) return;
        const on = op.value === cur;
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('on', on);
        b.disabled = !!op.disabled || (o.isDisabled?.(op.value) ?? false);
      });
    },
  };
}

/** Replaces innerHTML only when the string changed so focus inside is not lost on unrelated updates. */
export function setHtml(el: HTMLElement, markup: string): void {
  if (el.dataset.markup === markup) return;
  el.dataset.markup = markup;
  el.innerHTML = markup;
  bindFragment(el);
}
