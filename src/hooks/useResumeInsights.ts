import { useEffect, useState } from 'react';
import { getHistory, getJournalSummary, getSavedRequest } from '../lib/db';
import { EMPTY_CACHE_PLAN, inspectResumeCache, type ResumeSettings, type CachePlan } from '../lib/resume-cache-plan';

export function useResumeInsights(documentId: string | null, active: boolean, completed: number, lastSavedAt: number | null, settings: ResumeSettings, retryLimit: number) {
  const settingsKey = JSON.stringify(settings);
  const scope = JSON.stringify([documentId, completed, settingsKey, retryLimit]);
  const [value, setValue] = useState<{documentId: string | null; scope: string; plan: CachePlan; available: number; pending: number}>({documentId: null, scope: '', plan: EMPTY_CACHE_PLAN, available: 0, pending: 0});
  const [checkedScope, setCheckedScope] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.documentId !== documentId) return;
      if (typeof detail.pendingRequests === 'number') setValue(previous => ({...previous, documentId, pending: detail.pendingRequests}));
      if (!active) setRevision(n => n + 1);
    };
    window.addEventListener('translation-document-change', update);
    return () => window.removeEventListener('translation-document-change', update);
  }, [documentId, active]);
  useEffect(() => {
    if (active) return;
    let stale = false;
    setCheckedScope('');
    const update = async () => {
      if (!documentId) { setCheckedScope(scope); return; }
      try {
        const record = await getHistory(documentId);
        const summary = await getJournalSummary(documentId);
        const plan = record ? await inspectResumeCache(record, JSON.parse(settingsKey), getSavedRequest, retryLimit) : EMPTY_CACHE_PLAN;
        if (!stale) { setValue({documentId, scope, plan, ...summary}); setCheckedScope(scope); }
      } catch { if (!stale) { setValue({documentId, scope, plan: EMPTY_CACHE_PLAN, available: 0, pending: 0}); setCheckedScope(scope); } }
    };
    void update();
    return () => { stale = true; };
  }, [documentId, active, scope, lastSavedAt, revision, settingsKey, retryLimit]);
  return {plan: value.scope === scope ? value.plan : EMPTY_CACHE_PLAN,
    available: value.scope === scope ? value.available : 0,
    pending: documentId === value.documentId ? value.pending : 0, checking: !!documentId && !active && checkedScope !== scope};
}
