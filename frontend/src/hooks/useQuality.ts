import { useState, useCallback, useEffect } from 'react';
import { qualityApi, apiErrorMessage } from '../services/api';
import type { QualityReport } from '../types';
import { useI18n } from '../i18n';

export function useQuality(workspacePath: string | null) {
  const { t } = useI18n();
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
      setError(apiErrorMessage(e, t('err.backendOfflineShort')));
    } finally {
      setScanning(false);
    }
  }, [workspacePath]);

  return { tools, report, scanning, error, runScan, loadTools };
}
