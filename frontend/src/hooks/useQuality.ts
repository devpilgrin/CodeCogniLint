import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { qualityApi } from '../services/api';
import type { QualityReport } from '../types';

function errText(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const detail = (e.response?.data as { detail?: string } | undefined)?.detail;
    if (detail) return detail;
    if (e.code === 'ERR_NETWORK') return 'Бэкенд не отвечает';
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

export function useQuality(workspacePath: string | null) {
  const [tools, setTools] = useState<Record<string, boolean> | null>(null);
  const [report, setReport] = useState<QualityReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTools = useCallback(async () => {
    try { setTools(await qualityApi.tools()); } catch { setTools(null); }
  }, []);

  useEffect(() => {
    setReport(null);
    setError(null);
    if (workspacePath) loadTools(); else setTools(null);
  }, [workspacePath, loadTools]);

  const runScan = useCallback(async (review: boolean) => {
    if (!workspacePath) return;
    setScanning(true);
    setError(null);
    try {
      setReport(await qualityApi.scan(review));
    } catch (e) {
      setError(errText(e));
    } finally {
      setScanning(false);
    }
  }, [workspacePath]);

  return { tools, report, scanning, error, runScan, loadTools };
}
