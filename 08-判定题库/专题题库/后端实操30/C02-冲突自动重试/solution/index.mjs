export async function retryOnConflict(fn, maxAttempts = 3) {
  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (err.code !== 'CONFLICT') throw err;
      last = err;
    }
  }
  throw last;
}
