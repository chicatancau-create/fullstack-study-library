export function latestOnly() {
  let issued = 0;
  let latest = 0;
  return async (promise) => {
    const id = ++issued;
    latest = id;
    const value = await promise;
    if (id !== latest) return { stale: true, value: null };
    return { stale: false, value };
  };
}
