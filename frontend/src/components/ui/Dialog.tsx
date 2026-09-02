import { useEffect, useId, useRef, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { useI18n } from '../../i18n';

interface Props {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Иконка заголовка (FontAwesome). */
  icon?: IconDefinition;
  /** Класс ширины панели, напр. 'max-w-md'. */
  maxWidth?: string;
  /** Класс максимальной высоты панели. */
  maxHeight?: string;
  /** Классы тела (паддинги/раскладка). */
  bodyClassName?: string;
  /** Футер (кнопки действий). */
  footer?: ReactNode;
  /** Закрывать по клику на оверлей (по умолчанию true). */
  closeOnOverlay?: boolean;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Стек открытых диалогов — Esc/фокус обрабатывает только верхний (вложенные модалки). */
const openDialogs: string[] = [];

/**
 * Общий модальный диалог: role="dialog", aria-modal, aria-labelledby,
 * закрытие по Esc и клику по оверлею, минимальный focus-trap
 * (автофокус на первый элемент + цикл Tab).
 */
export function Dialog({
  title, onClose, children, icon,
  maxWidth = 'max-w-md',
  maxHeight = 'max-h-[90vh]',
  bodyClassName = 'flex-1 overflow-y-auto p-5 custom-scrollbar',
  footer,
  closeOnOverlay = true,
}: Props) {
  const { t } = useI18n();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const seq = titleId;
    openDialogs.push(seq);
    const panel = panelRef.current;
    // Автофокус на первый фокусируемый элемент (или сама панель)
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== seq) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === firstItem || !panel.contains(active))) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && (active === lastItem || !panel.contains(active))) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      const idx = openDialogs.indexOf(seq);
      if (idx >= 0) openDialogs.splice(idx, 1);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onClose, titleId]);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-(--z-dialog) flex items-center justify-center p-4"
      onClick={closeOnOverlay ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-bg-surface border border-border-default rounded-xl shadow-2xl w-full flex flex-col ${maxWidth} ${maxHeight}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border-default flex-shrink-0">
          <h3 id={titleId} className="text-sm font-bold text-white flex items-center min-w-0">
            {icon && <FontAwesomeIcon icon={icon} className="mr-2 text-accent-hover flex-shrink-0" />}
            <span className="truncate">{title}</span>
          </h3>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            title={t('common.close')}
            className="ml-3 text-text-muted hover:text-white transition-colors flex-shrink-0"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className={bodyClassName}>{children}</div>

        {footer && (
          <div className="flex space-x-2 p-4 border-t border-border-default flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
