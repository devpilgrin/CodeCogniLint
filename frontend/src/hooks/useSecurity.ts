import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { securityApi } from '../services/api';
import type { SecurityReport, SecurityBaselineInfo } from '../types';
import { useI18n } from '../i18n';

function errText(e: unknown, offline: string): string {
  if (axios.isAxiosError(e)) {
    const detail = (e.response?.data as { detail?: string } | undefined)?.detail;
    if (detail) return detail;
    if (e.code === 'ERR_NETWORK') return offline;
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

export function useSecurity(workspacePath: string | null) {
  const { t } = useI18n();
  const [tools, setTools] = useState<Record<string, boolean> | null>(null);
  const [report, setReport] = useState<SecurityReport | null>(null);
  const [baseline, setBaseline] = useState<SecurityBaselineInfo | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busyBaseline, setBusyBaseline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReport(null);
    setError(null);
    if (!workspacePath) {
      setTools(null);
      setBaseline(null);
      return;
    }
    securityApi.tools().then(setTools).catch(() => setTools(null));
    securityApi.getBaseline().then(setBaseline).catch(() => setBaseline(null));
  }, [workspacePath]);

  const runScan = useCallback(async (verify: boolean) => {
    setScanning(true);
    setError(null);
    try {
      const r = await securityApi.scan(verify);
      setReport(r);
    } catch (e) {
      setError(errText(e, t('err.backendOfflineShort')));
    } finally {
      setScanning(false);
    }
  }, []);

  const saveBaseline = useCallback(async () => {
    setBusyBaseline(true);
    try {
      const b = await securityApi.saveBaseline();
      setBaseline(b);
      if (report) setReport({ ...report, baseline: b, diff: { new: 0, fixed: 0, fixed_list: [] } });
    } catch (e) {
      setError(errText(e, t('err.backendOfflineShort')));
    } finally {
      setBusyBaseline(false);
    }
  }, [report]);

  const dropBaseline = useCallback(async () => {
    setBusyBaseline(true);
    try {
      await securityApi.deleteBaseline();
      setBaseline(null);
      if (report) setReport({ ...report, baseline: null });
    } catch (e) {
      setError(errText(e, t('err.backendOfflineShort')));
    } finally {
      setBusyBaseline(false);
    }
  }, [report]);

  const downloadSarif = useCallback(async () => {
    try {
      const blob = await securityApi.sarif();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'security-scan.sarif';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errText(e, t('err.backendOfflineShort')));
    }
  }, []);

  const clearReport = useCallback(() => {
    setReport(null);
    setError(null);
  }, []);

  // ---- Watch-режим: SSE-поток авто-пересканов при изменении файлов ----
  const [watching, setWatching] = useState(false);
  const [lastWatchScan, setLastWatchScan] = useState<string | null>(null);

  useEffect(() => {
    if (!watching || !workspacePath) return;
    const es = new EventSource('/api/watch/stream');
    es.addEventListener('rescan', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        if (data.report) {
          setReport(data.report);
          setLastWatchScan(new Date().toLocaleTimeString('ru-RU'));
        }
      } catch { /* битый пакет — пропускаем */ }
    });
    es.addEventListener('error', () => {
      setWatching(false);
      es.close();
    });
    return () => es.close();
  }, [watching, workspacePath]);

  const toggleWatch = useCallback(() => setWatching(w => !w), []);

  return {
    tools, report, baseline, scanning, busyBaseline, error,
    runScan, saveBaseline, dropBaseline, downloadSarif, clearReport,
    watching, lastWatchScan, toggleWatch,
  };
}
