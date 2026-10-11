export type TrendValues = readonly [number | null, number | null, number | null];
interface Sample { seconds: number; values: TrendValues; series: string }

/** Accepted physical time only. One latest reading per ten-second bin bounds the two-hour history. */
export class TrendHistory {
  readonly windowSeconds = 7200;
  readonly sampleSeconds = 10;
  private samples: Sample[] = [];
  private latest = -Infinity;

  clear(): void { this.samples = []; this.latest = -Infinity; }

  accept(seconds: number, values: TrendValues, series: string): boolean {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds <= this.latest) return false;
    this.latest = seconds;
    const clean = (v: number | null): number | null => v !== null && Number.isFinite(v) ? v : null;
    const sample: Sample = { seconds, values: [clean(values[0]), clean(values[1]), clean(values[2])], series };
    const last = this.samples.at(-1);
    if (last && Math.floor(last.seconds / this.sampleSeconds) === Math.floor(seconds / this.sampleSeconds)) {
      this.samples[this.samples.length - 1] = sample;
    } else this.samples.push(sample);
    this.samples = this.samples.filter(s => s.seconds >= seconds - this.windowSeconds);
    return true;
  }

  plot(index: 0 | 1 | 2): { path: string; minimum: number; maximum: number; count: number } {
    const values = this.samples.map(s => s.values[index]).filter((v): v is number => v !== null);
    const minimum = Math.min(0, ...values), maximum = Math.max(1, ...values);
    let path = '', previous: Sample | null = null;
    for (const sample of this.samples) {
      const value = sample.values[index];
      if (value === null) { previous = null; continue; }
      const x = 1 + 110 * (sample.seconds - (this.latest - this.windowSeconds)) / this.windowSeconds;
      const y = 32 - 28 * (value - minimum) / (maximum - minimum);
      // A missing bin or different operating mode has no fabricated connecting segment.
      const connected = previous && previous.series === sample.series && sample.seconds - previous.seconds <= 2 * this.sampleSeconds;
      const position = `${x.toFixed(2)} ${y.toFixed(2)}`;
      path += `${connected ? 'L' : 'M'}${position}`;
      if (!connected) path += `L${position}`; // a round-capped point also shows very short histories
      previous = sample;
    }
    return { path, minimum, maximum, count: values.length };
  }
}
