export function pickVersion(acceptHeader, supported = ['v1', 'v2']) {
  const m = /vnd\.api\.(v\d+)\+json/i.exec(acceptHeader ?? '');
  const version = m ? m[1].toLowerCase() : 'v1';
  return supported.includes(version) ? version : null;
}
