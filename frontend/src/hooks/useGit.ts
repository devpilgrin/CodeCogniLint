import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { gitApi } from '../services/api';
import type { GitStatus, GitLogEntry } from '../types';

export type GitOp = 'refresh' | 'commit' | 'push' | 'pull' | null;

export interface GitNotice {
  kind: 'ok' | 'err';
  text: string;
}

function errText(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const detail = (e.response?.data as { detail?: string } | undefined)?.detail;
    if (detail) return detail;
    if (e.code === 'ERR_NETWORK') return 'Бэкенд не отвечает';
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

export function useGit(workspacePath: string | null) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<GitLogEntry[]>([]);
  const [notRepo, setNotRepo] = useState(false);
  const [busy, setBusy] = useState<GitOp>(null);
  const [notice, setNotice] = useState<GitNotice | null>(null);

  const refresh = useCallback(async () => {
    if (!workspacePath) return;
    setBusy(b => b ?? 'refresh');
    try {
      const [st, log] = await Promise.all([gitApi.status(), gitApi.log(8)]);
      setStatus(st);
      setCommits(log);
      setNotRepo(false);
    } catch (e) {
      const msg = errText(e);
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
      setNotice({ kind: 'ok', text: `Коммит ${r.hash}: ${r.message.split('\n')[0]}` + (r.note ? ` (${r.note})` : '') });
      await refresh();
      return true;
    } catch (e) {
      setNotice({ kind: 'err', text: errText(e) });
      return false;
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const doPush = useCallback(async (): Promise<boolean> => {
    setBusy('push');
    try {
      const r = await gitApi.push();
      setNotice({ kind: 'ok', text: `Push: ${r.branch} → ${r.remote}${r.set_upstream ? ' (upstream задан)' : ''}` });
      await refresh();
      return true;
    } catch (e) {
      setNotice({ kind: 'err', text: errText(e) });
      return false;
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const doPull = useCallback(async (): Promise<boolean> => {
    setBusy('pull');
    try {
      const r = await gitApi.pull();
      setNotice({ kind: 'ok', text: r.updated ? `Обновлено до ${r.head}` : 'Уже актуально' });
      await refresh();
      return true;
    } catch (e) {
      setNotice({ kind: 'err', text: errText(e) });
      return false;
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  return { status, commits, notRepo, busy, notice, refresh, doCommit, doPush, doPull };
}
