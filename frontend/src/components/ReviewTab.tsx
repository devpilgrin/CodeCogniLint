import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faClipboardCheck, faSpinner, faArrowRight, faLightbulb,
  faThumbsUp, faFileCode, faCodeBranch, faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import type { ReviewResult, ReviewIssue, ReviewVerdict } from '../types';
import type { ReviewMode, ReviewState } from '../hooks/useReview';

interface Props {
  reviewing: ReviewMode | null;
  state: ReviewState;
  error: string | null;
  activeFilePath: string | null;
  hasWorkspace: boolean;
  onReviewFile: () => void;
  onReviewChanges: () => void;
  onJumpToLine: (line: number) => void;
  onOpenFile: (path: string) => void;
}

const verdictStyle: Record<ReviewVerdict, string> = {
  approve: 'bg-green-500/15 border-green-500/40 text-green-400',
  comment: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400',
  request_changes: 'bg-red-500/15 border-red-500/40 text-red-400',
};

const verdictLabel: Record<ReviewVerdict, string> = {
  approve: '✓ ОДОБРЕНО',
  comment: '💬 ЕСТЬ КОММЕНТАРИИ',
  request_changes: '✗ ТРЕБУЮТСЯ ПРАВКИ',
};

const severityBadge: Record<ReviewIssue['severity'], string> = {
  critical: 'text-orange-400 bg-orange-400/10',
  warning: 'text-yellow-400 bg-yellow-400/10',
  info: 'text-blue-400 bg-blue-400/10',
};

const severityLabel: Record<ReviewIssue['severity'], string> = {
  critical: 'КРИТИЧНО',
  warning: 'ВАЖНО',
  info: 'ИНФО',
};

const categoryLabel: Record<ReviewIssue['category'], string> = {
  bug: 'БАГ',
  security: 'БЕЗОПАСНОСТЬ',
  performance: 'ПРОИЗВОДИТ.',
  style: 'СТИЛЬ',
  maintainability: 'ПОДДЕРЖИВ.',
};

function IssueCard({ issue, filePath, activeFilePath, onJumpToLine, onOpenFile }: {
  issue: ReviewIssue;
  filePath: string;
  activeFilePath: string | null;
  onJumpToLine: (line: number) => void;
  onOpenFile: (path: string) => void;
}) {
  const handleJump = () => {
    if (filePath === activeFilePath) {
      onJumpToLine(issue.line_start);
    } else {
      onOpenFile(filePath);
    }
  };
  return (
    <div
      className="border border-[#30363d] rounded-lg p-3 space-y-2 cursor-pointer bg-[#0d1117] hover:border-blue-500/40 transition-colors"
      onClick={handleJump}
      title={filePath === activeFilePath ? 'Перейти к строке' : `Открыть ${filePath}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${severityBadge[issue.severity]}`}>
            {severityLabel[issue.severity]}
          </span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-gray-400 bg-gray-400/10">
            {categoryLabel[issue.category]}
          </span>
        </div>
        <span className="text-[10px] text-gray-500 flex items-center">
          стр. {issue.line_start}{issue.line_end !== issue.line_start ? `–${issue.line_end}` : ''}
          <FontAwesomeIcon icon={faArrowRight} className="ml-1 text-[8px]" />
        </span>
      </div>
      <p className="text-[11px] text-gray-200 font-semibold leading-snug">{issue.title}</p>
      {issue.code_snippet && (
        <pre className="text-[10px] code-font bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-gray-300 overflow-x-auto custom-scrollbar whitespace-pre">
          {issue.code_snippet}
        </pre>
      )}
      <p className="text-[11px] text-gray-400 leading-relaxed">{issue.description}</p>
      {issue.suggestion && (
        <div className="flex items-start space-x-1 text-[10px] text-green-300/80 leading-relaxed">
          <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 flex-shrink-0" />
          <span>{issue.suggestion}</span>
        </div>
      )}
    </div>
  );
}

function FileReviewBlock({ review, activeFilePath, onJumpToLine, onOpenFile, showPath }: {
  review: ReviewResult;
  activeFilePath: string | null;
  onJumpToLine: (line: number) => void;
  onOpenFile: (path: string) => void;
  showPath: boolean;
}) {
  return (
    <div className="space-y-2">
      {showPath && (
        <button
          onClick={() => onOpenFile(review.file_path)}
          className="w-full text-left text-[10px] text-blue-400 hover:text-blue-300 code-font truncate"
          title={`Открыть ${review.file_path}`}
        >
          <FontAwesomeIcon icon={faFileCode} className="mr-1" />
          {review.file_path}
        </button>
      )}
      <div className={`border rounded-lg px-2.5 py-2 text-[11px] font-bold ${verdictStyle[review.verdict]}`}>
        {verdictLabel[review.verdict]}
      </div>
      {review.summary && (
        <p className="text-[11px] text-gray-400 leading-relaxed px-1">{review.summary}</p>
      )}
      {review.issues.map((issue, i) => (
        <IssueCard
          key={i}
          issue={issue}
          filePath={review.file_path}
          activeFilePath={activeFilePath}
          onJumpToLine={onJumpToLine}
          onOpenFile={onOpenFile}
        />
      ))}
      {review.positives.length > 0 && (
        <div className="border border-green-500/20 bg-green-500/5 rounded-lg p-2.5 space-y-1">
          <div className="text-[9px] font-bold text-green-400 uppercase flex items-center">
            <FontAwesomeIcon icon={faThumbsUp} className="mr-1" /> Сильные стороны
          </div>
          {review.positives.map((p, i) => (
            <p key={i} className="text-[10px] text-gray-400 leading-relaxed">· {p}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReviewTab({
  reviewing, state, error, activeFilePath, hasWorkspace,
  onReviewFile, onReviewChanges, onJumpToLine, onOpenFile,
}: Props) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Actions */}
      <div className="p-3 space-y-1.5 border-b border-[#30363d] flex-shrink-0">
        <button
          onClick={onReviewFile}
          disabled={reviewing !== null || !activeFilePath}
          className="w-full text-xs py-1.5 rounded transition-colors border bg-blue-600/20 hover:bg-blue-600/40 border-blue-500/30 text-blue-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
          title={activeFilePath ? `Ревью файла: ${activeFilePath}` : 'Откройте файл для ревью'}
        >
          {reviewing === 'file'
            ? <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5" />
            : <FontAwesomeIcon icon={faFileCode} className="mr-1.5" />}
          {reviewing === 'file' ? 'Ревью файла...' : 'Ревью текущего файла'}
        </button>
        <button
          onClick={onReviewChanges}
          disabled={reviewing !== null || !hasWorkspace}
          className="w-full text-xs py-1.5 rounded transition-colors border bg-purple-600/20 hover:bg-purple-600/40 border-purple-500/30 text-purple-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
          title="Ревью незакоммиченных изменений (git)"
        >
          {reviewing === 'changes'
            ? <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5" />
            : <FontAwesomeIcon icon={faCodeBranch} className="mr-1.5" />}
          {reviewing === 'changes' ? 'Ревью изменений...' : 'Ревью изменений (git)'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-2.5 text-[11px] text-red-400 flex items-start">
            <FontAwesomeIcon icon={faTriangleExclamation} className="mr-1.5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!error && state.mode === 'file' && state.file && (
          <FileReviewBlock
            review={state.file}
            activeFilePath={activeFilePath}
            onJumpToLine={onJumpToLine}
            onOpenFile={onOpenFile}
            showPath
          />
        )}

        {!error && state.mode === 'changes' && state.changes && (
          <div className="space-y-3">
            <div className={`border rounded-lg px-2.5 py-2 text-[11px] font-bold ${verdictStyle[state.changes.overall_verdict]}`}>
              {verdictLabel[state.changes.overall_verdict]}
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed px-1">{state.changes.summary}</p>
            {state.changes.files.map((review, i) => (
              <div key={i} className="border-t border-[#30363d] pt-2">
                <FileReviewBlock
                  review={review}
                  activeFilePath={activeFilePath}
                  onJumpToLine={onJumpToLine}
                  onOpenFile={onOpenFile}
                  showPath
                />
              </div>
            ))}
          </div>
        )}

        {!error && !state.file && !state.changes && !reviewing && (
          <div className="flex-1 flex items-center justify-center p-6 text-center h-full">
            <div>
              <FontAwesomeIcon icon={faClipboardCheck} className="text-3xl text-gray-600 mb-2" />
              <p className="text-xs text-gray-400 font-semibold mb-1">Агент код-ревью</p>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Ревью текущего файла или незакоммиченных<br />
                изменений: вердикт, замечания с привязкой<br />
                к строкам и сильные стороны кода.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
