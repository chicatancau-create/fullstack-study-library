function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

export function createGateway({ delayMs = 0, failRate = 0, seed = 42 } = {}) {
  const random = seeded(seed);
  return {
    async charge({ orderId, amount }) {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const failed = random() < failRate;
      return failed
        ? { ok: false, providerRef: null, note: 'gateway_declined' }
        : { ok: true, providerRef: `mock-${orderId}-${amount}`, note: 'gateway_ok' };
    },
  };
}
