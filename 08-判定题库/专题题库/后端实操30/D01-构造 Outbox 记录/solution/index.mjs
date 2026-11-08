export function buildOutboxRecord(event, now) {
  return { id: `${event.type}:${event.id}`, payload: event.payload, status: 'pending', createdAt: now };
}
