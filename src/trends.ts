export type TrendValues = readonly [number | null, number | null, number | null];
interface Sample { seconds: number; values: TrendValues; series: string }

/** Accepted physical time only. One latest reading per ten-second bin bounds the two-hour history. */
export class TrendHistory {
  readonly windowSeconds = 7200;
  readonly sampleSeconds = 10;
  private samples: Sample[] = [];
  private latest = -Infinity;
  get latestSeconds(): number | null { return Number.isFinite(this.latest) ? this.latest : null; }

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

  /** Shared bounds for related traces; temperatures use includeZero=false and an honest minimum span. */
  extent(indices: readonly (0 | 1 | 2)[], minimumSpan = 1, includeZero = true): { minimum: number; maximum: number } {
    if (!(Number.isFinite(minimumSpan) && minimumSpan > 0)) throw new RangeError('Trend scale span must be positive and finite');
    const values = this.samples.flatMap(s => indices.map(i => s.values[i])).filter((v): v is number => v !== null);
    if (!values.length) return { minimum: 0, maximum: minimumSpan };
    if (includeZero) {
      const minimum = Math.min(0, ...values);
      return { minimum, maximum: Math.max(minimumSpan, ...values) };
    }
    const low = Math.min(...values), high = Math.max(...values);
    const padding = Math.max(.1, (minimumSpan - (high - low)) / 2);
    return { minimum: low - padding, maximum: high + padding };
  }

  plot(index: 0 | 1 | 2, minimumSpan = 1, bounds?: { minimum: number; maximum: number }, step = false): { path: string; minimum: number; maximum: number; count: number } {
    const { minimum, maximum } = bounds ?? this.extent([index], minimumSpan);
    if (!(Number.isFinite(minimum) && Number.isFinite(maximum) && maximum > minimum)) throw new RangeError('Trend bounds must be finite and ordered');
    const values = this.samples.map(s => s.values[index]).filter((v): v is number => v !== null);
    let path = '', previous: Sample | null = null;
    for (const sample of this.samples) {
      const value = sample.values[index];
      if (value === null) { previous = null; continue; }
      const x = 1 + 110 * (sample.seconds - (this.latest - this.windowSeconds)) / this.windowSeconds;
      const y = 32 - 28 * (value - minimum) / (maximum - minimum);
      // A missing bin or different operating mode has no fabricated connecting segment.
      const connected = previous && previous.series === sample.series && sample.seconds - previous.seconds <= 2 * this.sampleSeconds;
      const position = `${x.toFixed(2)} ${y.toFixed(2)}`;
      if (connected && step) path += `H${x.toFixed(2)}V${y.toFixed(2)}`;
      else path += `${connected ? 'L' : 'M'}${position}`;
      if (!connected) path += `L${position}`; // a round-capped point also shows very short histories
      previous = sample;
    }
    return { path, minimum, maximum, count: values.length };
  }
}
