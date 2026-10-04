export function writeSimulatedSpectrum(
  target: Float32Array,
  offset: number,
  frequencySamples: number,
  time: number,
) {
  const beat = 0.5 + 0.5 * Math.sin(time * 2.1);
  const midCenter = 0.42 + Math.sin(time * 0.75) * 0.12;
  const highCenter = 0.76 + Math.sin(time * 0.52 + 1) * 0.11;

  for (let row = 0; row <= frequencySamples; row += 1) {
    const frequency = row / frequencySamples;
    const bass = Math.exp(-Math.pow((frequency - (0.1 + beat * 0.035)) / 0.055, 2)) * (0.34 + beat * 0.38);
    const mid = Math.exp(-Math.pow((frequency - midCenter) / 0.075, 2)) * (0.28 + 0.2 * Math.sin(time * 1.4 + frequency * 18));
    const high = Math.exp(-Math.pow((frequency - highCenter) / 0.045, 2)) * (0.18 + 0.18 * Math.sin(time * 2.4));
    const texture = 0.025 + 0.025 * (0.5 + 0.5 * Math.sin(time * 8 + row * 1.7));
    target[offset + row] = Math.max(0, Math.min(1, texture + bass + mid + high));
  }
}