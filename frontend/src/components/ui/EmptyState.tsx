import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { Button } from './Button';

interface Props {
  icon: IconDefinition;
  title: string;
  hint?: string;
  /** Опциональная CTA-кнопка. */
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

/** Пустое состояние: иконка, заголовок, подсказка, опциональная CTA-кнопка. */
export function EmptyState({ icon, title, hint, actionLabel, onAction, className = '' }: Props) {
  return (
    <div className={`flex-1 flex items-center justify-center p-6 text-center ${className}`}>
      <div>
        <FontAwesomeIcon icon={icon} className="text-3xl text-text-muted mb-2" />
        <p className="text-xs text-text-secondary font-semibold mb-1">{title}</p>
        {hint && <p className="text-xs text-text-muted leading-relaxed">{hint}</p>}
        {actionLabel && onAction && (
          <Button onClick={onAction} className="mt-3">
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
