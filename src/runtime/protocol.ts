import type { EngineConfig, EngineOutput } from '../engine/types.ts';

export type Request =
  | { kind: 'initialize'; revision: number; config: EngineConfig; propertyModuleUrl: string }
  | { kind: 'configure'; revision: number; config: EngineConfig }
  | { kind: 'step'; revision: number; seconds: number };

export type Response =
  | { kind: 'output'; revision: number; output: EngineOutput; calculationMs: number }
  | { kind: 'error'; revision: number; message: string; details?: { name: string; stack?: string }; acceptedOutput?: EngineOutput };

export interface RuntimeStatus {
  state: 'loading' | 'updating' | 'ready' | 'error';
  output: EngineOutput | null;
  error: string | null;
  calculationMs: number;
}
