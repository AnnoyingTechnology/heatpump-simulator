/** Wall-time pacing changes how many fixed physical steps are requested, never their size.
 * At most one second of requested time is retained: a busy CPU never creates a catch-up queue. */
export class SimulationPacer {
  private lastWall: number | null = null;
  private lastClock: number | null = null;
  private speed = 1;
  private paused = true;
  private budget = 0;
  private msPerStep = 100;
  private samples: { wall: number; clock: number }[] = [];
  readonly stepSeconds = .25;

  update(now: number, clock: number | null, speed: number, paused: boolean, calculationMs: number): void {
    const elapsed = this.lastWall === null ? 0 : Math.min(.25, Math.max(0,(now-this.lastWall)/1000));
    const reset = clock === null || this.lastClock === null || clock < this.lastClock;
    const changed = speed !== this.speed || paused !== this.paused;
    if (reset || changed) { this.budget = 0; this.samples = []; }
    if (reset) this.msPerStep = 100;
    else if (clock > this.lastClock! && calculationMs > 0)
      this.msPerStep = calculationMs * this.stepSeconds / (clock-this.lastClock!);
    this.lastWall = now; this.lastClock = clock; this.speed = speed; this.paused = paused;
    if (!paused && clock !== null) {
      if (!reset && !changed) this.budget = Math.min(1,this.budget + elapsed*speed);
      this.samples.push({wall:now,clock});
      // Retain one sample preceding the two-second window.
      while (this.samples.length > 2 && this.samples[1].wall < now-2000) this.samples.shift();
    }
  }

  nextBatch(): number {
    const available = Math.floor((this.budget+1e-10)/this.stepSeconds);
    // Aim for ~100 ms tasks, with a hard cap of four unchanged physical steps.
    const capacity = Math.max(1,Math.min(4,Math.floor(100/this.msPerStep)));
    return Math.min(available,capacity)*this.stepSeconds;
  }
  submitted(seconds: number): void { this.budget = Math.max(0,this.budget-seconds); }
  get achievedSpeed(): number | null {
    if (this.paused) return 0;
    const first = this.samples[0], last = this.samples.at(-1);
    if (!first || !last || last.wall-first.wall < 1000) return null;
    return (last.clock-first.clock)/((last.wall-first.wall)/1000);
  }
}
