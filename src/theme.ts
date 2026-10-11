import { html, svg } from './dom';

/**
 * Colour theme: System (default, follows the OS), Light or Dark. Presentation only: nothing here reads or writes the simulation
 * store, so changing theme never touches configuration, the clock or the pause state.
 *
 * `<html data-theme>` is the resolved theme (`light` | `dark`) the stylesheet keys on; `<html data-theme-choice>` is the user's
 * choice. An inline script in index.html sets both before first paint using the same key and rules as below.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';
export type ThemeResolved = 'light' | 'dark';

/** Shared with the inline script in index.html. Absent = System; only an explicit Light or Dark is stored. */
export const THEME_KEY = 'heatpump-simulator.theme';

const OPTIONS: ReadonlyArray<{ value: ThemeChoice; text: string }> = [
  { value: 'system', text: 'System' },
  { value: 'light', text: 'Light' },
  { value: 'dark', text: 'Dark' },
];

const dark = window.matchMedia('(prefers-color-scheme: dark)');
const isChoice = (v: string): v is ThemeChoice => OPTIONS.some((o) => o.value === v);

function readStored(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system'; // storage denied or unavailable
  }
}

function writeStored(choice: ThemeChoice): void {
  try {
    if (choice === 'system') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage denied: the choice still applies, for this page only.
  }
}

type Listener = (choice: ThemeChoice, resolved: ThemeResolved) => void;
const listeners = new Set<Listener>();
let choice: ThemeChoice = readStored();

const resolve = (): ThemeResolved => (choice === 'system' ? (dark.matches ? 'dark' : 'light') : choice);

function apply(): void {
  const resolved = resolve();
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themeChoice = choice;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', resolved);
  for (const fn of listeners) fn(choice, resolved);
}

export function setTheme(next: ThemeChoice): void {
  if (next === choice) return;
  choice = next;
  writeStored(next);
  apply();
}

// The OS preference only matters while System is selected; another tab's explicit choice is followed too.
dark.addEventListener('change', () => { if (choice === 'system') apply(); });
window.addEventListener('storage', (e) => {
  if (e.key !== THEME_KEY && e.key !== null) return;
  const stored = readStored();
  if (stored === choice) return;
  choice = stored;
  apply();
});
apply();

const ICON = {
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8',
  moon: 'M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2z',
  system: 'M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4zM12 3.8v16.4',
} as const;

/**
 * Compact native chooser. The closed control is an icon for the current choice laid under a transparent `<select>`, so the
 * platform supplies the menu, keyboard handling (arrows, type-ahead, Enter, Escape), outside-click dismissal and accessible
 * name/value. While the native list is open the browser consumes Escape; the window shortcut for Escape (zoom out) only sees
 * it when the list is closed.
 */
export function createThemeControl(): HTMLElement {
  const sel = html('select', { class: 'th-select', 'aria-label': 'Colour theme' },
    ...OPTIONS.map((o) => html('option', { value: o.value }, o.text)));
  const icon = svg('svg', { class: 'th-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    svg('path', { class: 'i-system', d: ICON.system }),
    svg('path', { class: 'i-system-half', d: 'M12 3.8a8.2 8.2 0 0 0 0 16.4z' }),
    svg('path', { class: 'i-light', d: ICON.sun }),
    svg('path', { class: 'i-dark', d: ICON.moon }));
  const root = html('div', { class: 'hd-theme' }, icon, sel);
  sel.addEventListener('change', () => { if (isChoice(sel.value)) setTheme(sel.value); });
  const sync: Listener = (c, resolved) => {
    if (sel.value !== c) sel.value = c;
    const text = OPTIONS.find((o) => o.value === c)?.text ?? c;
    root.title = c === 'system' ? `Colour theme: ${text} (following the OS, currently ${resolved})` : `Colour theme: ${text}`;
  };
  listeners.add(sync);
  sync(choice, resolve());
  return root;
}
