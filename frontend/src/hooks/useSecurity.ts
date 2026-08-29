import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { securityApi } from '../services/api';
import type { SecurityReport } from '../types';

function errText(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const detail = (e.response?.data as { detail?: string } | undefined)?.detail;
    if (detail) return detail;
    if (e.code === 'ERR_NETWORK') return 'Бэкенд не отвечает';
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

export function useSecurity(workspacePath: string | null) {
  const [tools, setTools] = useState<Record<string, boolean> | null>(null);
  const [report, setReport] = useState<SecurityReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReport(null);
    setError(null);
    if (!workspacePath) {
      setTools(null);
      return;
    }
    securityApi.tools().then(setTools).catch(() => setTools(null));
  }, [workspacePath]);

  const runScan = useCallback(async (verify: boolean) => {
    setScanning(true);
    setError(null);
    try {
      const r = await securityApi.scan(verify);
      setReport(r);
    } catch (e) {
      setError(errText(e));
    } finally {
      setScanning(false);
    }
  }, []);

  const clearReport = useCallback(() => {
    setReport(null);
    setError(null);
  }, []);

  return { tools, report, scanning, error, runScan, clearReport };
}
