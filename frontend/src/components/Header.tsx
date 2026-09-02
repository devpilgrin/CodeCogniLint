import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrochip, faPlay, faFolderOpen } from '@fortawesome/free-solid-svg-icons';
import type { WorkspaceInfo } from '../types';
import { useI18n } from '../i18n';

interface Props {
  workspace: WorkspaceInfo | null;
  onAnalyzeProject: () => void;
  analyzing: boolean;
}

export function Header({ workspace, onAnalyzeProject, analyzing }: Props) {
  const { t } = useI18n();
  const disabled = analyzing || !workspace;
  return (
    <header className="h-12 border-b border-border-default flex items-center justify-between px-4 bg-bg-surface z-(--z-header) flex-shrink-0">
      <div className="flex items-center space-x-4">
        <div className="flex items-center text-blue-400 font-bold tracking-tight">
          <FontAwesomeIcon icon={faMicrochip} className="mr-2" />
          <span>CodeCogniLint v1.0</span>
        </div>
        <div className="h-4 w-[1px] bg-border-default" />
        <div className="text-xs text-text-secondary flex items-center">
          {workspace ? (
            <>
              <FontAwesomeIcon icon={faFolderOpen} className="mr-2 text-blue-400" />
              <span className="text-text-primary" title={workspace.path}>{workspace.name}</span>
            </>
          ) : (
            <span className="italic text-text-muted">{t('header.noProject')}</span>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-6">
        <button
          onClick={onAnalyzeProject}
          disabled={disabled}
          title={
            !workspace
              ? t('header.openProjectFirst')
              : analyzing
              ? t('header.analyzing')
              : t('header.analyzeTooltip')
          }
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs px-3 py-1 rounded transition-colors flex items-center"
        >
          <FontAwesomeIcon icon={faPlay} className="mr-2 text-xs" />
          {t('header.analyzeProject')}
        </button>
      </div>
    </header>
  );
}
