import { FR, FR_PATTERNS } from './locales/fr.ts';

/** English message IDs keep source text reviewable. Bindings belong to presentation
 * nodes, never configuration, worker inputs, URLs or thermodynamic properties. */
export type Language = 'en' | 'fr';
export const LANGUAGE_KEY = 'heatpump-simulator.language';
let language: Language = 'en';
if (typeof window !== 'undefined') {
  try { if (localStorage.getItem(LANGUAGE_KEY) === 'fr') language = 'fr'; } catch { /* page-local choice */ }
}
export const getLanguage = (): Language => language;
const listeners = new Set<() => void>();
export const onLanguageChange = (fn: () => void): (() => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const patterns = FR_PATTERNS.map(([source, target]) => {
  const names: string[] = [];
  const parts = source.split(/(\{\w+\})/);
  const expression = parts.map(p => /^\{\w+\}$/.test(p)
    ? (names.push(p.slice(1, -1)), '([\\s\\S]*?)') : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
  return { expression: new RegExp(`^${expression}$`), target, names };
});
export function translate(source: string): string { return translateMessage(source, 0); }
const translatedArguments = new Set(['label', 'state', 'scale', 'theme', 'resolved', 'component', 'kind', 'detail', 'basis', 'phase', 'role', 'what', 'heat']);
function translateMessage(source: string, depth: number): string {
  if (language === 'en' || !source || depth > 5) return source;
  const exact = FR[source];
  if (exact !== undefined) return exact;
  for (const { expression, target, names } of patterns) {
    const match = expression.exec(source);
    if (match) return target.replace(/\{(\w+)\}/g, (_, name: string) => { const value = match[names.indexOf(name) + 1]; return value === undefined ? `{${name}}` : translatedArguments.has(name) && value !== source ? translateMessage(value, depth + 1) : value; });
  }
  return source; // Native diagnostics and unpublished OEM names keep their source wording.
}
interface Binding { node: WeakRef<Node>; attribute: string | null; source: string }
const byNode = new WeakMap<Node, Map<string, Binding>>();
const bindings = new Set<WeakRef<Binding>>();
const present = (b: Binding): void => {
  const node = b.node.deref();
  if (!node) return;
  const value = translate(b.source);
  if (b.attribute !== null) {
    const el = node as Element;
    if (el.getAttribute(b.attribute) !== value) el.setAttribute(b.attribute, value);
  } else if (node.textContent !== value) node.textContent = value;
};
function bind(node: Node, attribute: string | null, source: string): void {
  let map = byNode.get(node);
  if (!map) { map = new Map(); byNode.set(node, map); }
  const key = attribute ?? '';
  let b = map.get(key);
  if (!b) {
    b = { node: new WeakRef(node), attribute, source }; map.set(key, b); bindings.add(new WeakRef(b));
    if (bindings.size % 512 === 0) for (const ref of bindings) if (!ref.deref()) bindings.delete(ref);
  } else { if (b.source === source) return; b.source = source; }
  present(b);
}
export const bindText = (node: Node, source: string): void => bind(node, null, source);
export const bindAttribute = (node: Element, name: string, source: string): void => bind(node, name, source);
export const localizedAttribute = (name: string): boolean => ['title', 'aria-label', 'aria-valuetext', 'placeholder', 'alt'].includes(name);
/** Bind a newly generated, trusted UI fragment once. Switching language updates its
 * existing text/attribute nodes, preserving controls and focus; no observer/rebuild. */
export function bindFragment(root: Element): void {
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) { if (node.textContent?.trim()) bindText(node, node.textContent); return; }
    if (node instanceof Element) {
      for (const a of node.attributes) if (localizedAttribute(a.name)) bindAttribute(node, a.name, a.value);
      if (['SCRIPT', 'STYLE'].includes(node.tagName)) return;
    }
    for (const child of node.childNodes) walk(child);
  };
  for (const child of root.childNodes) walk(child);
}
export function setLanguage(next: Language): void {
  if (next === language) return;
  language = next;
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(LANGUAGE_KEY, next); } catch { /* choice remains in this page */ }
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  for (const ref of bindings) { const b = ref.deref(); if (b) present(b); else bindings.delete(ref); }
  for (const fn of listeners) fn();
}
if (typeof document !== 'undefined') document.documentElement.lang = language;
