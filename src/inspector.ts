import { phaseLabel, valvePairs } from './circuit';
import { setHtml } from './controls';
import { escapeHtml, fmt, html, setText } from './dom';
import { PREVIEW_BANNER } from './fixtures';
import { branchesFor, readingFlowMode, segmentFor } from './runtime/view';
import { activeRooms, currentReadings, indoorCleanliness, outdoorCleanliness, store } from './state';
import type { Current, EffectiveCleanliness } from './state';
import type { RefrigerantState } from './engine/types';
import type { AppState } from './types';
import { INDOOR_CLASSES, OWNER_PORTS } from './types';
import { LIVE_BASIS } from './chrome';

type Row = [string, string];

function rows(list: Row[]): string {
  return `<dl class="rows">${list.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

function block(title: string, body: string, cls = ''): string {
  return `<section class="ins-block ${cls}"><h4>${title}</h4>${body}</section>`;
}

const EDIT_EQUIPMENT = '<button type="button" class="btn small" data-action="tab" data-tab="equipment">Edit equipment</button>';

const kw = (v: number | null, d = 3): string => (v === null ? '—' : `${fmt(v, d)} <i>kW</i>`);
const deg = (v: number | null | undefined, d = 1): string => (v === null || v === undefined ? '—' : `${fmt(v, d)} <i>°C</i>`);
const num = (v: number | null | undefined, d: number, unit: string): string => (v === null || v === undefined ? '—' : `${fmt(v, d)} <i>${unit}</i>`);

function pressure(v: number | null | undefined, s: AppState): string {
  if (v === null || v === undefined) return '—';
  return s.ui.pressure === 'abs' ? `${fmt(v, 2)} <i>bar(a)</i>` : `${fmt(v - 1.01325, 2)} <i>bar(g)</i>`;
}

/** Mass quality is only meaningful in two-phase; the engine reports null elsewhere and nothing is inferred. */
const quality = (q: number | null | undefined): string => (q === null || q === undefined ? '—' : fmt(q, 3));

function cycleBlock(rd: Current, s: AppState): string {
  const c = rd.cycle;
  const src = rd.source === 'live' ? 'live' : 'fixture';
  if (!c) {
    const why = rd.source === 'live' ? (rd.usable ? 'No refrigerant circulation (idle): states are unavailable.' : `Unavailable: ${escapeHtml(rd.live?.detail ?? 'engine not ready')}.`) : 'Off-state inventory is not modelled.';
    return block('Refrigerant states', `<p class="muted">— ${why}</p>`);
  }
  return block(`Refrigerant states (${src})`, rows([
    ['Low pressure', pressure(c.pLowBarA, s)],
    ['High pressure', pressure(c.pHighBarA, s)],
    ['Suction T / h', `${deg(c.suctionC)} · ${fmt(c.hSuctionKjKg, 1)} <i>kJ/kg</i>`],
    ['Discharge T / h', `${deg(c.dischargeC, 1)} · ${fmt(c.hDischargeKjKg, 1)} <i>kJ/kg</i>`],
    [rd.source === 'live' && rd.engine?.cycle?.mode === 'heating' ? 'Condenser outlet target T / h' : 'Condenser outlet T / h', `${deg(c.condOutC)} · ${fmt(c.hCondOutKjKg, 1)} <i>kJ/kg</i>`],
    ['EEV outlet T / mass quality', `${deg(c.expOutC)} · ${quality(c.expQuality)}`],
  ]));
}

/** Actual per-branch refrigerant endpoints from the generic cooling control/model; never the common suction state. */
function branchStatesBlock(inlet: RefrigerantState | undefined, outlet: RefrigerantState | undefined): string {
  const line = (st: RefrigerantState | undefined): Row[] => st
    ? [['T / h', `${deg(st.temperatureC)} · ${fmt(st.hJkg / 1000, 1)} <i>kJ/kg</i>`], ['Phase / mass quality', `${phaseLabel(st.phase === 'two-phase' ? 'two' : st.phase)} · ${quality(st.qualityMass)}`]]
    : [['T / h', '—'], ['Phase / mass quality', '—']];
  const labelled = (name: string, st: RefrigerantState | undefined): Row[] => line(st).map(([k, v]) => [`${name} ${k}`, v]);
  return block('Actual branch refrigerant inlet / outlet', rows([...labelled('Inlet', inlet), ...labelled('Outlet', outlet)]) +
    '<p class="muted">Per-branch engine states from the generic control/model; outlets may differ between branches before the returns mix.</p>');
}

/** Effective cleanliness with provenance. Live: drives air-side conductance and airflow. Examples: illustration only. */
function cleanRow(c: EffectiveCleanliness, live: boolean): Row {
  const effect = live ? 'drives live air-side UA and airflow' : 'illustration only; fixture readings unchanged';
  return ['Cleanliness', `${fmt(c.pct, 0)} <i>% clear</i> <span class="tag">${c.source}</span> <span class="tag">${effect}</span>`];
}

function selectedTitle(id: string | null, s: AppState): { title: string; kicker: string } {
  const cfg = s.cfg;
  if (!id) return { title: 'System overview', kicker: 'Nothing selected' };
  const [kind, idx] = id.split(':');
  const i = Number(idx ?? 0);
  const room = cfg.rooms[i];
  switch (kind) {
    case 'outdoor': return { title: cfg.outdoorKind === 'owner' ? 'Outdoor unit · Daikin 3MXM52N8' : 'Outdoor unit · generic compatible', kicker: 'Outdoor casing' };
    case 'compressor': return { title: 'Compressor', kicker: 'Fixed D discharge / S suction' };
    case 'reverser': return { title: 'Four-way reversing valve', kicker: 'Ports D · S · O · I' };
    case 'accumulator': return { title: 'Accumulator', kicker: 'Suction side' };
    case 'coil': return { title: 'Outdoor coil', kicker: 'Air-side heat exchanger' };
    case 'fan': return { title: 'Outdoor fan', kicker: 'Air side' };
    case 'eev': return { title: `Outdoor EEV ${i + 1}`, kicker: `Branch ${i + 1} · ${room?.name ?? ''}` };
    case 'service': return { title: 'Physical gas service port', kicker: 'Fitted on the gas stop valve' };
    case 'gasstop': return { title: 'Common gas stop valve', kicker: 'Legend p · static service isolation' };
    case 'liqstop': return { title: 'Common liquid stop valve', kicker: 'Legend q · static service isolation' };
    case 'indoor': return { title: room ? `${room.name} · ${room.indoorClass}` : 'Indoor unit', kicker: `Indoor unit ${i + 1}` };
    case 'pipe': return { title: `${room?.name ?? 'Branch'} line set`, kicker: `Branch ${i + 1} gas + liquid` };
    default: return { title: 'Component', kicker: '' };
  }
}

function body(id: string | null, s: AppState): string {
  const cfg = s.cfg;
  const rd = currentReadings(s);
  const live = rd.source === 'live';
  const ok = rd.usable;
  const src = live ? 'live engine' : 'fixture';
  const tag = live ? '<span class="tag">live</span>' : '<span class="tag">fixture</span>';
  const fm = readingFlowMode(rd);
  const pair = valvePairs(fm, cfg.mode);
  const act = activeRooms(cfg);
  const br = branchesFor(rd, act);
  const eng = rd.engine;
  const [kind, idx] = (id ?? '').split(':');
  const i = Number(idx ?? 0);
  const room = cfg.rooms[i];
  const pipe = cfg.pipes[i];
  const high = fm === 'heating';
  // Withheld live values show as unavailable, never as the adapter's zero defaults.
  const kwOf = (v: number | null): string => (ok ? kw(v) : '—');

  switch (kind) {
    case 'outdoor':
      return block('Casing', rows([
        ['Status', cfg.outdoorKind === 'owner' ? 'Catalogue family data; installed suffix unknown' : 'Illustrative generic envelope'],
        ['Ports', cfg.outdoorKind === 'owner' ? `${OWNER_PORTS} (${cfg.unitCount} connected)` : `${cfg.unitCount} (generic)`],
        ['Refrigerant', 'R32'],
        ['Air outlet (post-fan)', `${deg(rd.outdoorOutletC)} ${tag}`],
        ['Outdoor fan', kwOf(rd.outdoorFanKw)],
      ])) + cycleBlock(rd, s) + block('Provenance', '<p>Circuit inside the casing is a <b>generic explanatory layout</b>, not a Daikin internal layout. The exact N8 circuit schematic was not located; the 2019 N2-generation guide is family context only.</p>') + EDIT_EQUIPMENT;
    case 'compressor':
      return block('Fixed ports', '<p>D (discharge) and S (suction) never reverse; the reversing valve swaps only which coil they connect to.</p>') +
        block(`Readings (${src})`, rows([
          ['Discharge', `${deg(rd.cycle?.dischargeC)} · ${pressure(rd.cycle?.pHighBarA, s)}`],
          ['Suction', `${deg(rd.cycle?.suctionC)} · ${pressure(rd.cycle?.pLowBarA, s)}`],
          ['Mass flow', num(rd.mDotKgS, 3, 'kg/s')],
          ['Refrigerant work', kw(rd.pRefKw)],
          ['Drive loss', kw(rd.driveLossKw)],
          ...(live ? [['Speed', num(eng?.diagnostics.speedRps, 1, 'rps')] as Row] : []),
          ['ηis configured', `${cfg.etaIsPct} <i>%</i>${live || cfg.etaIsPct === 70 ? '' : ' <span class="tag warn">fixture uses 70 %</span>'}`],
          ...(live ? [['Displacement / max speed (generic)', `${fmt(cfg.live.compressorDisplacementCm3, 1)} <i>cm³/rev</i> · ${fmt(cfg.live.compressorMaxSpeedRps, 0)} <i>rps</i>`] as Row] : []),
        ]));
    case 'reverser':
      return block('Connections now', rows([
        ['Pairing', `${pair.a} and ${pair.b}`],
        ['State', fm === 'idle' ? 'Idle · position shown from the selected mode' : fm === 'heating' ? 'Heating' : fm === 'defrost' ? 'Defrost uses the cooling connections' : 'Cooling'],
        ['D', 'Compressor discharge (fixed)'],
        ['S', 'Compressor suction via accumulator (fixed)'],
        ['O', 'Outdoor coil gas header'],
        ['I', 'Indoor gas header / common gas node'],
      ])) + block('Schematic', '<p>A cycle reversing valve is a four-way device and is distinct from a three-way service valve.</p>');
    case 'accumulator':
      return block('Role', '<p>Protects the compressor from liquid carry-over on the suction line.</p>') +
        block(`Readings (${src})`, rows([['Inlet / outlet', rd.cycle ? `${deg(rd.cycle.suctionC)} vapor` : '—'], ['Pressure', pressure(rd.cycle?.pLowBarA, s)]]));
    case 'coil': {
      const role = fm === 'idle' ? 'Idle' : fm === 'heating' ? 'Evaporator' : 'Condenser';
      const roleRow: Row = ['Role now', role + (fm === 'defrost' ? ' (melting ice)' : '')];
      if (live) {
        const o = eng?.outdoor;
        return block('Outdoor coil (live engine)', rows([
          roleRow,
          cleanRow(outdoorCleanliness(cfg), true),
          ['Qevap / Qcond', fm === 'heating' ? kw(rd.qEvapKw) : kw(rd.qCondKw)],
          ['Metal temperature', deg(o?.metalTemperatureC)],
          ['Ice film', num(o?.iceKg, 3, 'kg')],
          ['Liquid film', num(o?.liquidKg, 3, 'kg')],
          ['Film temperature / thickness', o ? `${deg(o.temperatureC)} · ${fmt(o.thicknessM * 1000, 2)} <i>mm</i>` : '—'],
          ['Ice deposition', num(rd.frostRateKgH, 3, 'kg/h')],
          ['Liquid drainage', o ? num(o.drainageKgs * 3600, 3, 'kg/h') : '—'],
          ['Melt power', o ? kw(o.meltPowerW / 1000) : '—'],
          ['Air-side / refrigerant-side UA (generic)', `${fmt(cfg.live.outdoorAirConductanceWK, 0)} / ${fmt(cfg.live.outdoorRefrigerantConductanceWK, 0)} <i>W/K</i>`],
          ['Deposition area (generic)', `${fmt(cfg.live.depositionAreaM2, 1)} <i>m²</i> <span class="tag">not finned area</span>`],
        ])) + '<p class="muted">Film mass, drainage and melt come from the engine state; nothing is advanced in the interface.</p>' + EDIT_EQUIPMENT;
      }
      return block('Outdoor coil', rows([
        roleRow,
        cleanRow(outdoorCleanliness(cfg), false),
        ['Air-side finned surface', '— <i>m²</i> <span class="tag">not yet estimated</span>'],
        ['UA', '— <i>W/K</i> (separate quantity)'],
        ['Qevap / Qcond (fixture)', fm === 'heating' ? kw(rd.qEvapKw) : kw(rd.qCondKw)],
        ['Ice deposition', rd.frostRateKgH === null ? '—' : `${fmt(rd.frostRateKgH, 2)} <i>kg/h</i>`],
        ['Melt rate', rd.meltRateKgH === null ? '—' : `${fmt(rd.meltRateKgH, 2)} <i>kg/h</i>`],
        ['Scene ice now', `${fmt(store.clock.iceKg, 3)} <i>kg</i> <span class="tag">preview ledger</span>`],
        ['Retained liquid now', `${fmt(store.clock.retainedWaterKg, 3)} <i>kg</i> <span class="tag">preview ledger</span>`],
        ['Fixture example ice', cfg.example === 'defrost' && cfg.mode === 'heating' ? '0.10 <i>kg</i> <span class="tag">example, not scene</span>' : '—'],
      ])) + (fm === 'defrost' && store.clock.iceKg <= 0
        ? '<p class="muted">Ice exhausted: melt and drips stopped. Snapshot readings do not change; this is not a predicted defrost duration.</p>'
        : '<p class="muted">Illustrative ledger only: ice moves to retained liquid at the fixture melt rate. No drainage, refreezing or heat-transfer solver.</p>') + (fm === 'defrost' ? block('Defrost split (fixture)', rows([['Ice melt', kw(0.75)], ['Metal warming', kw(0.127049)], ['Ambient loss', kw(0.1)]])) : '') + EDIT_EQUIPMENT;
    }
    case 'fan':
      return block('Outdoor fan', rows([['State', rd.outdoorFanOn ? `Running (${src})` : ok ? 'Off' : '—'], ['Electrical', kwOf(rd.outdoorFanKw)], ['Post-fan air', deg(rd.outdoorOutletC)],
        ...(live ? [['Air mass flow (generic)', `${fmt(cfg.live.outdoorAirMassFlowKgs, 3)} <i>kg/s</i>`] as Row] : [])]));
    case 'eev': {
      const flow = live ? eng?.cycle?.branchMassFlowsKgs[i] ?? 0 : null;
      const open = live ? (flow ?? 0) > 0 : fm !== 'idle';
      const before = 'Liquid (high pressure)';
      const after = 'Two-phase (low pressure)';
      return block('Expansion valve', rows([
        ['Location', 'Outdoor casing, in the branch liquid line'],
        ['Flow direction', !open ? 'None' : high ? 'Field side → header side' : 'Header side → field side'],
        ['Upstream', !open ? '—' : high ? 'Field-side line: ' + before : 'Header-side line: ' + before],
        ['Downstream', !open ? '—' : high ? 'Header-side line: ' + after : 'Field-side line: ' + after],
        ...(live ? [['Branch refrigerant flow', ok ? num(flow, 4, 'kg/s') : '—'] as Row] : []),
        ['Opening', '— (no calibration map)'],
        ['Outlet T / quality', rd.cycle ? `${deg(rd.cycle.expOutC)} · ${quality(rd.cycle.expQuality)}` : '—'],
      ])) + '<p class="muted">Cooling: the small field line downstream of the outdoor EEV is two-phase. Heating: the small field return is high-pressure liquid.</p>';
    }
    case 'service':
      return block('Physical service port', rows([
        ['Node', 'Common gas node, fitted on the gas stop valve (fixed physical location)'],
        ['Role now', fm === 'idle' ? '— (idle)' : high ? 'HIGH side (discharge gas)' : 'LOW side (suction gas)'],
        [`Reading (${src})`, pressure(fm === 'idle' ? null : high ? rd.cycle?.pHighBarA : rd.cycle?.pLowBarA, s)],
        ['Convention', s.ui.pressure === 'abs' ? 'bar(a), absolute' : 'bar(g) = bar(a) − 1.01325 (local ambient assumed)'],
      ])) + '<p class="muted">The two extra dials near the compressor are <b>virtual</b> explanatory taps, not manufacturer ports.</p>';
    case 'gasstop':
    case 'liqstop': {
      const gas = kind === 'gasstop';
      const st = segmentFor(gas ? 'gasMan' : 'liqHdr', rd);
      return block(gas ? 'Gas stop valve' : 'Liquid stop valve', rows([
        ['Legend letter', gas ? 'p · gas stop valve' : 'q · liquid stop valve'],
        ['Location', gas ? 'Common gas node, before the branch gas stubs' : 'Common liquid header, between the outdoor coil and the branch EEVs'],
        ['Fitting', gas ? 'Physical gas service port is fitted on this node' : 'None drawn'],
        ['Position', 'Fully open · static, no active control'],
        ['Line now', `${phaseLabel(st.phase)}${st.tempC === null ? '' : ' · ' + deg(st.tempC)}`],
      ])) + '<p class="muted">Not an expansion valve (r, copper bodies with numbered badges) and not the four-way valve (k). Symbols follow the official N2-family manual legend (printed page 31); the exact N8 internal layout is unknown, so placement is generic and family-informed.</p>';
    }
    case 'indoor': {
      if (!room) return '';
      const info = INDOOR_CLASSES[room.indoorClass];
      const r = br[i];
      const er = eng?.rooms[i];
      const branchCirculating = ok && (eng?.cycle?.branchMassFlowsKgs[i] ?? 0) > 0;
      const fl = (st: string) => segmentFor(`${st}:${i}`, rd);
      const heatKw = live ? rd.branchKw?.[i] ?? null : r?.roomKw ?? null;
      const readingRows: Row[] = [
        [cfg.mode === 'heating' ? 'Branch room heat' : 'Branch room cooling', kw(heatKw)],
        ['Supply-air temperature', !ok ? '—' : rd.indoorFansOn || (live && (r?.fanKw ?? 0) > 0) ? deg(r?.outletC ?? null) : '— (fan off)'],
        ['Indoor fan', kwOf(r?.fanKw ?? null)],
      ];
      if (live) {
        readingRows.push(
          ['Room air T / RH', er ? `${deg(er.temperatureC)} · ${fmt(er.relativeHumidity * 100, 0)} <i>% RH</i>` : '—'],
          ['Humidity ratio', er ? num(er.humidityRatio * 1000, 2, 'g/kg') : '—'],
          ['Indoor metal / room fabric T', er ? `${deg(er.metalTemperatureC)} · ${deg(er.fabricTemperatureC)}` : '—'],
          ['Condensate', er ? num(er.condensateKgs * 3.6e6, 1, 'g/h') : '—'],
          ['Branch refrigerant flow', ok ? num(eng?.cycle?.branchMassFlowsKgs[i] ?? null, 4, 'kg/s') : '—'],
        );
      } else {
        readingRows.push(['Allocation', r?.fromFixture ? 'Fixture 25/35/25 split' : 'Illustrative share of fixture totals']);
      }
      // Requested On/Off versus the actual branch. Examples keep the fixed snapshot flow: the request is not applied to it.
      const flowNow = eng?.cycle?.branchMassFlowsKgs[i] ?? 0;
      const operation = room.enabled
        ? 'On'
        : !live ? 'Off requested <span class="tag warn">snapshot not recalculated</span>'
          : !ok ? 'Off requested <span class="tag">applying</span>'
            : flowNow > 0 || (r?.fanKw ?? 0) > 0 ? 'Off requested <span class="tag warn">branch still open</span>'
              : 'Off <span class="tag">branch closed</span>';
      return block('Indoor unit', rows([
        ['Model', `${info.label}`],
        ['Operation (requested)', operation],
        ['Nominal class', `${fmt(info.nominalKw, 1)} <i>kW</i> (not drawn larger${live ? '; no effect on live performance' : ''})`],
        cleanRow(indoorCleanliness(cfg, i), live),
        // Live endpoint phases come from the actual branch states in the block below.
        ...(live ? [] : [['Coil gas end', phaseLabel(fl('inG').phase)] as Row, ['Coil liquid end', phaseLabel(fl('inL').phase)] as Row]),
      ])) + block(`Readings (${src})`, rows(readingRows)) + (live ? branchStatesBlock(branchCirculating ? eng?.cycle?.branchInlets[i] : undefined, branchCirculating ? eng?.cycle?.branchOutlets[i] : undefined) : '') + block('Room inputs (configuration)', rows([
        [live ? 'Initial air temperature (on Reset)' : 'Air temperature', deg(room.airC)], ['Setpoint', deg(room.setpointC)], ['Volume', `${room.volumeM3} <i>m³</i>`], ['Heat-loss coefficient', `${room.heatLossWPerK} <i>W/K</i>`],
      ])) + `<button type="button" class="btn small" data-action="tab" data-tab="rooms">Edit room inputs</button>`;
    }
    case 'pipe': {
      if (!pipe || !room) return '';
      const g = segmentFor(`gasField:${i}`, rd);
      const l = segmentFor(`liqField:${i}`, rd);
      return block('Line set (configuration)', rows([
        ['One-way length', `${fmt(pipe.lengthM, 1)} <i>m</i> <span class="tag">${pipe.lengthSource === 'owner-reported' ? 'owner-reported, historical' : pipe.lengthSource}</span>`],
        ['Gas OD', `${pipe.gasOdMm} <i>mm</i>`],
        ['Liquid OD', `${pipe.liquidOdMm} <i>mm</i>`],
        ['Drawn route', 'Schematic; not proportional to length'],
        ...(live ? [['Engine field lines', cfg.live.fieldLines === 'idealized' ? 'Idealized · zero-length lines; length and diameter illustrate only, pipe effects excluded' : 'Physical · distributed homogeneous model, assumed bore and outdoor-air exposure'] as Row] : []),
      ])) + block('State now', rows([
        ['Gas line', `${phaseLabel(g.phase)}${g.tempC === null ? '' : ' · ' + deg(g.tempC)}`],
        ['Liquid-side line', `${phaseLabel(l.phase)}${l.tempC === null ? '' : ' · ' + deg(l.tempC)}`],
      ])) + `<button type="button" class="btn small" data-action="tab" data-tab="pipes">Edit pipes</button>`;
    }
    default: {
      const copLabel = rd.copLabel.startsWith('Cool') ? 'Cooling COP' : 'Heating COP';
      return block(live ? 'Live engine' : 'Current example', rows([
        live ? ['Operating state', escapeHtml(rd.live?.label ?? '—')] : ['Fixture', escapeHtml(rd.title)],
        [rd.roomKwLabel, kw(rd.roomKwTotal)],
        ['Electrical input', rd.electricalKw === null ? '—' : kw(rd.electricalKw)],
        [rd.cop === null && live && eng?.state === 'defrost' ? 'COP' : copLabel, rd.cop === null ? '—' : fmt(rd.cop, 2)],
      ])) + cycleBlock(rd, s) +
        block('Select a component', '<p>Click or Tab to any equipment, valve, EEV, tube set or room. Press Enter or Space to select; Esc clears.</p>');
    }
  }
}

export interface Inspector {
  root: HTMLElement;
  sync(s: AppState): void;
}

export function createInspector(onTab: (t: 'rooms' | 'equipment' | 'pipes') => void, onFocus: (id: string) => void): Inspector {
  const head = html('header', { class: 'ins-head' });
  const content = html('div', { class: 'ins-body' });
  const foot = html('footer', { class: 'ins-foot' }, PREVIEW_BANNER);
  const root = html('aside', { class: 'inspector', 'aria-label': 'Inspector', 'aria-live': 'polite' }, head, content, foot);
  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!t) return;
    if (t.dataset.action === 'tab' && (t.dataset.tab === 'rooms' || t.dataset.tab === 'equipment' || t.dataset.tab === 'pipes')) onTab(t.dataset.tab);
    if (t.dataset.action === 'focus' && t.dataset.id) onFocus(t.dataset.id);
  });
  return {
    root,
    sync(s: AppState): void {
      const id = s.ui.selected;
      const t = selectedTitle(id, s);
      setHtml(head, `<span class="kicker">${escapeHtml(t.kicker)}</span><h2>${escapeHtml(t.title)}</h2>`);
      setHtml(content, body(id, s));
      setText(foot, s.ui.experience === 'live' ? LIVE_BASIS : PREVIEW_BANNER);
    },
  };
}
