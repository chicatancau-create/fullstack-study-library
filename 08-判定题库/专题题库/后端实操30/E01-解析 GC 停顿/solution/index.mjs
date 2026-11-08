export function parseGcPauses(log) {
  return log.split('\n')
    .map((line) => /Pause\s+\w+.*?([\d.]+)ms/.exec(line))
    .filter(Boolean)
    .map((m) => Number(m[1]));
}
