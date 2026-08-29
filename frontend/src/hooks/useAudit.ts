import { useState, useCallback } from 'react';
import axios from 'axios';
import { auditApi } from '../services/api';
import type { AuditReport } from '../types';

function errText(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const detail = (e.response?.data as { detail?: string } | undefined)?.detail;
    if (detail) return detail;
    if (e.code === 'ERR_NETWORK') return 'Бэкенд не отвечает';
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

export function useAudit(workspacePath: string | null) {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (verify: boolean) => {
    if (!workspacePath) return;
    setRunning(true);
    setError(null);
    try {
      const r = await auditApi.run(verify);
      setReport(r);
    } catch (e) {
      setError(errText(e));
    } finally {
      setRunning(false);
    }
  }, [workspacePath]);

  const clear = useCallback(() => {
    setReport(null);
    setError(null);
  }, []);

  const exportHtml = useCallback(async (): Promise<boolean> => {
    if (!report) return false;
    setError(null);
    try {
      const blob = await auditApi.html(report);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit-report.html';
      a.click();
      URL.revokeObjectURL(url);
      return true;
    } catch (e) {
      setError(errText(e));
      return false;
    }
  }, [report]);

  return { report, running, error, run, clear, exportHtml };
}
