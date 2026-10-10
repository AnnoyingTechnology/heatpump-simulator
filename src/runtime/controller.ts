import type { EngineConfig, EngineOutput } from '../engine/types.ts';
import type { Request, Response, RuntimeStatus } from './protocol.ts';

/** One calculation in flight. A changed input invalidates old readings immediately. */
export class SimulationRuntime {
  private worker: Worker | null = null;
  private revision = 0;
  private busy = false;
  private initialized = false;
  private pendingConfig: EngineConfig | null = null;
  private listeners = new Set<() => void>();
  status: RuntimeStatus = { state: 'loading', output: null, error: null, calculationMs: 0 };
  /** Accepted stored inventory survives a rejected input; it never supplies active cycle readings. */
  inventory: { outdoor: EngineOutput['outdoor']; simulatedSeconds: number } | null = null;

  subscribe(listener: () => void): void { this.listeners.add(listener); }
  private notify(): void { for (const listener of this.listeners) listener(); }

  start(config: EngineConfig): void {
    this.stop();
    this.revision++;
    this.initialized = false;
    this.inventory = null;
    this.status = { state: 'loading', output: null, error: null, calculationMs: 0 };
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<Response>) => {
      this.busy = false;
      const response = event.data;
      if (response.kind === 'output') {
        this.initialized = true;
        this.inventory = { outdoor: response.output.outdoor, simulatedSeconds: response.output.simulatedSeconds };
      }
      if (response.revision === this.revision) {
        this.status = response.kind === 'output'
          ? { state: 'ready', output: response.output, error: null, calculationMs: response.calculationMs }
          : { state: 'error', output: null, error: response.message, calculationMs: 0 };
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
    this.status = { ...this.status, state: 'loading', output: null, error: null };
    if (this.busy) this.pendingConfig = config;
    else this.post({ kind: 'configure', revision: this.revision, config });
    this.notify();
  }

  /** The caller requests bounded physical increments; CPU overload slows the displayed simulation clock. */
  step(seconds: number): boolean {
    if (this.busy || !this.worker || this.status.state !== 'ready' || this.status.output?.state === 'fault' || !Number.isFinite(seconds) || seconds <= 0) return false;
    this.post({ kind: 'step', revision: this.revision, seconds });
    return true;
  }

  private post(request: Request): void { this.busy = true; this.worker!.postMessage(request); }
  stop(): void { this.worker?.terminate(); this.worker = null; this.busy = false; this.pendingConfig = null; }
}
