import { clamp, setAttr, svg } from './dom';
import { AIR_RAMP_MAX, AIR_RAMP_MIN, TEMP_RAMP_MAX, TEMP_RAMP_MIN, airColor, tempColor } from './circuit';

/** Decorative vector symbols: values and accessible labels remain in their existing readouts. */
export function temperatureSymbol(scale: 'air' | 'refrigerant' = 'air') {
  const min = scale === 'air' ? AIR_RAMP_MIN : TEMP_RAMP_MIN;
  const max = scale === 'air' ? AIR_RAMP_MAX : TEMP_RAMP_MAX;
  const column = svg('rect', { class: 'thermometer-column', x: 10.5, y: 16, width: 3, height: 0, rx: 1.5, stroke: 'none' });
  const bulb = svg('circle', { cx: 12, cy: 19, r: 2.2, stroke: 'none' });
  const root = svg('svg', { class: 'measurement-symbol thermometer', viewBox: '0 0 24 24', width: 19, height: 23, 'aria-hidden': 'true', focusable: 'false', 'data-min': min, 'data-max': max },
    svg('path', { d: 'M9 15.1V5a3 3 0 0 1 6 0v10.1a5 5 0 1 1-6 0Z' }), column, bulb,
    svg('path', { d: 'M18 5h3M18 9h2M18 13h3' }));
  function update(value: number | null): void {
    const known = value !== null && Number.isFinite(value);
    const fraction = known ? clamp((value - min) / (max - min), 0, 1) : 0;
    const color = known ? (scale === 'air' ? airColor(value) : tempColor(value)) : 'transparent';
    setAttr(column, 'y', 16 - fraction * 12);
    setAttr(column, 'height', fraction * 12);
    setAttr(column, 'fill', color);
    setAttr(bulb, 'fill', color);
    setAttr(root, 'data-temperature', known ? value : 'unknown');
  }
  update(null);
  return { root, update };
}

export type ThermalService = 'heating' | 'cooling' | null;
export function powerSymbol() {
  const flame = svg('path', { class: 'symbol-flame', d: 'M12 2c2 3 3 5 2.5 7 2-1 2.5-2.5 2.5-4 2.5 3 4 6 4 9a8 8 0 1 1-16 0c0-5 4-7 7-12ZM12 12c1 3 3 3.5 3 6a3 3 0 0 1-6 0c0-2 2-3 3-6Z' });
  const snow = svg('path', { class: 'symbol-snow', d: 'M12 2v20M3.34 7l17.32 10M3.34 17L20.66 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-1-1-4M20 14l-4 1 1 4M7 19l1-4-4-1M17 5l-1 4 4 1' });
  const root = svg('svg', { class: 'measurement-symbol thermal-symbol', viewBox: '0 0 24 24', width: 19, height: 23, 'aria-hidden': 'true', focusable: 'false' }, flame, snow);
  function update(service: ThermalService): void {
    setAttr(flame, 'display', service === 'heating' ? 'inline' : 'none');
    setAttr(snow, 'display', service === 'cooling' ? 'inline' : 'none');
    setAttr(root, 'data-service', service ?? 'unknown');
  }
  update(null);
  return { root, update };
}
