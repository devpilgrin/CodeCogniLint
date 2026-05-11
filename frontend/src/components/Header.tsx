import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrochip, faCodeBranch, faPlay, faFolderOpen } from '@fortawesome/free-solid-svg-icons';
import type { WorkspaceInfo } from '../types';

interface Props {
  contextHealth: number;
  workspace: WorkspaceInfo | null;
  onAnalyzeProject: () => void;
  analyzing: boolean;
}

export function Header({ contextHealth, workspace, onAnalyzeProject, analyzing }: Props) {
  const disabled = analyzing || !workspace;
  return (
    <header className="h-12 border-b border-[#30363d] flex items-center justify-between px-4 bg-[#161b22] z-50 flex-shrink-0">
      <div className="flex items-center space-x-4">
        <div className="flex items-center text-blue-400 font-bold tracking-tight">
          <FontAwesomeIcon icon={faMicrochip} className="mr-2" />
          <span>HYBRID_CORE v1.0</span>
        </div>
        <div className="h-4 w-[1px] bg-[#30363d]" />
        <div className="text-xs text-gray-400 flex items-center">
          {workspace ? (
            <>
              <FontAwesomeIcon icon={faFolderOpen} className="mr-2 text-blue-400" />
              <span className="text-gray-200" title={workspace.path}>{workspace.name}</span>
              <span className="mx-2">/</span>
              <FontAwesomeIcon icon={faCodeBranch} className="mr-1" />
              <span>main</span>
            </>
          ) : (
            <span className="italic text-gray-500">проект не открыт</span>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2">
          <span className="text-[10px] uppercase font-semibold text-gray-500">LLM Context Health:</span>
          <div className="w-24 h-1.5 bg-[#30363d] rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-700"
              style={{ width: `${contextHealth}%` }}
            />
          </div>
          <span className="text-[10px] text-green-500 font-bold">{contextHealth}%</span>
        </div>

        <button
          onClick={onAnalyzeProject}
          disabled={disabled}
          title={
            !workspace
              ? 'Сначала откройте проект'
              : analyzing
              ? 'Анализ выполняется...'
              : 'Просканировать все кодовые файлы проекта'
          }
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs px-3 py-1 rounded transition-colors flex items-center"
        >
          <FontAwesomeIcon icon={faPlay} className="mr-2 text-[10px]" />
          Анализ проекта
        </button>

        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xs font-bold text-white border border-white/20 cursor-pointer select-none">
          AI
        </div>
      </div>
    </header>
  );
}
