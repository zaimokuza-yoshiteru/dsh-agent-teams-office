/** Render only facts reported by Teams; inactive is distinct from idle. */
export function officeMembers(members) {
  return members.map(member => ({
    id: member.id, name: member.name, role: member.role, status: member.status,
    description: member.description ?? '', model: member.model ?? '',
    provider: member.provider ?? '', diagnostics: [...member.diagnostics],
  }));
}

/** A dormant member's browser binding still identifies its owning root Team. */
export function officeSessionId(sessions, sessionId) {
  if (!sessionId) return null;
  return sessions.binding(sessionId)?.session.getSnapshot().subagent?.address?.parentSessionId ?? sessionId;
}

/** Reserve seat zero for Lead and keep IDs stable across roster reordering. */
export function reconcileSeats(previous, members, capacity = 17) {
  const byId = new Map(members.map(member => [member.id, member]));
  const next = new Map(), occupied = new Set();
  for (const [id, seat] of previous) {
    const member = byId.get(id);
    if (!member || occupied.has(seat) || seat < 0 || seat >= capacity || (member.role === 'lead') !== (seat === 0)) continue;
    next.set(id, seat); occupied.add(seat);
  }
  for (const member of members) {
    if (next.has(member.id)) continue;
    const seat = member.role === 'lead' ? (occupied.has(0) ? -1 : 0)
      : Array.from({ length: capacity - 1 }, (_, i) => i + 1).find(value => !occupied.has(value));
    if (seat === undefined || seat < 0) continue;
    next.set(member.id, seat); occupied.add(seat);
  }
  return next;
}
