export function auditDenied(actor, action, resource, now) {
  return { who: actor.id, when: now, what: `${action}:${resource.id}`, allowed: false };
}
