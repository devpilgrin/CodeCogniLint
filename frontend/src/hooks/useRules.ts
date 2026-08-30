import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { Rule, RuleCategory } from '../types';
import { rulesApi } from '../services/api';
import { useI18n } from '../i18n';

function errMsg(err: unknown, fallback: string, offline: string): string {
  if (axios.isAxiosError(err)) {
    if (err.response?.data?.detail) return String(err.response.data.detail);
    if (err.code === 'ERR_NETWORK') return offline;
  }
  return fallback;
}

export interface ManualRuleInput {
  category: RuleCategory;
  description: string;
  pattern_description: string;
  enabled?: boolean;
}

export function useRules() {
  const { t } = useI18n();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      const data = await rulesApi.getAll();
      setRules(data);
    } catch { /* backend offline */ }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  /** LLM-based generation from selected code. Returns true on success. */
  const generateRule = useCallback(async (code: string, category: RuleCategory): Promise<boolean> => {
    setLoading(true);
    setLastError(null);
    try {
      const rule = await rulesApi.generateFromCode(code, category);
      setRules(prev => [...prev, rule]);
      return true;
    } catch (err) {
      setLastError(errMsg(err, t('err.generateRule'), t('err.backendOfflineDetail')));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Manual creation (no LLM). Returns true on success. */
  const createRule = useCallback(async (input: ManualRuleInput): Promise<boolean> => {
    setLoading(true);
    setLastError(null);
    try {
      const rule = await rulesApi.create({
        category: input.category,
        description: input.description,
        pattern_description: input.pattern_description,
        enabled: input.enabled ?? true,
      });
      setRules(prev => [...prev, rule]);
      return true;
    } catch (err) {
      setLastError(errMsg(err, t('err.createRule'), t('err.backendOfflineDetail')));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleRule = useCallback(async (id: string, enabled: boolean) => {
    // Optimistic update
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled } : r));
    try {
      const updated = await rulesApi.update(id, { enabled });
      setRules(prev => prev.map(r => r.id === id ? updated : r));
    } catch (err) {
      // Roll back
      setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !enabled } : r));
      setLastError(errMsg(err, t('err.toggleRule'), t('err.backendOfflineDetail')));
    }
  }, []);

  const updateRule = useCallback(async (id: string, patch: Partial<Omit<Rule, 'id' | 'created_at'>>) => {
    try {
      const updated = await rulesApi.update(id, patch);
      setRules(prev => prev.map(r => r.id === id ? updated : r));
      return true;
    } catch (err) {
      setLastError(errMsg(err, t('err.updateRule'), t('err.backendOfflineDetail')));
      return false;
    }
  }, []);

  const deleteRule = useCallback(async (id: string) => {
    const prev = rules;
    setRules(p => p.filter(r => r.id !== id));
    try {
      await rulesApi.delete(id);
    } catch {
      setRules(prev); // rollback
    }
  }, [rules]);

  return {
    rules, loading, lastError,
    generateRule, createRule, toggleRule, updateRule, deleteRule,
    refetch: fetchRules,
    clearError: () => setLastError(null),
  };
}
