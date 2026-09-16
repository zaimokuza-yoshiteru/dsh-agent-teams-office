import { createActivityFeed } from './activity-feed.js';
import { readOfficeSnapshot } from './snapshot.js';

export const name = 'dsh-agent-teams-office';
export const inject = ['connection', 'agents', 'sessions', 'sessionProjections'];

/** Use the native Connection carrier, shared by Desktop and Web. */
export function apply(ctx) {
  const feed = createActivityFeed(ctx);
  ctx.effect(() => () => feed.dispose(), 'dsh-agent-teams-office: activity feed');
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/dshOffice/snapshot', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      let envelope;
      try { envelope = await request.json(); }
      catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
      if (envelope?.type !== 'client-request' || typeof envelope.rpcId !== 'string'
        || envelope.method !== 'dshOffice/snapshot' || !envelope.payload
        || (envelope.payload.cursor != null && (typeof envelope.payload.cursor.epoch !== 'string' || envelope.payload.cursor.epoch.length > 128 || !Number.isSafeInteger(envelope.payload.cursor.seq) || envelope.payload.cursor.seq < 0))
        || (envelope.payload.sessionId !== null && (typeof envelope.payload.sessionId !== 'string'
          || envelope.payload.sessionId.length > 256))) {
        return Response.json({ error: 'Invalid office request' }, { status: 400 });
      }
      let result;
      try {
        const value = readOfficeSnapshot(ctx, envelope.payload.sessionId);
        if (value.state === 'live') Object.assign(value, await feed.read(ctx.agents.get(value.leadId), envelope.payload.cursor));
        result = { ok: true, value };
      }
      catch (error) { result = { ok: false, error: { code: 'office-unavailable', message: error.message, details: {} } }; }
      return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result },
        { headers: { 'cache-control': 'no-store' } });
    },
  }), 'dsh-agent-teams-office: read-only snapshot');
}
