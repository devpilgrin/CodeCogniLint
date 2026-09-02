import { useRef, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBrain, faSyncAlt, faExpandAlt, faCompressAlt, faRobot,
  faInfoCircle, faPaperPlane, faCheckCircle, faUser,
  faArrowRight, faLightbulb, faComments, faTools,
  faExclamationTriangle, faClipboardCheck, faChartBar,
} from '@fortawesome/free-solid-svg-icons';
import type { ChatMessage, Violation, AnalysisScope } from '../types';
import { ReviewTab } from './ReviewTab';
import type { ReviewMode, ReviewState } from '../hooks/useReview';
import { useI18n } from '../i18n';
import { severityStyles, severityBadge, categoryBadge } from './ui/severity';
import { EmptyState } from './ui/EmptyState';

export type AIView = AnalysisScope | 'chat' | 'review';

interface Props {
  messages: ChatMessage[];
  violations: Violation[];
  view: AIView;
  onViewChange: (view: AIView) => void;
  onSendMessage: (text: string) => void;
  onApplyFix: (violation: Violation) => void;
  onJumpToLine: (line: number) => void;
  onResetData: () => void;
  tabsCollapsed: boolean;
  onToggleTabsCollapsed: () => void;
  // Code Review Agent
  reviewing: ReviewMode | null;
  reviewState: ReviewState;
  reviewError: string | null;
  activeFilePath: string | null;
  hasWorkspace: boolean;
  onReviewFile: () => void;
  onReviewChanges: () => void;
  onOpenFile: (path: string) => void;
  // Сводный отчёт
  onOpenReport: () => void;
  reportCount: number;
}

const QUICK_PROMPTS = ['#explain', '#refactor', '#security', '#blame'];

export function AIPanel({
  messages, violations, view, onViewChange,
  onSendMessage, onApplyFix, onJumpToLine,
  onResetData, tabsCollapsed, onToggleTabsCollapsed,
  reviewing, reviewState, reviewError, activeFilePath, hasWorkspace,
  onReviewFile, onReviewChanges, onOpenFile,
  onOpenReport, reportCount,
}: Props) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const SCOPE_TABS: { value: AnalysisScope; label: string; soon?: boolean }[] = [
    { value: 'file',       label: t('ai.scopeFile') },
    { value: 'commit',     label: t('ai.scopeCommit'), soon: true },
    { value: 'pr',         label: 'PR/MR', soon: true },
    { value: 'repository', label: t('ai.scopeRepo'), soon: true },
  ];

  useEffect(() => {
    if (view === 'chat') chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, view]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSendMessage(text);
    setInput('');
  };

  // Conversation messages = non-system messages (system are UI-only intro hints).
  const chatMessages = messages.filter(m => m.role !== 'system' || messages.indexOf(m) === 0);
  const unreadHint = messages.length > 1 && view !== 'chat';

  return (
    <aside className="w-80 border-l border-border-default bg-bg-surface flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-border-default flex justify-between items-center bg-bg-canvas flex-shrink-0">
        <span className="text-xs font-bold text-text-primary flex items-center">
          <FontAwesomeIcon icon={faBrain} className="mr-2 text-blue-400" />
          {t('ai.insights')}
          {view === 'file' && violations.length > 0 && (
            <span className="ml-2 text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">
              {violations.length}
            </span>
          )}
        </span>
        <div className="flex space-x-3 text-text-muted text-xs">
          <button
            onClick={onOpenReport}
            disabled={reportCount === 0}
            aria-label={t('report.title')}
            title={
              reportCount === 0
                ? t('app.reportNeedAnalysis')
                : t('app.reportButtonTitle', { count: reportCount })
            }
            className="relative hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <FontAwesomeIcon icon={faChartBar} />
            {reportCount > 0 && (
              <span className="absolute -top-1.5 -right-2 text-[11px] font-bold bg-purple-600 text-white px-1 rounded-full leading-3">
                {reportCount}
              </span>
            )}
          </button>
          <button
            onClick={onResetData}
            aria-label={
              view === 'file'       ? t('ai.resetFile') :
              view === 'repository' ? t('ai.resetRepo') :
              view === 'chat'       ? t('ai.resetChat') :
              t('ai.resetTab')
            }
            title={
              view === 'file'       ? t('ai.resetFile') :
              view === 'repository' ? t('ai.resetRepo') :
              view === 'chat'       ? t('ai.resetChat') :
              t('ai.resetTab')
            }
            className="hover:text-white transition-colors"
          >
            <FontAwesomeIcon icon={faSyncAlt} />
          </button>
          <button
            onClick={onToggleTabsCollapsed}
            aria-label={tabsCollapsed ? t('ai.showAllTabs') : t('ai.hideInactiveTabs')}
            title={tabsCollapsed ? t('ai.showAllTabs') : t('ai.hideInactiveTabs')}
            className={`transition-colors ${tabsCollapsed ? 'text-blue-400' : 'hover:text-white'}`}
          >
            <FontAwesomeIcon icon={tabsCollapsed ? faCompressAlt : faExpandAlt} />
          </button>
        </div>
      </div>

      {/* Tabs: scope tabs + Chat */}
      <div className="flex border-b border-border-default flex-shrink-0 text-xs font-semibold overflow-x-auto no-scrollbar">
        {(tabsCollapsed ? SCOPE_TABS.filter(t => t.value === view) : SCOPE_TABS).map(opt => (
          <button
            key={opt.value}
            onClick={() => onViewChange(opt.value)}
            className={`flex-1 min-w-fit whitespace-nowrap px-2 py-1.5 transition-colors ${
              view === opt.value
                ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500'
                : 'text-text-muted hover:text-text-primary'
            }`}
            title={opt.label}
          >
            {opt.label}
            {opt.soon && (
              <span className="ml-1 text-[9px] font-normal px-1 py-px rounded bg-bg-overlay border border-border-default text-text-muted align-middle">
                {t('ai.comingSoon')}
              </span>
            )}
          </button>
        ))}
        <div className="w-px bg-border-default self-stretch my-1 flex-shrink-0" />
        <button
          onClick={() => onViewChange('review')}
          className={`flex-1 min-w-fit whitespace-nowrap px-2 py-1.5 transition-colors ${
            view === 'review'
              ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500'
              : 'text-text-muted hover:text-text-primary'
          }`}
          title={t('ai.reviewTooltip')}
        >
          <FontAwesomeIcon icon={faClipboardCheck} className="mr-1" />
          {t('ai.reviewTab')}
        </button>
        <button
          onClick={() => onViewChange('chat')}
          className={`flex-1 min-w-fit whitespace-nowrap px-2 py-1.5 transition-colors relative ${
            view === 'chat'
              ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <FontAwesomeIcon icon={faComments} className="mr-1" />
          {t('ai.chatTab')}
          {unreadHint && (
            <span className="absolute top-1 right-2 w-1.5 h-1.5 bg-blue-400 rounded-full" />
          )}
        </button>
      </div>

      {/* Content per tab */}
      {view === 'file' && <FileTabContent violations={violations} onJumpToLine={onJumpToLine} onApplyFix={onApplyFix} t={t} />}
      {view === 'commit' && <PlaceholderTab title={t('ai.commitAnalysis')} hint={t('ai.commitHint')} />}
      {view === 'pr' && <PlaceholderTab title={t('ai.prAnalysis')} hint={t('ai.prHint')} />}
      {view === 'repository' && <PlaceholderTab title={t('ai.repoScan')} hint={t('ai.repoScanHint')} />}

      {view === 'review' && (
        <ReviewTab
          reviewing={reviewing}
          state={reviewState}
          error={reviewError}
          activeFilePath={activeFilePath}
          hasWorkspace={hasWorkspace}
          onReviewFile={onReviewFile}
          onReviewChanges={onReviewChanges}
          onJumpToLine={onJumpToLine}
          onOpenFile={onOpenFile}
        />
      )}

      {view === 'chat' && (
        <ChatTabContent
          messages={chatMessages}
          input={input}
          setInput={setInput}
          onSend={handleSend}
          chatBottomRef={chatBottomRef}
          t={t}
        />
      )}
    </aside>
  );
}

// --- Sub-components (module level — иначе remount при каждом рендере AIPanel) ---

function FileTabContent({ violations, onJumpToLine, onApplyFix, t }: {
  violations: Violation[];
  onJumpToLine: (line: number) => void;
  onApplyFix: (v: Violation) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  if (violations.length === 0) {
    return (
      <EmptyState
        icon={faCheckCircle}
        title={t('ai.noViolations')}
        hint={`${t('ai.noViolationsHint1')} ${t('ai.noViolationsHint2')}`}
      />
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      {violations.map((v, i) => (
        <div
          key={i}
          className={`border rounded-lg p-3 space-y-2 cursor-pointer transition-colors ${severityStyles[v.severity]}`}
          onClick={() => onJumpToLine(v.line_start)}
          title={t('ai.jumpToLine')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1">
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${severityBadge[v.severity]}`}>
                {t(`sev.${v.severity}`)}
              </span>
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${categoryBadge[v.category]}`}>
                {v.category.toUpperCase()}
              </span>
            </div>
            <span className="text-xs text-text-muted flex items-center">
              {t('ai.line', { line: v.line_start })}{v.line_end !== v.line_start ? `–${v.line_end}` : ''}
              <FontAwesomeIcon icon={faArrowRight} className="ml-1 text-[11px]" />
            </span>
          </div>
          <p className="text-xs text-text-primary font-semibold leading-snug">{v.rule_description}</p>
          {v.code_snippet && (
            <pre className="text-xs code-font bg-bg-canvas border border-border-default rounded px-2 py-1 text-text-primary overflow-x-auto custom-scrollbar whitespace-pre">
              {v.code_snippet}
            </pre>
          )}
          <p className="text-xs text-text-secondary leading-relaxed">{v.explanation}</p>
          {v.suggestion && (
            <div className="flex items-start space-x-1 text-xs text-green-300/80 leading-relaxed">
              <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 flex-shrink-0" />
              <span>{v.suggestion}</span>
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onApplyFix(v); }}
            className="w-full text-xs bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-500/30 py-1 rounded transition-colors flex items-center justify-center"
          >
            <FontAwesomeIcon icon={faTools} className="mr-1.5 text-[11px]" />
            {t('ai.askFix')}
          </button>
        </div>
      ))}
    </div>
  );
}

function PlaceholderTab({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 text-center">
      <div>
        <FontAwesomeIcon icon={faExclamationTriangle} className="text-3xl text-gray-600 mb-2" />
        <p className="text-xs text-text-primary font-semibold mb-1">{title}</p>
        <p className="text-xs text-text-muted leading-relaxed">{hint}</p>
      </div>
    </div>
  );
}

function ChatTabContent({ messages, input, setInput, onSend, chatBottomRef, t }: {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  chatBottomRef: React.RefObject<HTMLDivElement | null>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <>
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {messages.map((msg, i) => {
          if (msg.role === 'system') {
            return (
              <div key={i} className="bg-blue-900/20 border border-blue-500/30 p-3 rounded-lg text-xs leading-relaxed">
                <div className="font-bold text-blue-400 mb-1 flex items-center">
                  <FontAwesomeIcon icon={faInfoCircle} className="mr-1" />
                  {t('ai.context')}
                </div>
                {msg.content}
              </div>
            );
          }
          // Сообщение об ошибке помечается флагом isError при создании (useAnalysis)
          const isError = msg.role === 'assistant' && msg.isError === true;
          if (msg.role === 'user') {
            return (
              <div key={i} className="flex space-x-2">
                <div className="w-6 h-6 rounded bg-gray-700 flex-shrink-0 flex items-center justify-center text-xs">
                  <FontAwesomeIcon icon={faUser} className="text-gray-300" />
                </div>
                <div className="bg-border-default text-gray-200 p-2 rounded-tr-lg rounded-b-lg text-xs whitespace-pre-wrap">
                  {msg.content}
                </div>
              </div>
            );
          }
          return (
            <div key={i} className="flex space-x-2">
              <div className={`w-6 h-6 rounded flex-shrink-0 flex items-center justify-center text-xs ${isError ? 'bg-red-600' : 'bg-blue-600'}`}>
                <FontAwesomeIcon icon={faRobot} className="text-white" />
              </div>
              <div className={`p-2 rounded-tr-lg rounded-b-lg text-xs leading-relaxed whitespace-pre-wrap ${
                isError
                  ? 'bg-red-600/10 border border-red-500/30 text-red-300'
                  : 'bg-blue-600/10 border border-blue-500/20 text-gray-200'
              }`}>
                {msg.content}
              </div>
            </div>
          );
        })}
        <div ref={chatBottomRef} />
      </div>

      {/* Chat Input — only in Чат tab */}
      <div className="p-3 bg-bg-canvas border-t border-border-default flex-shrink-0">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSend()}
            placeholder={t('ai.chatPlaceholder')}
            className="w-full bg-bg-surface border border-border-default rounded-md py-2 pl-3 pr-10 text-xs focus:outline-none focus:border-blue-500 text-gray-200"
          />
          <button
            onClick={onSend}
            aria-label={t('ai.chatPlaceholder')}
            title={t('ai.chatPlaceholder')}
            className="absolute right-2 top-1.5 text-blue-500 hover:text-blue-400"
          >
            <FontAwesomeIcon icon={faPaperPlane} />
          </button>
        </div>
        <div className="mt-2 flex space-x-2 flex-wrap gap-y-1">
          {QUICK_PROMPTS.map(p => (
            <button
              key={p}
              onClick={() => setInput(p + ' ')}
              className="text-[11px] text-text-muted hover:text-text-primary cursor-pointer bg-bg-overlay px-1.5 py-0.5 rounded border border-border-default"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
