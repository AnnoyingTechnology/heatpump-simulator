import { clamp, html, setText } from './dom';
import type { AppState } from './types';

/**
 * Contextual popovers anchored to scene objects. Four shells exist (component inspector, room settings, line-set settings,
 * outdoor-unit settings); each content module is built once and shared by every index it serves, so a control is one bound
 * instance per property. Only one shell is visible at a time and none reserves layout space.
 */
export type PopKind = 'inspector' | 'room' | 'lines' | 'outdoor';

export interface PopContent {
  root: HTMLElement;
  heading(s: AppState, i: number): { kicker: string; title: string };
  /** Rebinds the content to index `i` and refreshes it. Called only while the popover is visible. */
  sync(s: AppState, i: number): void;
  /** Opens a named disclosure inside the content, when it has one. */
  reveal?(key: string): void;
}

export interface Popovers {
  root: HTMLElement;
  open(kind: PopKind, i: number, anchor: () => Element | null, reveal?: string): void;
  /** Opens, or closes when the same popover for the same index is already visible (gear and Lines buttons). */
  toggle(kind: PopKind, i: number, anchor: () => Element | null): void;
  /** Hides without notifying the owner. */
  close(): void;
  /** Hides, notifies the owner (selection is cleared) and optionally returns focus to the opener. */
  dismiss(refocus?: boolean): void;
  isOpen(kind?: PopKind): boolean;
  sync(s: AppState): void;
  /** Cheap per-frame reposition; writes only when the anchor, the stage or the popover size changed. */
  tick(): void;
}

const MARGIN = 8;
const GAP = 8;

/** Preferred sides per kind. Room and line popovers prefer the free left side so the room card stays readable. */
const ORDER: Record<PopKind, ReadonlyArray<'left' | 'right' | 'below' | 'above'>> = {
  inspector: ['right', 'left', 'below', 'above'],
  outdoor: ['right', 'left', 'below', 'above'],
  room: ['left', 'below', 'above', 'right'],
  lines: ['left', 'below', 'above', 'right'],
};

export function createPopovers(contents: Record<PopKind, PopContent>, getState: () => AppState, onDismiss: () => void): Popovers {
  const root = html('div', { class: 'pops' });
  const shells = {} as Record<PopKind, { el: HTMLElement; kicker: HTMLElement; title: HTMLElement }>;
  /** `roomId` pins a room or line-set popover to the room it opened for; indices shift when a room is removed. */
  let current: { kind: PopKind; i: number; anchor: () => Element | null; roomId: string | null } | null = null;
  let opener: HTMLElement | null = null;
  let lastKey = '';

  const hide = (): void => {
    if (current) shells[current.kind].el.hidden = true;
    current = null;
    lastKey = '';
  };
  const dismiss = (refocus = false): void => {
    const back = opener;
    hide();
    onDismiss();
    if (refocus && back?.isConnected) back.focus({ preventScroll: true });
  };

  for (const kind of ['inspector', 'room', 'lines', 'outdoor'] as const) {
    const content = contents[kind];
    const kicker = html('span', { class: 'kicker' });
    const title = html('h2', {});
    const close = html('button', { type: 'button', class: 'pop-close', 'aria-label': 'Close' }, '×');
    close.addEventListener('click', () => dismiss(false));
    const el = html('section', { class: 'pop', 'data-pop': kind, role: 'dialog', 'aria-label': kind, hidden: true, tabindex: -1 },
      html('header', { class: 'pop-head' }, html('div', { class: 'pop-title' }, kicker, title), close),
      html('div', { class: 'pop-body' }, content.root));
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      dismiss(true);
    });
    shells[kind] = { el, kicker, title };
    root.append(el);
  }

  function refresh(): void {
    if (!current) return;
    const s = getState();
    const sh = shells[current.kind];
    const h = contents[current.kind].heading(s, current.i);
    setText(sh.kicker, h.kicker);
    setText(sh.title, h.title);
    contents[current.kind].sync(s, current.i);
  }

  function place(force: boolean): void {
    if (!current) return;
    const el = shells[current.kind].el;
    const host = root.parentElement;
    const a = current.anchor();
    if (!host || !a?.isConnected) return;
    const H = host.getBoundingClientRect();
    const A = a.getBoundingClientRect();
    const key = [A.left, A.top, A.width, A.height, H.left, H.top, H.width, H.height, el.offsetWidth, el.offsetHeight].map(Math.round).join(',');
    if (!force && key === lastKey) return;
    lastKey = key;
    const maxH = Math.max(160, H.height - 2 * MARGIN);
    el.style.maxHeight = `${maxH}px`;
    const w = Math.min(el.offsetWidth, H.width - 2 * MARGIN);
    const h = Math.min(el.offsetHeight, maxH);
    const ax = A.left - H.left;
    const ay = A.top - H.top;
    const ar = ax + A.width;
    const ab = ay + A.height;
    const at = { left: [ax - GAP - w, ay], right: [ar + GAP, ay], below: [ar - w, ab + GAP], above: [ar - w, ay - GAP - h] } as const;
    let best = { x: MARGIN, y: MARGIN, score: Number.POSITIVE_INFINITY };
    ORDER[current.kind].forEach((side, rank) => {
      const [x, y] = at[side];
      const cx = clamp(x, MARGIN, Math.max(MARGIN, H.width - w - MARGIN));
      const cy = clamp(y, MARGIN, Math.max(MARGIN, H.height - h - MARGIN));
      const ox = Math.max(0, Math.min(cx + w, ar) - Math.max(cx, ax));
      const oy = Math.max(0, Math.min(cy + h, ab) - Math.max(cy, ay));
      // Overlap with the anchor dominates, then how far the viewport clamp had to move it, then the stated preference.
      const score = ox * oy + (Math.abs(cx - x) + Math.abs(cy - y)) * 200 + rank;
      if (score < best.score) best = { x: cx, y: cy, score };
    });
    el.style.left = `${Math.round(best.x)}px`;
    el.style.top = `${Math.round(best.y)}px`;
  }

  function open(kind: PopKind, i: number, anchor: () => Element | null, reveal?: string): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !root.contains(active)) opener = active;
    if (current && current.kind !== kind) shells[current.kind].el.hidden = true;
    const bound = kind === 'room' || kind === 'lines';
    current = { kind, i, anchor, roomId: bound ? getState().cfg.rooms[i]?.id ?? null : null };
    lastKey = '';
    shells[kind].el.hidden = false;
    refresh();
    if (reveal) contents[kind].reveal?.(reveal);
    place(true);
  }

  return {
    root,
    open,
    toggle(kind, i, anchor): void {
      if (current?.kind === kind && current.i === i) dismiss(false);
      else open(kind, i, anchor);
    },
    close: hide,
    dismiss,
    isOpen: (kind) => current !== null && (kind === undefined || current.kind === kind),
    sync(s: AppState): void {
      if (!current) return;
      // A room or line-set popover closes when its room is removed or its index is rebound to another room, so it can never
      // silently edit a different room after the list reflows.
      const gone = current.kind === 'inspector' ? s.ui.selected === null
        : (current.kind === 'room' || current.kind === 'lines')
          && (current.i >= s.cfg.unitCount || s.cfg.rooms[current.i]?.id !== current.roomId);
      if (gone) { hide(); return; }
      refresh();
    },
    tick: () => place(false),
  };
}
