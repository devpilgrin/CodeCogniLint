import { useState, useCallback, useEffect, useRef } from 'react';
import { gitApi, compareApi, apiErrorMessage } from '../services/api';
import { useI18n } from '../i18n';
import type { GitStatus, GitLogEntry, PrResult, CompareResult } from '../types';

export type GitOp = 'refresh' | 'commit' | 'push' | 'pull' | 'pr' | 'compare' | null;

export interface GitNotice {
  kind: 'ok' | 'err';
  text: string;
}

export function useGit(workspacePath: string | null) {
  const { t } = useI18n();
  // t через ref, чтобы refresh не зависел от языка интерфейса (смена языка не должна триггерить git-рефреш)
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<GitLogEntry[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [notRepo, setNotRepo] = useState(false);
  const [busy, setBusy] = useState<GitOp>(null);
  const [notice, setNotice] = useState<GitNotice | null>(null);

  const refresh = useCallback(async () => {
    if (!workspacePath) return;
    setBusy(b => b ?? 'refresh');
    try {
      const [st, log, br] = await Promise.all([gitApi.status(), gitApi.log(8), gitApi.branches()]);
      setStatus(st);
      setCommits(log);
      setBranches(br.branches);
      setNotRepo(false);
    } catch (e) {
      const msg = apiErrorMessage(e, tRef.current('err.backendOfflineShort'));
      // TODO: бэкенд не возвращает структурированный код ошибки для «не репозиторий» — определяем по тексту detail; если бэкенд добавит код/поле ошибки, использовать его вместо подстроки.
      if (msg.includes('не является git-репозиторием')) {
        setNotRepo(true);
        setStatus(null);
        setCommits([]);
      } else {
        setNotice({ kind: 'err', text: msg });
      }
    } finally {
      setBusy(b => (b === 'refresh' ? null : b));
    }
  }, [workspacePath]);

  useEffect(() => {
    setStatus(null);
    setCommits([]);
    setNotRepo(false);
    setNotice(null);
    refresh();
  }, [refresh]);

  // Авто-скрытие уведомлений
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), notice.kind === 'ok' ? 2500 : 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const doCommit = useCallback(async (message: string): Promise<boolean> => {
    setBusy('commit');
    try {
      const r = await gitApi.commit(message);
      setNotice({ kind: 'ok', text: t('git.noticeCommit', { hash: r.hash, message: r.message.split('\n')[0] ?? '' }) + (r.note ? t('git.noticeCommitNote', { note: r.note }) : '') });
      await refresh();
      return true;
    } catch (e) {
      setNotice({ kind: 'err', text: apiErrorMessage(e, t('err.backendOfflineShort')) });
      return false;
    } finally {
      setBusy(null);
    }
  }, [refresh, t]);

  const doPush = useCallback(async (): Promise<boolean> => {
    setBusy('push');
    try {
      const r = await gitApi.push();
      setNotice({ kind: 'ok', text: t('git.noticePush', { branch: r.branch, remote: r.remote }) + (r.set_upstream ? t('git.noticePushUpstream') : '') });
      await refresh();
      return true;
    } catch (e) {
      setNotice({ kind: 'err', text: apiErrorMessage(e, t('err.backendOfflineShort')) });
      return false;
    } finally {
      setBusy(null);
    }
  }, [refresh, t]);

  const doPull = useCallback(async (): Promise<boolean> => {
    setBusy('pull');
    try {
      const r = await gitApi.pull();
      setNotice({ kind: 'ok', text: r.updated ? t('git.noticePullUpdated', { head: r.head }) : t('git.noticePullFresh') });
      await refresh();
      return true;
    } catch (e) {
      setNotice({ kind: 'err', text: apiErrorMessage(e, t('err.backendOfflineShort')) });
      return false;
    } finally {
      setBusy(null);
    }
  }, [refresh, t]);

  const doCreatePr = useCallback(async (
    title: string, body: string, base: string, withLlm: boolean,
  ): Promise<PrResult | null> => {
    setBusy('pr');
    try {
      const r = await gitApi.createPr(title, body, base, withLlm);
      setNotice({
        kind: 'ok',
        text: r.created ? t('git.noticePrCreated', { number: r.number }) : t('git.noticePrExists', { number: r.number }),
      });
      await refresh();
      return r;
    } catch (e) {
      setNotice({ kind: 'err', text: apiErrorMessage(e, t('err.backendOfflineShort')) });
      return null;
    } finally {
      setBusy(null);
    }
  }, [refresh, t]);

  const doCompare = useCallback(async (base: string, head: string) => {
    setBusy('compare');
    try {
      setCompareResult(await compareApi.run(base, head));
    } catch (e) {
      setNotice({ kind: 'err', text: apiErrorMessage(e, t('err.backendOfflineShort')) });
    } finally {
      setBusy(null);
    }
  }, [t]);

  return { status, commits, branches, compareResult, notRepo, busy, notice, refresh, doCommit, doPush, doPull, doCreatePr, doCompare };
}