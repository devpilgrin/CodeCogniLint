import type { ReactNode } from 'react';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { useI18n } from '../../i18n';
import { Dialog } from './Dialog';
import { Button } from './Button';

interface Props {
  title: string;
  /** Текст подтверждения (переносы строк сохраняются). */
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Диалог подтверждения деструктивного действия на базе Dialog. */
export function ConfirmDialog({
  title, body, confirmLabel, cancelLabel, loading = false, onConfirm, onCancel,
}: Props) {
  const { t } = useI18n();
  return (
    <Dialog
      title={title}
      icon={faTriangleExclamation}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading} className="flex-1">
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading} className="flex-1">
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap">{body}</div>
    </Dialog>
  );
}
