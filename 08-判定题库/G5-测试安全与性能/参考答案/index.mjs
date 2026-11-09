export function validateOrder(input) {
  if (!input || typeof input !== 'object') return ['shape'];
  const errors = [];
  const qty = input.qty;
  if (!Number.isInteger(qty) || qty <= 0 || qty > 100) errors.push('qty');
  if (typeof input.sku !== 'string' || !/^[A-Z0-9-]{3,20}$/.test(input.sku)) errors.push('sku');
  if (typeof input.note === 'string' && /[<>]/.test(input.note)) errors.push('xss');
  return errors;
}
