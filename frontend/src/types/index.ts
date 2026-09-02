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
  /** Признак сообщения об ошибке (вместо эвристики по префиксу ⚠️). */
  isError?: boolean;
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

export interface PrResult {
  url: string;
  number: number;
  branch: string;
  base: string;
  created: boolean;  // false = PR уже существовал
}

// ---- Анализ коммита и сравнение веток ----
export interface BranchList {
  current: string | null;
  branches: string[];
}

export interface CompareFinding {
  rule_id: string;
  severity: 'critical' | 'warning' | 'info';
  path: string;
  line_start: number;
  title: string;
  tool: string;
}

export interface CompareResult {
  base: string;
  head: string;
  changed_files: string[];
  added: CompareFinding[];
  removed: CompareFinding[];
  summary: {
    added: number;
    removed: number;
    added_by_severity: Record<string, number>;
    removed_by_severity: Record<string, number>;
  };
  note: string | null;
}

export interface CommitReviewResult extends ChangesReviewResult {
  commit: { sha: string; short: string; author: string; subject: string; date: string } | null;
}

// ---- Качество кода (производительность / размер / best practices) ----
export interface QualityFinding {
  id: string;
  tool: string;
  rule_id: string;
  severity: 'critical' | 'warning' | 'info';
  path: string;
  line_start: number;
  line_end: number;
  title: string;
  snippet: string;
  category?: 'performance' | 'best-practices';
  suppressed?: boolean;
}

export interface QualityMetrics {
  total_code_files: number;
  total_loc: number;
  big_files: { path: string; loc: number; bytes: number }[];
  long_functions: { file: string; name: string; line: number; loc: number }[];
  complex_functions: { file: string; name: string; line: number; cc: number }[];
  top_files: { path: string; loc: number; bytes: number }[];
  thresholds: { file_loc: number; func_loc: number; func_cc: number };
}

export interface QualityHotspot {
  path: string;
  score: number;
  reasons: string[];
  llm?: {
    assessment: string;
    perf_risks: string[];
    simplification_steps: string[];
  } | null;
}

export interface QualityReport {
  workspace: string;
  scanned_at: string;
  tools: Record<string, boolean>;
  layers: Record<string, { status: string; count?: number; scanned_files?: number }>;
  metrics: QualityMetrics;
  hotspots: QualityHotspot[];
  total_findings: number;
  by_category: Record<string, number>;
  by_severity: Record<string, number>;
  findings: QualityFinding[];
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
  suppressed?: boolean;
  is_new?: boolean | null;
}

export interface SecurityLayerInfo {
  status: string;
  count: number;
  reason?: string;
  note?: string;
}

export interface SecurityBaselineInfo {
  head: string | null;
  created_at: string;
  findings: number;
}

// ---- Pentest (волна 3: DAST) ----
export interface PentestFinding {
  id: string;
  layer: 'config' | 'fuzz' | 'nuclei';
  check: string;
  severity: 'critical' | 'warning' | 'info';
  cwe: string | null;
  endpoint: string;
  title: string;
  message: string;
  evidence: string;
}

export interface PentestReport {
  target: string;
  tools: Record<string, boolean>;
  layers: Record<string, { status: string; count: number; reason?: string; cases?: number }>;
  summary: { total: number; by_severity: Record<'critical' | 'warning' | 'info', number> };
  interpretation: {
    overall_risk: 'low' | 'medium' | 'high' | 'critical';
    summary: string;
    recommendations: string[];
  } | null;
  findings: PentestFinding[];
}

// ---- Мульти-агентный аудит (волна 4) ----
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'unknown';
export type Exploitability = 'high' | 'medium' | 'low' | 'unknown';

export interface AuditDomainFinding {
  rule: string;
  file: string;
  exploitability: Exploitability;
  real: boolean;
  note: string;
}

export interface AuditDomain {
  domain: string;
  label: string;
  findings_count: number;
  risk: RiskLevel;
  assessment: string;
  findings: AuditDomainFinding[];
  recommendations: string[];
  agent_error: string | null;
}

export interface AuditMatrixRow {
  cwe: string;
  count: number;
  max_severity: 'critical' | 'warning' | 'info';
  exploitability: Exploitability;
}

export interface AuditReport {
  workspace: string;
  tools: Record<string, boolean>;
  summary: SecurityReport['summary'];
  coverage: SecurityReport['coverage'];
  domains: AuditDomain[];
  synthesis: {
    overall_risk: RiskLevel;
    verdict: string;
    attack_vectors: string[];
    priorities: string[];
  } | null;
  matrix: AuditMatrixRow[];
  note: string | null;
}

export interface SecurityReport {
  tools: Record<string, boolean>;
  layers: { semgrep: SecurityLayerInfo; secrets: SecurityLayerInfo; sca: SecurityLayerInfo };
  coverage: {
    total_files: number;
    code_files: number;
    sast_scanned: number;
    secrets_scanned: number;
    skipped: { binary: number; too_large: number; non_code: number };
  };
  summary: {
    total: number;
    suppressed: number;
    by_severity: Record<'critical' | 'warning' | 'info', number>;
    by_cwe: Record<string, number>;
    confirmed: number;
  };
  baseline: SecurityBaselineInfo | null;
  diff?: { new: number; fixed: number; fixed_list: { title: string; path: string }[] };
  findings: SecurityFinding[];
}
