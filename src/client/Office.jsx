import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { pollSnapshot } from './poll.js';
import { TEAMMATE_CAPACITY } from './team-office/layout.js';

/** Native sidebar tab content; the scene survives navigation through its tab-owned cache. */
export function Office({ t, load, sessionId, openMember, visible, signal, office }) {
  const { snapshot, selected, sceneError, ready, view } = useSyncExternalStore(office.subscribe, office.getSnapshot);
  const [error, setError] = useState(null);
  const [navigationError, setNavigationError] = useState(null);
  const [navigating, setNavigating] = useState(false);
  const [retry, setRetry] = useState(0);
  const canvas = useRef(null), seat = useRef(null);
  const stateText = status => t(status === 'inactive' ? 'inactiveStatus' : status);
  useEffect(() => {
    if (!visible) return;
    return pollSnapshot(abort => load(sessionId, abort, office.cursor()), value => { office.snapshot(value); setError(null); }, setError);
  }, [sessionId, retry, load, visible, office]);
  useEffect(() => {
    const mounted = office.mount(canvas.current, signal); seat.current = mounted;
    return () => { mounted.detach(); seat.current = null; };
  }, [office, signal]);
  useEffect(() => { office.update(snapshot?.members ?? [], stateText, kind => t('activity_' + kind)); }, [snapshot, selected, ready, t, office]);
  useEffect(() => { seat.current?.visible(visible); }, [visible, office, signal]);

  const members = snapshot?.members ?? [];
  const member = members.find(item => item.id === selected);
  const threeD = view === 'team';
  const overflow = members.filter(item => item.role !== 'lead').length > TEAMMATE_CAPACITY;
  const failure = sceneError || error || navigationError;
  return <section className={`dsh-agent-teams-office${threeD ? ' office-3d' : ''}`} aria-label={t('title')}>
    <div ref={canvas} className="office-canvas" data-testid="office-canvas"/>
    {(sceneError || (!snapshot || members.length === 0)) && <div className="office-empty">
      <strong>{sceneError ? t('sceneError') : !snapshot ? (error ? t('stale') : t('loading')) : t(snapshot.state)}</strong>
      <p>{sceneError ? sceneError.message : t('emptyHint')}</p>
    </div>}
    <div className="office-tools">
      <div className="office-view-switch" role="group" aria-label={t('viewMode')}>
        <Button variant={threeD ? 'outline' : 'ghost'} size="sm" aria-pressed={threeD} onClick={() => office.setView('team')}>3D</Button>
        <Button variant={!threeD ? 'outline' : 'ghost'} size="sm" aria-pressed={!threeD} onClick={() => office.setView('pixel')}>{t('pixelView')}</Button>
      </div>
      <span className="office-hint" title={t('credits')}>{threeD ? t('orbitHint') : t('selectHint')}</span>
      <Button variant="toolbar" size="sm" onClick={() => office.fit()}>{t('fit')} ⛶</Button>
    </div>
    {failure && <div className="office-notice" role="status">
      <span title={failure.message}>{sceneError ? t('sceneError') : navigationError ? navigationError.message : t('stale')}</span>
      <Button variant="outline" size="sm" onClick={() => { setNavigationError(null); setRetry(value => value + 1); if (sceneError) office.retry(); }}>{t('reconnect')}</Button>
    </div>}
    {member && <div className="office-selection">
      <div><strong>{member.name}</strong><span>{stateText(member.status)}</span></div>
      <Button variant="ghost" size="sm" onClick={() => office.focus(member.id)}>{t('focus')}</Button>
      <Button variant="outline" size="sm" disabled={!!error || navigating} onClick={async () => {
        setNavigating(true); setNavigationError(null);
        try { await openMember(snapshot.leadId, member, office.key); } catch (err) { setNavigationError(err); }
        finally { setNavigating(false); }
      }}>{t('open')} ↗</Button>
      <Button variant="ghost" size="sm" aria-label={t('dismiss')} onClick={() => office.select(null)}>×</Button>
    </div>}
    {overflow && <div className="office-overflow">{t('overflow')}</div>}
  </section>;
}
