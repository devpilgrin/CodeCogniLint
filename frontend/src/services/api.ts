import axios from 'axios';
import type {
  Rule, AnalysisResult, ChatMessage, LLMSettings,
  WorkspaceState, TreeNode, FileContentResponse, BrowseResponse,
} from '../types';

const api = axios.create({ baseURL: '/api' });

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
