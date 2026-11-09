export const STATES = Object.freeze([
  'pending_payment', 'paid', 'shipped', 'completed', 'cancelled', 'refunding', 'refunded',
]);

const ALLOWED = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['shipped', 'refunding'],
  shipped: ['completed', 'refunding'],
  completed: ['refunding'],
  cancelled: [],
  refunding: ['refunded', 'paid'],
  refunded: [],
};

export function canTransition(from, to) {
  return Boolean(ALLOWED[from]?.includes(to));
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const error = new Error(`illegal transition ${from} -> ${to}`);
    error.code = 'ILLEGAL_TRANSITION';
    error.from = from;
    error.to = to;
    throw error;
  }
  return true;
}

export function nextStates(from) {
  return [...(ALLOWED[from] || [])];
}
