import { useState, useCallback, useRef, useEffect } from 'react';
import type { AnalysisResult, ChatMessage } from '../types';
import { analysisApi } from '../services/api';
import { useI18n } from '../i18n';

const STEP_KEYS = [
  'analysis.step1',
  'analysis.step2',
  'analysis.step3',
  'analysis.step4',
];

export function useAnalysis() {
  const { t } = useI18n();
  const [resultsByFile, setResultsByFile] = useState<Record<string, AnalysisResult>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'system',
      content: t('analysis.welcome'),
      timestamp: new Date().toISOString(),
    },
  ]);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stepLabel, setStepLabel] = useState(t(STEP_KEYS[0]));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const clearProgress = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const closeStream = () => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => () => { closeStream(); clearProgress(); }, []);

  // ---------- Single-file analysis ----------
  const analyzeFile = useCallback(async (filePath: string, content: string) => {
    clearProgress();
    closeStream();
    setAnalyzing(true);
    setProgress(0);
    setStepLabel(t(STEP_KEYS[0]));

    let currentProgress = 0;
    intervalRef.current = setInterval(() => {
      currentProgress = Math.min(currentProgress + Math.random() * 18 + 2, 90);
      const idx = Math.min(Math.floor((currentProgress / 90) * STEP_KEYS.length), STEP_KEYS.length - 1);
      setProgress(currentProgress);
      setStepLabel(t(STEP_KEYS[idx]));
    }, 350);

    try {
      const data = await analysisApi.analyzeFile(filePath, content);
      clearProgress();
      setProgress(100);
      setStepLabel(t('common.done'));
      setResultsByFile(prev => ({ ...prev, [filePath]: data }));

      const msg = data.violations.length > 0
        ? t('analysis.fileViolations', { path: filePath, count: data.violations.length, summary: data.summary })
        : t('analysis.fileClean', { path: filePath, summary: data.summary });
      setMessages(prev => [...prev, {
        role: 'assistant', content: msg, timestamp: new Date().toISOString(),
      }]);
    } catch {
      clearProgress();
      setProgress(100);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: t('err.backendOfflineRetry'),
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setTimeout(() => { setAnalyzing(false); setProgress(0); }, 600);
    }
  }, [t]);

  // ---------- Repository analysis (SSE) ----------
  const analyzeRepository = useCallback(() => {
    clearProgress();
    closeStream();
    setAnalyzing(true);
    setProgress(0);
    setStepLabel(t('analysis.searchingFiles'));

    const es = new EventSource('/api/analysis/repository/stream');
    esRef.current = es;

    let aggregatedViolations = 0;
    let totalFiles = 0;
    let streamFinished = false;

    const finish = (assistantMsg: string, keepOverlayBriefly = false) => {
      streamFinished = true;
      closeStream();
      if (assistantMsg) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: assistantMsg,
          timestamp: new Date().toISOString(),
        }]);
      }
      if (keepOverlayBriefly) {
        setTimeout(() => { setAnalyzing(false); setProgress(0); }, 800);
      } else {
        setAnalyzing(false);
        setProgress(0);
      }
    };

    es.onmessage = (e) => {
      let data: { type: string; [key: string]: unknown };
      try { data = JSON.parse(e.data); } catch { return; }

      switch (data.type) {
        case 'start':
          totalFiles = (data.total as number) ?? 0;
          setStepLabel(totalFiles === 0 ? t('analysis.noFilesFound') : t('analysis.filesFound', { total: totalFiles }));
          break;

        case 'file': {
          const result = data.result as AnalysisResult;
          const path = data.path as string;
          const idx = data.index as number;
          const total = data.total as number;
          setResultsByFile(prev => ({ ...prev, [path]: result }));
          aggregatedViolations += result.violations?.length ?? 0;
          setProgress(((idx + 1) / total) * 100);
          setStepLabel(`[${idx + 1}/${total}] ${path}`);
          break;
        }

        case 'done': {
          const total = (data.total as number) ?? totalFiles;
          setProgress(100);
          setStepLabel(t('common.done'));
          finish(t('analysis.projectDone', { total, violations: aggregatedViolations }), true);
          break;
        }

        case 'aborted':
          finish(t('analysis.aborted', { index: String(data.index ?? '?'), total: String(data.total ?? '?'), error: String(data.error) }));
          break;

        case 'error':
          finish(t('analysis.scanError', { error: String(data.error) }));
          break;
      }
    };

    es.onerror = () => {
      // EventSource fires onerror when stream closes normally too.
      if (streamFinished) return;
      finish(t('analysis.connectionLost'));
    };
  }, [t]);

  const cancelAnalysis = useCallback(() => {
    closeStream();
    clearProgress();
    setAnalyzing(false);
    setProgress(0);
  }, []);

  // ---------- Chat ----------
  const sendMessage = useCallback(async (text: string, context?: string) => {
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => {
      const updated = [...prev, userMsg];
      analysisApi.chat(updated, context).then(reply => {
        setMessages(cur => [...cur, reply]);
      }).catch(() => {
        setMessages(cur => [...cur, {
          role: 'assistant',
          content: t('err.backendOffline'),
          timestamp: new Date().toISOString(),
        }]);
      });
      return updated;
    });
  }, [t]);

  const clearFileResult = useCallback((path: string) => {
    setResultsByFile(prev => {
      if (!(path in prev)) return prev;
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }, []);

  const clearAllResults = useCallback(() => {
    setResultsByFile({});
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([{
      role: 'system',
      content: t('analysis.chatCleared'),
      timestamp: new Date().toISOString(),
    }]);
  }, [t]);

  return {
    resultsByFile, messages, analyzing, progress, stepLabel,
    analyzeFile, analyzeRepository, cancelAnalysis, sendMessage,
    clearFileResult, clearAllResults, clearMessages,
  };
}
