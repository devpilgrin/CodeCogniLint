import { useState, useCallback } from 'react';
import { reviewApi, apiErrorMessage } from '../services/api';
import type { ReviewResult, ChangesReviewResult } from '../types';
import { useI18n } from '../i18n';

export type ReviewMode = 'file' | 'changes' | 'commit';

export interface ReviewState {
  mode: ReviewMode;
  file: ReviewResult | null;
  changes: ChangesReviewResult | null;
}

export function useReview() {
  const { t } = useI18n();
  const [reviewing, setReviewing] = useState<ReviewMode | null>(null);
  const [state, setState] = useState<ReviewState>({ mode: 'file', file: null, changes: null });
  const [error, setError] = useState<string | null>(null);

  const runFileReview = useCallback(async (filePath: string, content: string) => {
    setReviewing('file');
    setError(null);
    try {
      const result = await reviewApi.reviewFile(filePath, content);
      setState({ mode: 'file', file: result, changes: null });
    } catch (e) {
      setError(apiErrorMessage(e, t('err.backendOfflineShort')));
    } finally {
      setReviewing(null);
    }
  }, []);

  const runChangesReview = useCallback(async () => {
    setReviewing('changes');
    setError(null);
    try {
      const result = await reviewApi.reviewChanges();
      setState({ mode: 'changes', file: null, changes: result });
    } catch (e) {
      setError(apiErrorMessage(e, t('err.backendOfflineShort')));
    } finally {
      setReviewing(null);
    }
  }, []);

  const runCommitReview = useCallback(async (sha: string) => {
    setReviewing('commit');
    setError(null);
    try {
      const result = await reviewApi.reviewCommit(sha);
      setState({ mode: 'commit', file: null, changes: result });
    } catch (e) {
      setError(apiErrorMessage(e, t('err.backendOfflineShort')));
    } finally {
      setReviewing(null);
    }
  }, [t]);

  const clearReview = useCallback(() => {
    setState({ mode: 'file', file: null, changes: null });
    setError(null);
  }, []);

  return { reviewing, state, error, runFileReview, runChangesReview, runCommitReview, clearReview };
}
