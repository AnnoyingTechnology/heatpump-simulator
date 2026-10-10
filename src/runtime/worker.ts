import { HeatPumpEngine, loadPropertyService } from '../engine/index.ts';
import type { Request, Response } from './protocol.ts';

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: Response): void;
};
let engine: HeatPumpEngine | null = null;
let queue = Promise.resolve();

workerScope.onmessage = (event): void => {
  const request = event.data;
  // Serialized also during asynchronous WebAssembly initialization.
  queue = queue.then(async () => {
    const started = performance.now();
    try {
      if (request.kind === 'initialize') {
        engine = new HeatPumpEngine(await loadPropertyService(request.propertyModuleUrl), request.config);
      } else {
        if (!engine) throw new Error('Property backend has not initialized');
        if (request.kind === 'configure') engine.updateConfig(request.config);
        else engine.step(request.seconds);
      }
      workerScope.postMessage({ kind: 'output', revision: request.revision, output: engine!.snapshot(), calculationMs: performance.now() - started });
    } catch (error) {
      workerScope.postMessage({ kind: 'error', revision: request.revision, message: error instanceof Error ? error.message : String(error) });
    }
  });
};
