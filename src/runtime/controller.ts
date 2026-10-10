import type { EngineConfig, EngineOutput } from '../engine/types.ts';
import type { Request, Response, RuntimeStatus } from './protocol.ts';

/** One calculation in flight. Soft inputs retain an explicitly labelled completed snapshot. */
export class SimulationRuntime {
  private worker: Worker | null = null;
  private revision = 0;
  private busy = false;
  private initialized = false;
  private pendingConfig: EngineConfig | null = null;
  private submittedConfig: EngineConfig | null = null;
  private requestKind: Request['kind'] | null = null;
  private retainSnapshot = false;
  private listeners = new Set<() => void>();
  status: RuntimeStatus = { state: 'loading', output: null, error: null, calculationMs: 0 };
  /** Accepted stored inventory survives a rejected input; it never supplies active cycle readings. */
  inventory: { outdoor: EngineOutput['outdoor']; simulatedSeconds: number } | null = null;
  get isBusy(): boolean { return this.busy; }

  subscribe(listener: () => void): void { this.listeners.add(listener); }
  private notify(): void { for (const listener of this.listeners) listener(); }

  start(config: EngineConfig): void {
    this.stop();
    this.revision++;
    this.initialized = false;
    this.submittedConfig = structuredClone(config);
    this.retainSnapshot = false;
    this.inventory = null;
    this.status = { state: 'loading', output: null, error: null, calculationMs: 0 };
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<Response>) => {
      this.busy = false;
      const finishedKind = this.requestKind;
      const response = event.data;
      if (response.kind === 'output') {
        this.initialized = true;
        this.inventory = { outdoor: response.output.outdoor, simulatedSeconds: response.output.simulatedSeconds };
      }
      if (response.revision === this.revision) {
        if (response.kind === 'output' && response.output.state !== 'fault' && finishedKind === 'configure' && this.retainSnapshot && this.status.output) {
          // updateConfig returns passive/no-cycle fluxes; keep the previous completed
          // physical step until another step solves the new inputs, including when paused.
          this.status = { ...this.status, state: 'updating', error: null };
        } else {
          this.retainSnapshot = false;
          this.status = response.kind === 'output'
            ? { state: 'ready', output: response.output, error: null, calculationMs: response.calculationMs }
            : { state: 'error', output: null, error: response.message, calculationMs: 0 };
        }
        this.notify();
      } else if (this.retainSnapshot && (response.kind === 'error' || response.output.state === 'fault')) {
        // A failed pre-edit calculation cannot remain visible as a good retained
        // snapshot. A queued configuration may recover, but must produce fresh data.
        this.retainSnapshot = false;
        this.status = { ...this.status, state: 'loading', output: null, error: null };
        this.notify();
      } else if (response.kind === 'output' && finishedKind === 'step' && this.retainSnapshot) {
        // A pre-edit step may finish while newer soft inputs are queued. Its actual
        // completed state is still a valid previous-step snapshot, never new-input data.
        this.status = { ...this.status, output: response.output, calculationMs: response.calculationMs };
        this.notify();
      }
      if (this.pendingConfig) {
        const next = this.pendingConfig;
        this.pendingConfig = null;
        this.post({ kind: 'configure', revision: this.revision, config: next });
      }
    };
    this.worker.onerror = (event) => {
      this.busy = false;
      this.pendingConfig = null;
      this.initialized = false;
      this.retainSnapshot = false;
      this.status = { state: 'error', output: null, error: event.message || 'Simulation worker failed', calculationMs: 0 };
      this.notify();
    };
    const propertyModuleUrl = new URL(`${import.meta.env.BASE_URL}vendor/coolprop/coolprop.js`, document.baseURI).href;
    this.post({ kind: 'initialize', revision: this.revision, config, propertyModuleUrl });
    this.notify();
  }

  configure(config: EngineConfig): void {
    if (!this.worker || (!this.initialized && this.status.state === 'error')) { this.start(config); return; }
    this.revision++;
    this.retainSnapshot = !!this.status.output && this.status.state !== 'error'
      && this.status.output.state !== 'fault' && softInputsOnly(this.submittedConfig, config);
    this.submittedConfig = structuredClone(config);
    this.status = { ...this.status, state: this.retainSnapshot ? 'updating' : 'loading',
      output: this.retainSnapshot ? this.status.output : null, error: null };
    if (this.busy) this.pendingConfig = config;
    else this.post({ kind: 'configure', revision: this.revision, config });
    this.notify();
  }

  /** The caller requests bounded physical increments; CPU overload slows the displayed simulation clock. */
  step(seconds: number): boolean {
    if (this.busy || !this.worker || (this.status.state !== 'ready' && this.status.state !== 'updating') || this.status.output?.state === 'fault' || !Number.isFinite(seconds) || seconds <= 0) return false;
    this.post({ kind: 'step', revision: this.revision, seconds });
    return true;
  }

  private post(request: Request): void { this.busy = true; this.requestKind = request.kind; this.worker!.postMessage(request); }
  stop(): void { this.worker?.terminate(); this.worker = null; this.busy = false; this.pendingConfig = null; }
}

/** Only target/weather edits have compatible previously calculated branch/circuit snapshots. */
function softInputsOnly(previous: EngineConfig | null, next: EngineConfig): boolean {
  if (!previous) return false;
  const basis = (config: EngineConfig): EngineConfig => ({ ...config,
    outdoorTemperatureC: 0, outdoorRelativeHumidity: 0,
    rooms: config.rooms.map(room => ({ ...room, setpointC: 0 })),
  });
  return JSON.stringify(basis(previous)) === JSON.stringify(basis(next));
}
