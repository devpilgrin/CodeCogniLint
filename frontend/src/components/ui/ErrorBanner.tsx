import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useI18n } from '../../i18n';

interface Props {
  message: string;
  /** Если передан — показывается кнопка закрытия. */
  onClose?: () => void;
  className?: string;
}

/** Единый блок отображения ошибки. */
export function ErrorBanner({ message, onClose, className = '' }: Props) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className={`p-2 bg-danger/10 border border-danger/30 rounded text-xs text-danger flex items-start ${className}`}
    >
      <FontAwesomeIcon icon={faExclamationTriangle} className="mr-1.5 mt-0.5 flex-shrink-0" />
      <span className="flex-1 min-w-0">{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          title={t('common.close')}
          className="ml-2 text-danger hover:text-danger/80 flex-shrink-0"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      )}
    </div>
  );
}
