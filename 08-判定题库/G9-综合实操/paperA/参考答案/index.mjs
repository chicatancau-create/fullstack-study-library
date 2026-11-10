// A 卷参考答案：预约与排班。
// 契约见 paperA/题面.md；判据见 自测脚本/grade-paper-a.mjs（13 条）。
const MIN = 60_000;

const toMs = (value) => (typeof value === 'number' ? value : Date.parse(value));
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const round4 = (n) => Math.round(n * 10_000) / 10_000;

export function applyBookings({ tenantId, rooms, bookings, now }) {
  const nowMs = toMs(now);
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const accepted = [];
  const rejected = [];
  const waitlist = [];

  const ordered = [...bookings].sort((a, b) => (a.createdAt - b.createdAt) || a.id.localeCompare(b.id));

  const overlaps = (a, b) => a.start < b.end && b.start < a.end;
  const liveHolds = (list) => list.filter((b) => !b.holdUntil || toMs(b.holdUntil) >= nowMs);
  const acceptedIds = () => new Set(accepted.map((b) => b.id));
  const sameDayAccepted = (roomId, startMs) => accepted.filter((b) => b.roomId === roomId && dayKey(b.start) === dayKey(startMs));

  for (const raw of ordered) {
    const booking = {
      id: raw.id,
      tenantId: raw.tenantId ?? tenantId,
      roomId: raw.roomId,
      seats: raw.seats,
      start: toMs(raw.start),
      end: toMs(raw.end),
      createdAt: raw.createdAt,
      ...(raw.holdUntil ? { holdUntil: toMs(raw.holdUntil) } : {}),
      ...(raw.dependsOn ? { dependsOn: raw.dependsOn } : {}),
    };
    const room = roomById.get(booking.roomId);
    const deny = (reason) => rejected.push({ id: booking.id, reason });

    if (raw.role === 'viewer') { deny('forbidden'); continue; }
    if (!room) { deny('unknown_room'); continue; }
    if (!(room.tenantIds ?? [tenantId]).includes(booking.tenantId)) { deny('cross_tenant'); continue; }
    if (!Number.isFinite(booking.start) || !Number.isFinite(booking.end) || booking.start >= booking.end) {
      deny('invalid_range');
      continue;
    }
    if (booking.seats > room.capacity) { deny('capacity'); continue; }
    if (booking.holdUntil !== undefined && booking.holdUntil < nowMs) { deny('hold_expired'); continue; }
    if ((booking.dependsOn ?? []).some((dep) => !acceptedIds().has(dep))) { deny('blocked'); continue; }
    if (liveHolds(accepted).some((b) => b.roomId === booking.roomId && overlaps(b, booking))) {
      deny('conflict');
      continue;
    }
    if (sameDayAccepted(booking.roomId, booking.start).length >= room.dailyLimit) {
      waitlist.push(booking);
      continue;
    }
    accepted.push(booking);
  }

  waitlist.sort((a, b) => (a.createdAt - b.createdAt) || a.id.localeCompare(b.id));
  return { accepted, waitlist, rejected };
}

export function utilization({ rooms, accepted }) {
  const out = {};
  for (const room of rooms) {
    const used = accepted
      .filter((b) => b.roomId === room.id)
      .reduce((sum, b) => sum + (b.end - b.start) / MIN, 0);
    out[room.id] = round4(Math.min(1, used / room.openMinutes));
  }
  return out;
}

export function releaseExpired({ accepted, now }) {
  const nowMs = toMs(now);
  const kept = [];
  const released = [];
  for (const booking of accepted) {
    if (booking.holdUntil !== undefined && booking.holdUntil < nowMs) released.push(booking.id);
    else kept.push(booking);
  }
  return { accepted: kept, released };
}
