export function tenantView(rows, tenantId, actor, now = Date.now()) {
  const visible = rows.filter((row) => row.tenantId === tenantId).map((row) => ({ ...row }));
  const audit = {
    who: actor,
    when: now,
    what: 'list',
    before: rows.length,
    after: visible.length,
  };
  return { rows: visible, audit };
}
