import { useState, useCallback, useRef, useEffect } from 'react';
import type { AnalysisResult, ChatMessage } from '../types';
import { analysisApi, apiErrorMessage } from '../services/api';
import { useI18n } from '../i18n';

const STEP_KEYS = [
  'analysis.step1',
  'analysis.step2',
  'analysis.step3',
  'analysis.step4',
] as const;

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
      const stepKey = STEP_KEYS[idx];
      if (stepKey) setStepLabel(t(stepKey));
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
    } catch (e) {
      clearProgress();
      setProgress(100);
      // Различаем сетевую ошибку (бэкенд офлайн/таймаут) и HTTP-ошибку бэкенда (detail из ответа)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: apiErrorMessage(e, t('err.backendOfflineRetry')),
        timestamp: new Date().toISOString(),
        isError: true,
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

    const finish = (assistantMsg: string, keepOverlayBriefly = false, isError = false) => {
      streamFinished = true;
      closeStream();
      if (assistantMsg) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: assistantMsg,
          timestamp: new Date().toISOString(),
          ...(isError ? { isError: true } : {}),
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
          finish(t('analysis.aborted', { index: String(data.index ?? '?'), total: String(data.total ?? '?'), error: String(data.error) }), false, true);
          break;

        case 'error':
          finish(t('analysis.scanError', { error: String(data.error) }), false, true);
          break;
      }
    };

    es.onerror = () => {
      // EventSource fires onerror when stream closes normally too.
      if (streamFinished) return;
      finish(t('analysis.connectionLost'), false, true);
    };
  }, [t]);

  const cancelAnalysis = useCallback(() => {
    closeStream();
    clearProgress();
    setAnalyzing(false);
    setProgress(0);
  }, []);

  // ---------- Chat ----------
  // ref на актуальный список сообщений — читаем messages без вызова API внутри апдейтера setState (StrictMode двойно вызывает апдейтеры; вынесено в ref + обычные setState вне апдейтера.
  const messagesRef = useRef<ChatMessage[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const sendMessage = useCallback(async (text: string, context?: string) => {
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    // 1) сначала обновляем состояние
    const updated = [...messagesRef.current, userMsg];
    messagesRef.current = updated;
    setMessages(updated);
    // 2) затем вызов API с актуальным списком — побочный эффект вне апдейтера setState
    try {
      const reply = await analysisApi.chat(updated, context);
      setMessages(cur => [...cur, reply]);
    } catch (e) {
      setMessages(cur => [...cur, {
        role: 'assistant',
        content: apiErrorMessage(e, t('err.backendOffline')),
        timestamp: new Date().toISOString(),
        isError: true,
      }]);
    }
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
