import axios from 'axios';
import type {
  Rule, AnalysisResult, ChatMessage, LLMSettings,
  WorkspaceState, TreeNode, FileContentResponse, BrowseResponse,
  GitStatus, GitCommitResult, GitPushResult, GitPullResult, GitLogEntry, PrResult,
  BranchList, CompareResult,
  ReviewResult, ChangesReviewResult, CommitReviewResult,
  SecurityReport, SecurityBaselineInfo, PentestReport, AuditReport, QualityReport,
} from '../types';

const api = axios.create({ baseURL: '/api', timeout: 30_000 });

/**
 * Response interceptor: нормализует ошибку в читаемое сообщение.
 * HTTP-ошибка с detail из ответа бэкенда заменяет message на текст detail;
 * сетевые ошибки (бэкенд офлайн/таймаут) не трогаем — их текст не локализуется здесь (см. apiErrorMessage).
 */
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;
      if (typeof detail === 'string' && detail) {
        error.message = detail;
      }
    }
    return Promise.reject(error);
  },
);

/**
 * Приводит любую ошибку запроса к читаемой строке: HTTP detail → сетевые/таймаут → offlineText, иначе detail из ответа, иначе message.
 */
export function apiErrorMessage(err: unknown, offlineText: string): string {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === 'string' && detail) return detail;
    // ERR_NETWORK: бэкенд недоступен; ECONNABORTED: таймаут запроса.
    if (err.response === undefined) return offlineText;
    if (err instanceof Error && err.message) return err.message;
    return offlineText;
  }
  return err instanceof Error ? err.message : String(err);
}

export const rulesApi = {
  getAll: () => api.get<Rule[]>('/rules').then(r => r.data),
  create: (rule: Omit<Rule, 'id' | 'created_at'>) =>
    api.post<Rule>('/rules', rule).then(r => r.data),
  update: (id: string, rule: Partial<Rule>) =>
    api.patch<Rule>(`/rules/${id}`, rule).then(r => r.data),
  delete: (id: string) => api.delete(`/rules/${id}`),
  generateFromCode: (code: string, category: Rule['category']) =>
    api.post<Rule>('/rules/generate', { code, category }).then(r => r.data),
};

export const analysisApi = {
  analyzeFile: (filePath: string, content: string): Promise<AnalysisResult> =>
    api.post('/analysis/file', { file_path: filePath, content }).then(r => r.data),
  analyzeRepo: (repoPath: string): Promise<AnalysisResult[]> =>
    api.post('/analysis/repository', { repo_path: repoPath }).then(r => r.data),
  chat: (messages: ChatMessage[], context?: string): Promise<ChatMessage> =>
    api.post('/analysis/chat', { messages, context }).then(r => r.data),
};

export const settingsApi = {
  get: () => api.get<LLMSettings>('/settings').then(r => r.data),
  update: (settings: LLMSettings) =>
    api.put<LLMSettings>('/settings', settings).then(r => r.data),
};

export const reportsApi = {
  xlsx: (results: Record<string, unknown>) =>
    api.post('/reports/xlsx', { results }, { responseType: 'blob' }).then(r => r.data as Blob),
  md: (results: Record<string, unknown>) =>
    api.post('/reports/md', { results }, { responseType: 'blob' }).then(r => r.data as Blob),
};

export const workspaceApi = {
  get: () => api.get<WorkspaceState>('/workspace').then(r => r.data),
  open: (path: string) =>
    api.post<WorkspaceState>('/workspace/open', { path }).then(r => r.data),
  close: () => api.post<WorkspaceState>('/workspace/close').then(r => r.data),
  clone: (url: string, target?: string) =>
    api.post<WorkspaceState>('/workspace/clone', { url, target }).then(r => r.data),
  getTree: () => api.get<TreeNode>('/workspace/tree').then(r => r.data),
  getFile: (path: string) =>
    api.get<FileContentResponse>('/workspace/file', { params: { path } }).then(r => r.data),
  saveFile: (path: string, content: string) =>
    api.put<{ path: string; name: string; size: number; saved_at: string }>(
      '/workspace/file', { path, content }
    ).then(r => r.data),
  browse: (path?: string) =>
    api.get<BrowseResponse>('/workspace/browse', { params: path ? { path } : {} }).then(r => r.data),
};

export const gitApi = {
  status: () => api.get<GitStatus>('/git/status').then(r => r.data),
  diff: (path?: string) =>
    api.get<{ path: string | null; diff: string }>('/git/diff', { params: path ? { path } : {} }).then(r => r.data),
  commit: (message: string, paths?: string[]) =>
    api.post<GitCommitResult>('/git/commit', { message, paths: paths ?? null }).then(r => r.data),
  push: (token?: string) =>
    api.post<GitPushResult>('/git/push', { token: token || null }).then(r => r.data),
  pull: (token?: string) =>
    api.post<GitPullResult>('/git/pull', { token: token || null }).then(r => r.data),
  log: (limit = 10) =>
    api.get<{ commits: GitLogEntry[] }>('/git/log', { params: { limit } }).then(r => r.data.commits),
  createPr: (title: string, body: string, base: string, withLlm: boolean) =>
    api.post<PrResult>('/git/pr', { title, body, base, with_llm: withLlm }).then(r => r.data),
  branches: () => api.get<BranchList>('/git/branches').then(r => r.data),
};

export const reviewApi = {
  reviewFile: (filePath: string, content: string) =>
    api.post<ReviewResult>('/review/file', { file_path: filePath, content }).then(r => r.data),
  reviewChanges: () =>
    api.post<ChangesReviewResult>('/review/changes').then(r => r.data),
  reviewCommit: (sha: string) =>
    api.post<CommitReviewResult>('/review/commit', { sha }).then(r => r.data),
};

export const compareApi = {
  run: (base: string, head: string) =>
    api.get<CompareResult>('/analysis/compare', { params: { base, head } }).then(r => r.data),
};

export const securityApi = {
  tools: () => api.get<Record<string, boolean>>('/security/tools').then(r => r.data),
  scan: (verify: boolean) =>
    api.post<SecurityReport>('/security/scan', null, { params: { verify } }).then(r => r.data),
  getBaseline: () =>
    api.get<{ baseline: SecurityBaselineInfo | null }>('/security/baseline').then(r => r.data.baseline),
  saveBaseline: () =>
    api.post<SecurityBaselineInfo>('/security/baseline').then(r => r.data),
  deleteBaseline: () =>
    api.delete<{ removed: boolean }>('/security/baseline').then(r => r.data),
  sarif: () =>
    api.post('/security/sarif', null, { responseType: 'blob' }).then(r => r.data as Blob),
};

export const pentestApi = {
  tools: () => api.get<Record<string, boolean>>('/pentest/tools').then(r => r.data),
  scan: (url: string, fuzz: boolean, configChecks: boolean, interpret: boolean) =>
    api.post<PentestReport>('/pentest/scan', {
      url, fuzz, config_checks: configChecks, interpret,
    }).then(r => r.data),
};

export const auditApi = {
  run: (verify: boolean) =>
    api.post<AuditReport>('/audit/run', null, { params: { verify } }).then(r => r.data),
  html: (report: AuditReport) =>
    api.post('/audit/html', report, { responseType: 'blob' }).then(r => r.data as Blob),
};

export const qualityApi = {
  tools: () => api.get<Record<string, boolean>>('/quality/tools').then(r => r.data),
  scan: (review: boolean) =>
    api.post<QualityReport>('/quality/scan', null, { params: { review } }).then(r => r.data),
};
