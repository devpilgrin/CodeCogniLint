import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
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
    <footer className="h-6 bg-bg-surface text-text-secondary border-t border-border-default flex items-center justify-between px-3 text-[11px] z-(--z-header) flex-shrink-0">
      <div className="flex items-center space-x-4">
        {activeFile && (
          <div className="flex items-center space-x-1 opacity-75">
            <span>{activeFile}</span>
          </div>
        )}
      </div>
      <div className="flex items-center space-x-4">
        {violationsCount > 0 && (
          <div className="flex items-center space-x-1 bg-severity-warning/20 text-severity-warning px-2 rounded">
            <FontAwesomeIcon icon={faExclamationTriangle} />
            <span>{t('statusbar.violations', { count: violationsCount })}</span>
          </div>
        )}
        <span>UTF-8</span>
        <span>{language}</span>
        <div className="flex items-center space-x-1 bg-bg-overlay px-2 rounded">
          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />
          <span>AI • {t('statusbar.rules', { count: rulesCount })}</span>
        </div>
      </div>
    </footer>
  );
}
