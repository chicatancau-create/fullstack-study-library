export function migrateV1toV2(order) {
  const { user_id, total, ...rest } = order;
  return { ...rest, userId: user_id, totalCents: Math.round(total * 100) };
}
