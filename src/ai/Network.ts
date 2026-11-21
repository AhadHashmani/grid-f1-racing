/** Neuroevolution network ported from the original Python project. */

export class Level {
  inputs: Float32Array;
  outputs: Float32Array;
  biases: Float32Array;
  weights: Float32Array[];
  outputLayer: boolean;

  constructor(numInput: number, numOutput: number, outputLayer = false) {
    this.inputs = new Float32Array(numInput);
    this.outputs = new Float32Array(numOutput);
    this.biases = new Float32Array(numOutput);
    this.weights = Array.from({ length: numInput }, () => new Float32Array(numOutput));
    this.outputLayer = outputLayer;
    this.randomise();
  }

  randomise() {
    for (let i = 0; i < this.biases.length; i++) {
      this.biases[i] = Math.random() * 2 - 1;
    }
    for (const row of this.weights) {
      for (let i = 0; i < row.length; i++) {
        row[i] = Math.random() * 2 - 1;
      }
    }
  }

  feedForward(givenInputs: ArrayLike<number>): Float32Array {
    for (let i = 0; i < this.inputs.length; i++) {
      this.inputs[i] = givenInputs[i] ?? 0;
    }

    for (let i = 0; i < this.outputs.length; i++) {
      let total = 0;
      for (let j = 0; j < this.inputs.length; j++) {
        total += this.inputs[j] * this.weights[j][i];
      }

      if (this.outputLayer) {
        this.outputs[i] = total > this.biases[i] ? 1 : 0;
      } else {
        this.outputs[i] = Math.tanh(total - this.biases[i]);
      }
    }

    return this.outputs;
  }

  clone(): Level {
    const copy = new Level(this.inputs.length, this.outputs.length, this.outputLayer);
    copy.biases.set(this.biases);
    for (let i = 0; i < this.weights.length; i++) {
      copy.weights[i].set(this.weights[i]);
    }
    return copy;
  }

  toJSON() {
    return {
      outputLayer: this.outputLayer,
      biases: Array.from(this.biases),
      weights: this.weights.map((row) => Array.from(row)),
    };
  }

  static fromJSON(data: {
    outputLayer: boolean;
    biases: number[];
    weights: number[][];
  }): Level {
    const level = new Level(data.weights.length, data.biases.length, data.outputLayer);
    level.biases.set(data.biases);
    for (let i = 0; i < data.weights.length; i++) {
      level.weights[i].set(data.weights[i]);
    }
    return level;
  }
}

export class NeuralNetwork {
  levels: Level[];

  constructor(numNeurons: number[]) {
    this.levels = [];
    for (let i = 0; i < numNeurons.length - 1; i++) {
      const isLast = i === numNeurons.length - 2;
      this.levels.push(new Level(numNeurons[i], numNeurons[i + 1], isLast));
    }
  }

  feedForward(givenInputs: ArrayLike<number>): Float32Array {
    let outputs = this.levels[0].feedForward(givenInputs);
    for (let i = 1; i < this.levels.length; i++) {
      outputs = this.levels[i].feedForward(outputs);
    }
    return outputs;
  }

  mutate(amount: number) {
    for (const level of this.levels) {
      for (let i = 0; i < level.biases.length; i++) {
        level.biases[i] = lerp(level.biases[i], Math.random() * 2 - 1, amount);
      }
      for (const row of level.weights) {
        for (let i = 0; i < row.length; i++) {
          row[i] = lerp(row[i], Math.random() * 2 - 1, amount);
        }
      }
    }
  }

  clone(): NeuralNetwork {
    const copy = new NeuralNetwork([1, 1]);
    copy.levels = this.levels.map((level) => level.clone());
    return copy;
  }

  toJSON() {
    return { levels: this.levels.map((level) => level.toJSON()) };
  }

  static fromJSON(data: { levels: ReturnType<Level["toJSON"]>[] }): NeuralNetwork {
    const net = new NeuralNetwork([1, 1]);
    net.levels = data.levels.map((level) => Level.fromJSON(level));
    return net;
  }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function getMutation(generation: number, initial = 0.25, refining = 0.05): number {
  if ((generation >= 1 && generation <= 14) || (generation >= 36 && generation <= 49)) {
    return initial;
  }
  return refining;
}
