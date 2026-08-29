export type RuleCategory = 'syntax' | 'semantic' | 'analysis';

export interface Rule {
  id: string;
  category: RuleCategory;
  description: string;
  pattern_description: string;
  created_at: string;
  enabled: boolean;
}

export interface Violation {
  rule_id: string;
  rule_description: string;
  category: RuleCategory;
  severity: 'critical' | 'warning' | 'info';
  line_start: number;
  line_end: number;
  explanation: string;
  suggestion: string;
  code_snippet?: string;
}

export interface AnalysisResult {
  file_path: string;
  violations: Violation[];
  git_context: string;
  summary: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  color: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  language?: string;
  violations?: number;
  children?: FileNode[];
}

export type AnalysisScope = 'file' | 'commit' | 'pr' | 'repository';

export interface OpenTab {
  path: string;
  name: string;
  language: string;
  content: string;
  originalContent: string;
  dirty: boolean;
}

export interface WorkspaceInfo {
  path: string;
  name: string;
}

export interface WorkspaceState {
  current: WorkspaceInfo | null;
  recent: string[];
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  language?: string;
  children?: TreeNode[];
  truncated?: boolean;
}

export interface FileContentResponse {
  path: string;
  name: string;
  content: string;
  language: string;
  size: number;
}

export interface BrowseEntry {
  name: string;
  path: string;
  type: 'directory';
}

export interface BrowseResponse {
  current: string | null;
  parent: string | null;
  entries: BrowseEntry[];
  home: string;
}

export interface LLMSettings {
  provider: 'lmstudio' | 'openai' | 'anthropic';
  baseUrl: string;
  model: string;
  apiKey?: string;
}

// ---- Git ----
export interface GitChangedFile {
  path: string;
  status: 'M' | 'A' | 'D' | 'R' | '?';
  staged: boolean;
}

export interface GitRemote {
  name: string;
  url: string;
}

export interface GitStatus {
  is_repo: boolean;
  branch: string | null;
  head: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
  changed: GitChangedFile[];
  clean: boolean;
  remotes: GitRemote[];
}

export interface GitLogEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitCommitResult {
  hash: string;
  message: string;
  note: string | null;
}

export interface GitPushResult {
  branch: string;
  remote: string;
  set_upstream: boolean;
  auth: 'token' | 'default';
}

export interface GitPullResult {
  updated: boolean;
  head: string;
}

// ---- Code Review Agent ----
export type ReviewVerdict = 'approve' | 'comment' | 'request_changes';

export interface ReviewIssue {
  severity: 'critical' | 'warning' | 'info';
  category: 'bug' | 'security' | 'performance' | 'style' | 'maintainability';
  line_start: number;
  line_end: number;
  code_snippet?: string;
  title: string;
  description: string;
  suggestion: string;
}

export interface ReviewResult {
  file_path: string;
  verdict: ReviewVerdict;
  summary: string;
  issues: ReviewIssue[];
  positives: string[];
}

export interface ChangesReviewResult {
  overall_verdict: ReviewVerdict;
  summary: string;
  files: ReviewResult[];
}

// ---- Security scan (волна 1: SAST + секреты + SCA) ----
export type VerificationStatus = 'confirmed' | 'false_positive' | 'unverified';

export interface SecurityFinding {
  id: string;
  tool: 'semgrep' | 'gitleaks' | 'secrets' | 'pip-audit' | 'npm-audit';
  rule_id: string;
  severity: 'critical' | 'warning' | 'info';
  cwe: string | null;
  owasp: string | null;
  path: string;
  line_start: number;
  line_end: number;
  title: string;
  message: string;
  snippet: string;
  verification: { status: VerificationStatus; rationale: string };
}

export interface SecurityLayerInfo {
  status: string;
  count: number;
  reason?: string;
  note?: string;
}

export interface SecurityReport {
  tools: Record<string, boolean>;
  layers: { semgrep: SecurityLayerInfo; secrets: SecurityLayerInfo; sca: SecurityLayerInfo };
  summary: {
    total: number;
    by_severity: Record<'critical' | 'warning' | 'info', number>;
    by_cwe: Record<string, number>;
    confirmed: number;
  };
  findings: SecurityFinding[];
}
