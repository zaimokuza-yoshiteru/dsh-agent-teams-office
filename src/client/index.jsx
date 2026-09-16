import React, { useEffect, useSyncExternalStore } from 'react';
import { createOfficeScene } from './scene-factory.js';
import { createSceneCache } from './scene-cache.js';
import { Office } from './Office.jsx';
import { words } from './locales.js';
import { officeSessionId } from '../shared.js';
import { createOfficeAvailability } from './availability.js';
import { pollSnapshot } from './poll.js';
import css from './office.css';

export const name = '@zaimokuza/dsh-agent-teams-office';
export const inject = ['slots', 'locale', 'connection', 'sessions', 'sidebarRightTabs', 'sidebarRight'];

/** Register Office through the same native Sidebar tab API as Files and Terminal. */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(name, words), 'dsh-agent-teams-office: locale');
  ctx.effect(() => {
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    return () => style.remove();
  }, 'dsh-agent-teams-office: styles');
  const t = ctx.locale.bind(name);
  const scenes = createSceneCache(createOfficeScene);
  ctx.effect(() => () => scenes.dispose(), 'dsh-agent-teams-office: scenes');
  let pendingNavigation = null;
  const navigationListeners = new Set();
  const navigationSubscribe = listener => { navigationListeners.add(listener); return () => navigationListeners.delete(listener); };
  const navigationSnapshot = () => pendingNavigation;
  const publishNavigation = value => { pendingNavigation = value; for (const listener of navigationListeners) listener(); };
  ctx.effect(() => () => { pendingNavigation?.reject(new Error('Office unloaded')); publishNavigation(null); }, 'dsh-agent-teams-office: navigation');
  const load = async (sessionId, signal, cursor) => {
    const result = await ctx.connection.rpc.call('/api', 'dshOffice/snapshot', { sessionId: officeSessionId(ctx.sessions, sessionId), cursor },
      AbortSignal.any([signal, AbortSignal.timeout(12000)]));
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };
  const openMember = async (leadId, member, sceneKey) => {
    if (ctx.sessions.list.getSnapshot().current === member.id) return;
    if (member.role !== 'lead') await ctx.sessions.refreshSubagents(leadId);
    pendingNavigation?.reject(new Error('Navigation superseded'));
    const completed = new Promise((resolve, reject) => {
      publishNavigation({ sessionId: member.id, sceneKey, resolve, reject });
    });
    try {
      if (member.role === 'lead') ctx.sessions.open(leadId);
      else ctx.sessions.openSubagent({ parentSessionId: leadId, childSessionId: member.id, mode: 'continuable' });
    } catch (error) { publishNavigation(null); throw error; }
    return completed;
  };
  // Open the destination's native tab after its sidebar has bound, retaining the same canvas.
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: name + '/navigation',
  }, function NavigationRestore() {
    const current = useSyncExternalStore(listener => ctx.sessions.list.subscribe(listener), () => ctx.sessions.list.getSnapshot().current);
    const pending = useSyncExternalStore(navigationSubscribe, navigationSnapshot);
    useEffect(() => {
      if (!pending || current !== pending.sessionId) return;
      queueMicrotask(() => {
        if (pendingNavigation !== pending) return;
        if (ctx.sessions.list.getSnapshot().current !== pending.sessionId) {
          pending.reject(new Error('Navigation superseded')); publishNavigation(null); return;
        }
        try { ctx.sidebarRight.openTab('dsh-agent-teams-office', { params: { officeScene: pending.sceneKey } }); pending.resolve(); }
        catch (error) { pending.reject(error); }
        finally { publishNavigation(null); }
      });
    }, [current, pending]);
    return null;
  })), 'dsh-agent-teams-office: retain scene across member navigation');
  ctx.effect(() => {
    const gate = createOfficeAvailability(() => ctx.sidebarRightTabs.register({
      id: name, kind: 'dsh-agent-teams-office', title: () => t('title'),
      guide: [{ id: 'office', order: 30, title: () => t('title'), description: () => t('description'), icon: OfficeIcon }],
    }), () => scenes.dispose());
    const stop = pollSnapshot(signal => load(null, signal), gate.update,
      () => { /* A temporary connection loss must not discard an existing office. */ });
    return () => { stop(); gate.dispose(); };
  }, 'dsh-agent-teams-office: show only while host Agent Teams is enabled');
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: name, locale: name,
  }, function OfficeTab({ sessionId, useTabInfo }) {
    const { tab } = useTabInfo();
    const transferred = tab.navigation.params?.officeScene;
    const sceneKey = typeof transferred === 'string' && scenes.has(transferred) ? transferred : sessionId + '/' + tab.id;
    const office = scenes.get(sceneKey);
    return <Office key={sceneKey} t={t} load={load} sessionId={sessionId} openMember={openMember}
      visible={tab.visible} signal={tab.signal} office={office}/>;
  })), 'dsh-agent-teams-office: sidebar body');
}

function OfficeIcon({ size = 26, className }) {
  return <svg width={size} height={size} viewBox="0 0 26 26" className={className} aria-hidden="true">
    <rect x="4" y="2" width="18" height="22" rx="3" fill="#91ac78"/>
    <path d="M8 7h2m6 0h2M8 11h2m6 0h2M8 15h2m6 0h2M12 24v-5h2v5" stroke="#edf3e4" strokeWidth="2"/>
  </svg>;
}
