export function detectLeak(samples) {
  if (samples.length < 5) return false;
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i] <= samples[i - 1]) return false;
  }
  return true;
}
