import type { EngineConfig, EngineOutput } from '../engine/types.ts';
import type { Request, Response, RuntimeStatus } from './protocol.ts';

/** One calculation in flight. Compatible control edits retain an explicitly labelled completed snapshot. */
export class SimulationRuntime {
  private worker: Worker | null = null;
  private revision = 0;
  private busy = false;
  private initialized = false;
  private pendingConfig: EngineConfig | null = null;
  private submittedConfig: EngineConfig | null = null;
  private requestKind: Request['kind'] | null = null;
  private retainSnapshot = false;
  private acceptedOutput: EngineOutput | null = null;
  private initialConfig: EngineConfig | null = null;
  private recentRequests: Array<{ kind: Request['kind']; revision: number; atAcceptedSeconds: number; config?: EngineConfig; seconds?: number }> = [];
  private failureDetails: Record<string, unknown> | null = null;
  private workerFailed = false;
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
    this.acceptedOutput = null;
    this.initialConfig = structuredClone(config);
    this.recentRequests = [];
    this.failureDetails = null;
    this.workerFailed = false;
    this.inventory = null;
    this.status = { state: 'loading', output: null, error: null, calculationMs: 0 };
    const worker = this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<Response>) => {
      if (this.worker !== worker) return;
      this.busy = false;
      const finishedKind = this.requestKind;
      const response = event.data;
      if (response.kind === 'output') {
        this.initialized = true;
        this.acceptedOutput = response.output;
        this.inventory = { outdoor: response.output.outdoor, simulatedSeconds: response.output.simulatedSeconds };
        this.failureDetails = response.output.state === 'fault'
          ? { category: 'engine-fault', message: response.output.diagnostics.fault, requestKind: finishedKind } : null;
      } else {
        if (response.acceptedOutput) {
          this.acceptedOutput = response.acceptedOutput;
          this.inventory = { outdoor: response.acceptedOutput.outdoor, simulatedSeconds: response.acceptedOutput.simulatedSeconds };
        }
        this.failureDetails = { category: 'request-error', message: response.message, ...response.details, requestKind: finishedKind };
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
            : { state: 'error', output: this.acceptedOutput, error: response.message, calculationMs: 0 };
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
      if (this.worker !== worker) return;
      event.preventDefault();
      this.busy = false;
      this.pendingConfig = null;
      this.initialized = false;
      this.retainSnapshot = false;
      this.workerFailed = true;
      worker.terminate();
      const message = event.message || 'Worker terminated without an error message';
      this.failureDetails = { category: 'worker-error', message, filename: event.filename,
        line: event.lineno, column: event.colno, name: event.error?.name, stack: event.error?.stack,
        requestKind: this.requestKind };
      this.status = { state: 'error', output: this.acceptedOutput,
        error: `${message}. Last accepted state is retained; use Reset to restart the worker.`, calculationMs: 0 };
      this.notify();
    };
    const propertyModuleUrl = new URL(`${import.meta.env.BASE_URL}vendor/coolprop-safe/adapter.js`, document.baseURI).href;
    this.post({ kind: 'initialize', revision: this.revision, config, propertyModuleUrl });
    this.notify();
  }

  configure(config: EngineConfig): void {
    // A different EOS starts a fresh circuit with the supplied house settings.
    if (this.submittedConfig && config.fluid !== this.submittedConfig.fluid) { this.start(config); return; }
    // A dead worker cannot resume its physical stores. A settings edit must never silently create a new run.
    if (this.workerFailed && this.acceptedOutput) {
      this.submittedConfig = structuredClone(config);
      this.notify();
      return;
    }
    if (!this.worker || (!this.initialized && this.status.state === 'error')) { this.start(config); return; }
    this.revision++;
    this.retainSnapshot = !!this.status.output && this.status.state !== 'error'
      && this.status.output.state !== 'fault' && compatibleControlsOnly(this.submittedConfig, config);
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

  private post(request: Request): void {
    this.recentRequests.push({ kind: request.kind, revision: request.revision,
      atAcceptedSeconds: this.acceptedOutput?.simulatedSeconds ?? 0,
      ...('config' in request ? { config: structuredClone(request.config) } : { seconds: request.seconds }) });
    if (this.recentRequests.length > 24) this.recentRequests.shift();
    this.busy = true;
    this.requestKind = request.kind;
    this.worker!.postMessage(request);
  }
  /** Local diagnostic artifact: accepted stores and bounded input history, without uploading anything. */
  diagnosticReport(): Record<string, unknown> {
    return structuredClone({ format: 'heatpump-diagnostic-v1', createdAt: new Date().toISOString(),
      applicationAsset: document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src,
      runtimeAsset: import.meta.url, browser: navigator.userAgent,
      status: this.status.state, error: this.status.error ?? this.acceptedOutput?.diagnostics.fault,
      failure: this.failureDetails, initialConfig: this.initialConfig, requestedConfig: this.submittedConfig,
      acceptedOutput: this.acceptedOutput, recentRequests: this.recentRequests });
  }
  stop(): void { this.worker?.terminate(); this.worker = null; this.busy = false; this.pendingConfig = null; }
}

/** Weather, room boundary gains/losses/links, targets and On/Off requests preserve room/circuit identities and stored state.
 * A held snapshot describes actual previous flow, not the newly requested switch state. Structural or model
 * changes still invalidate it; configure acknowledgements never masquerade as completed physical steps. */
function compatibleControlsOnly(previous: EngineConfig | null, next: EngineConfig): boolean {
  if (!previous) return false;
  const basis = (config: EngineConfig): EngineConfig => ({ ...config,
    outdoorTemperatureC: 0, outdoorRelativeHumidity: 0, interzoneLinks: [],
    rooms: config.rooms.map(room => ({ ...room, setpointC: 0, enabled: false,
      envelopeWK: 0, ventilationACH: 0, internalGainW: 0 })),
  });
  return JSON.stringify(basis(previous)) === JSON.stringify(basis(next));
}
