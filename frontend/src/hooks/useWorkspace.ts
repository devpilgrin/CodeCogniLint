import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { WorkspaceInfo, TreeNode, FileContentResponse } from '../types';
import { workspaceApi } from '../services/api';

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && err.response?.data?.detail) {
    return String(err.response.data.detail);
  }
  if (axios.isAxiosError(err) && err.code === 'ERR_NETWORK') {
    return 'Бэкенд недоступен. Запустите start-backend.bat.';
  }
  return fallback;
}

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState(true);

  const loadTree = useCallback(async () => {
    try {
      const t = await workspaceApi.getTree();
      setTree(t);
    } catch {
      setTree(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const ws = await workspaceApi.get();
      setBackendOnline(true);
      setWorkspace(ws.current);
      setRecent(ws.recent);
      if (ws.current) {
        await loadTree();
      } else {
        setTree(null);
      }
    } catch {
      setBackendOnline(false);
    }
  }, [loadTree]);

  useEffect(() => { refresh(); }, [refresh]);

  const openLocal = useCallback(async (path: string): Promise<boolean> => {
    setLoading(true); setError(null);
    try {
      const ws = await workspaceApi.open(path);
      setWorkspace(ws.current);
      setRecent(ws.recent);
      await loadTree();
      return true;
    } catch (err) {
      setError(errMsg(err, 'Не удалось открыть проект'));
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadTree]);

  const cloneGit = useCallback(async (url: string, target?: string): Promise<boolean> => {
    setLoading(true); setError(null);
    try {
      const ws = await workspaceApi.clone(url, target);
      setWorkspace(ws.current);
      setRecent(ws.recent);
      await loadTree();
      return true;
    } catch (err) {
      setError(errMsg(err, 'Не удалось клонировать репозиторий'));
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadTree]);

  const closeWorkspace = useCallback(async () => {
    try {
      const ws = await workspaceApi.close();
      setWorkspace(ws.current);
      setRecent(ws.recent);
      setTree(null);
    } catch { /* ignore */ }
  }, []);

  const loadFile = useCallback(async (path: string): Promise<FileContentResponse | null> => {
    try {
      return await workspaceApi.getFile(path);
    } catch (err) {
      setError(errMsg(err, 'Не удалось прочитать файл'));
      return null;
    }
  }, []);

  return {
    workspace, tree, recent, loading, error, backendOnline,
    openLocal, cloneGit, closeWorkspace, loadFile, refresh,
    clearError: () => setError(null),
  };
}
