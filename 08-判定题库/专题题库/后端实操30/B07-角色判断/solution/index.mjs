export function hasRole(actor, role) {
  return (actor.roles ?? []).includes(role);
}
