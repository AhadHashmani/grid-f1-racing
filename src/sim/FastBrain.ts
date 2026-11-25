import { CrashBook } from "./CrashMemory";

/** Compact continuous-output network for fast neuroevolution. */

export class FastBrain {
  w1: Float32Array;
  b1: Float32Array;
  w2: Float32Array;
  b2: Float32Array;
  readonly inSize: number;
  readonly hidden: number;
  readonly outSize: number;
  /** Lessons from crashes — inherited by clones / children. */
  crashBook = new CrashBook();
  private hiddenActs: Float32Array;

  constructor(inSize = 14, hidden = 16, outSize = 3) {
    this.inSize = inSize;
    this.hidden = hidden;
    this.outSize = outSize;
    this.w1 = new Float32Array(inSize * hidden);
    this.b1 = new Float32Array(hidden);
    this.w2 = new Float32Array(hidden * outSize);
    this.b2 = new Float32Array(outSize);
    this.hiddenActs = new Float32Array(hidden);
    this.randomize(1);
  }

  randomize(scale = 1) {
    for (let i = 0; i < this.w1.length; i++) this.w1[i] = (Math.random() * 2 - 1) * scale;
    for (let i = 0; i < this.b1.length; i++) this.b1[i] = (Math.random() * 2 - 1) * scale;
    for (let i = 0; i < this.w2.length; i++) this.w2[i] = (Math.random() * 2 - 1) * scale;
    for (let i = 0; i < this.b2.length; i++) this.b2[i] = (Math.random() * 2 - 1) * scale;
  }

  /** outputs: [throttle 0..1, steer -1..1, brake 0..1] */
  think(input: ArrayLike<number>, out: Float32Array = new Float32Array(this.outSize)): Float32Array {
    const h = this.hidden;
    for (let j = 0; j < h; j++) {
      let sum = this.b1[j];
      for (let i = 0; i < this.inSize; i++) sum += (input[i] ?? 0) * this.w1[i * h + j];
      this.hiddenActs[j] = Math.tanh(sum);
    }
    for (let k = 0; k < this.outSize; k++) {
      let sum = this.b2[k];
      for (let j = 0; j < h; j++) sum += this.hiddenActs[j] * this.w2[j * this.outSize + k];
      out[k] = Math.tanh(sum);
    }
    out[0] = (out[0] + 1) * 0.5;
    out[2] = (out[2] + 1) * 0.5;
    return out;
  }

  /**
   * After a crash: store the lesson and nudge weights so the same sensor
   * pattern produces the corrective steer / brake instead.
   */
  learnFromCrash(
    input: ArrayLike<number>,
    badSteer: number,
    progress: number,
    lateral: number,
  ) {
    const front = input[5] ?? 0.5;
    const lesson = this.crashBook.remember(progress, lateral, front, badSteer);
    this.imitate(input, 0.25, lesson.steer, lesson.brake, 0.04);
  }

  /**
   * Supervised nudge toward target continuous controls.
   * throttle/brake in [0,1], steer in [-1,1].
   * One-step backprop through tanh so distillation actually sticks.
   */
  imitate(
    input: ArrayLike<number>,
    wantThrottle: number,
    wantSteer: number,
    wantBrake: number,
    lr = 0.06,
  ) {
    const h = this.hidden;
    for (let j = 0; j < h; j++) {
      let sum = this.b1[j];
      for (let i = 0; i < this.inSize; i++) sum += (input[i] ?? 0) * this.w1[i * h + j];
      this.hiddenActs[j] = Math.tanh(sum);
    }

    const targets = [wantThrottle * 2 - 1, wantSteer, wantBrake * 2 - 1];
    const dH = new Float32Array(h);

    for (let k = 0; k < 3; k++) {
      let sum = this.b2[k];
      for (let j = 0; j < h; j++) sum += this.hiddenActs[j] * this.w2[j * 3 + k];
      const y = Math.tanh(sum);
      const err = targets[k] - y;
      const dOut = err * (1 - y * y);
      for (let j = 0; j < h; j++) {
        dH[j] += dOut * this.w2[j * 3 + k];
      }
      this.b2[k] += lr * dOut;
      for (let j = 0; j < h; j++) {
        this.w2[j * 3 + k] += lr * dOut * this.hiddenActs[j];
      }
    }

    for (let j = 0; j < h; j++) {
      const a = this.hiddenActs[j];
      const d = dH[j] * (1 - a * a);
      this.b1[j] += lr * 0.35 * d;
      for (let i = 0; i < this.inSize; i++) {
        const x = input[i] ?? 0;
        if (Math.abs(x) < 0.02) continue;
        this.w1[i * h + j] += lr * 0.35 * d * x;
      }
    }
  }

  clone(): FastBrain {
    const c = new FastBrain(this.inSize, this.hidden, this.outSize);
    c.w1.set(this.w1);
    c.b1.set(this.b1);
    c.w2.set(this.w2);
    c.b2.set(this.b2);
    c.crashBook = this.crashBook.clone();
    return c;
  }

  mutate(amount: number) {
    const bump = (arr: Float32Array) => {
      for (let i = 0; i < arr.length; i++) {
        if (Math.random() < 0.4) {
          arr[i] += (Math.random() * 2 - 1) * amount;
          if (arr[i] > 2) arr[i] = 2;
          if (arr[i] < -2) arr[i] = -2;
        }
      }
    };
    bump(this.w1);
    bump(this.b1);
    bump(this.w2);
    bump(this.b2);
  }

  static crossover(a: FastBrain, b: FastBrain): FastBrain {
    const c = a.clone();
    const mix = (dst: Float32Array, src: Float32Array) => {
      for (let i = 0; i < dst.length; i++) {
        if (Math.random() < 0.5) dst[i] = src[i];
      }
    };
    mix(c.w1, b.w1);
    mix(c.b1, b.b1);
    mix(c.w2, b.w2);
    mix(c.b2, b.b2);
    // Children inherit crash lessons from both parents
    c.crashBook = a.crashBook.clone();
    c.crashBook.merge(b.crashBook);
    return c;
  }

  /**
   * Strong prior: throttle on, steer from left/right ray imbalance + lateral error,
   * brake when the forward ray is short.
   */
  static centerlineSeed(inSize = 14): FastBrain {
    const b = new FastBrain(inSize, 16, 3);
    b.randomize(0.015);
    // Prefer throttle + mild brake; steer near zero until rays/lateral demand it
    b.b2[0] = 1.35;
    b.b2[1] = 0;
    b.b2[2] = -0.35;

    for (let r = 0; r < 5; r++) {
      const w = 0.4 + (4 - r) * 0.06;
      b.w1[r * 16 + 0] = -w;
      b.w1[(10 - r) * 16 + 1] = -w;
    }
    // Front ray → brake / cut throttle (not a hard steer)
    b.w1[5 * 16 + 2] = -1.2;
    b.w1[5 * 16 + 3] = 1.0;

    b.w2[0 * 3 + 1] = 1.05;
    b.w2[1 * 3 + 1] = -1.05;
    b.w2[2 * 3 + 2] = 1.25;
    b.w2[3 * 3 + 0] = -0.9;

    if (inSize > 11) b.w1[11 * 16 + 4] = -0.45;
    if (inSize > 12) {
      // Lateral error → gentle recenter (was too aggressive → circles)
      b.w1[12 * 16 + 5] = -0.85;
      b.w2[5 * 3 + 1] = 1.05;
    }
    if (inSize > 13) {
      // Alignment with tangent supports throttle and damps stray steer
      b.w1[13 * 16 + 6] = 1.1;
      b.w2[6 * 3 + 0] = 0.85;
      b.w2[6 * 3 + 1] = 0; // don't invent steer from alignment
    }
    return b;
  }

  toJSON() {
    return {
      inSize: this.inSize,
      hidden: this.hidden,
      outSize: this.outSize,
      w1: Array.from(this.w1),
      b1: Array.from(this.b1),
      w2: Array.from(this.w2),
      b2: Array.from(this.b2),
      crashBook: this.crashBook.toJSON(),
    };
  }

  static fromJSON(data: ReturnType<FastBrain["toJSON"]>): FastBrain {
    const b = new FastBrain(data.inSize, data.hidden, data.outSize);
    b.w1.set(data.w1);
    b.b1.set(data.b1);
    b.w2.set(data.w2);
    b.b2.set(data.b2);
    b.crashBook = CrashBook.fromJSON(data.crashBook);
    return b;
  }
}
