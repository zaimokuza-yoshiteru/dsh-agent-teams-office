import { officeMembers } from '../shared.js';

/** Read a live Team using the same service as the native Team panel. No writes. */
export function readOfficeSnapshot(ctx, sessionId) {
  const teams = ctx.get('agentTeams');
  if (!teams) return { state: 'disabled', members: [], tasks: [], leadId: null };
  if (!sessionId) return { state: 'unselected', members: [], tasks: [], leadId: null };
  const agent = ctx.agents.get(sessionId);
  const membership = agent && teams.tryMembership(agent);
  if (!membership) return { state: 'inactive', members: [], tasks: [], leadId: null };
  const view = teams.remoteView(membership.root);
  return { state: 'live', leadId: membership.root.id,
    members: officeMembers(view.members), tasks: view.tasks.map(task => ({ ...task, ownerId: view.members.find(m => m.name === task.ownerName)?.id ?? null })), sampledAt: Date.now() };
}
