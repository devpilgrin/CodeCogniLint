import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { WorkspaceInfo, TreeNode, FileContentResponse } from '../types';
import { workspaceApi } from '../services/api';
import { useI18n } from '../i18n';

function errMsg(err: unknown, fallback: string, offline: string): string {
  if (axios.isAxiosError(err) && err.response?.data?.detail) {
    return String(err.response.data.detail);
  }
  if (axios.isAxiosError(err) && err.code === 'ERR_NETWORK') {
    return offline;
  }
  return fallback;
}

export function useWorkspace() {
  const { t } = useI18n();
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
      setError(errMsg(err, t('err.openProject'), t('err.backendOfflineDetail')));
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
      setError(errMsg(err, t('err.cloneRepo'), t('err.backendOfflineDetail')));
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
      setError(errMsg(err, t('err.readFile'), t('err.backendOfflineDetail')));
      return null;
    }
  }, []);

  const saveFile = useCallback(async (path: string, content: string): Promise<string | null> => {
    try {
      await workspaceApi.saveFile(path, content);
      return null;
    } catch (err) {
      return errMsg(err, t('err.saveFile'), t('err.backendOfflineDetail'));
    }
  }, []);

  return {
    workspace, tree, recent, loading, error, backendOnline,
    openLocal, cloneGit, closeWorkspace, loadFile, saveFile, refresh,
    clearError: () => setError(null),
  };
}
