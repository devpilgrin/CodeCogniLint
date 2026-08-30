import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCodeBranch, faSync, faCheckCircle, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { useI18n } from '../i18n';

interface Props {
  language: string;
  rulesCount: number;
  violationsCount: number;
  activeFile: string | null;
}

export function StatusBar({ language, rulesCount, violationsCount, activeFile }: Props) {
  const { t } = useI18n();
  return (
    <footer className="h-6 bg-[#007acc] text-white flex items-center justify-between px-3 text-[10px] z-50 flex-shrink-0">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-1 hover:bg-white/10 px-1 cursor-pointer">
          <FontAwesomeIcon icon={faCodeBranch} />
          <span>main*</span>
        </div>
        <div className="flex items-center space-x-1 hover:bg-white/10 px-1 cursor-pointer">
          <FontAwesomeIcon icon={faSync} />
          <span>Git: OK</span>
        </div>
        {activeFile && (
          <div className="flex items-center space-x-1 opacity-75">
            <span>{activeFile}</span>
          </div>
        )}
      </div>
      <div className="flex items-center space-x-4">
        {violationsCount > 0 && (
          <div className="flex items-center space-x-1 bg-orange-500/30 px-2 rounded">
            <FontAwesomeIcon icon={faExclamationTriangle} />
            <span>{t('statusbar.violations', { count: violationsCount })}</span>
          </div>
        )}
        <span>UTF-8</span>
        <span>{language}</span>
        <div className="flex items-center space-x-1 bg-white/20 px-2 rounded">
          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />
          <span>AI • {t('statusbar.rules', { count: rulesCount })}</span>
        </div>
      </div>
    </footer>
  );
}
