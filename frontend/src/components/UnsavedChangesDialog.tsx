import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTriangleExclamation, faFloppyDisk, faTrash,
  faXmark, faSpinner,
} from '@fortawesome/free-solid-svg-icons';
import { useI18n } from '../i18n';
import { Dialog } from './ui/Dialog';
import { ErrorBanner } from './ui/ErrorBanner';

interface Props {
  fileName: string;
  filePath: string;
  /** Returns null on success, error message on failure. */
  onSave: () => Promise<string | null>;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedChangesDialog({ fileName, filePath, onSave, onDiscard, onCancel }: Props) {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const err = await onSave();
    setSaving(false);
    if (err) {
      setError(err);
    }
    // success path: parent will close us
  };

  return (
    <Dialog
      title={t('unsaved.title')}
      onClose={onCancel}
      footer={
        <>
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 bg-border-default hover:bg-surface-hover disabled:opacity-50 text-text-primary text-xs py-2 rounded transition-colors flex items-center justify-center"
          >
            <FontAwesomeIcon icon={faXmark} className="mr-1.5" />
            {t('common.cancel')}
          </button>
          <button
            onClick={onDiscard}
            disabled={saving}
            className="flex-1 bg-red-600/20 hover:bg-red-600/40 disabled:opacity-50 border border-red-500/30 text-red-300 text-xs py-2 rounded transition-colors flex items-center justify-center"
          >
            <FontAwesomeIcon icon={faTrash} className="mr-1.5" />
            {t('unsaved.discard')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs py-2 rounded transition-colors flex items-center justify-center"
          >
            {saving ? (
              <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5" />
            ) : (
              <FontAwesomeIcon icon={faFloppyDisk} className="mr-1.5" />
            )}
            {t('unsaved.save')}
          </button>
        </>
      }
    >
      <div className="flex items-start space-x-3">
        <FontAwesomeIcon
          icon={faTriangleExclamation}
          className="text-2xl text-yellow-400 flex-shrink-0 mt-0.5"
        />
        <div className="min-w-0">
          <p className="text-xs text-text-primary leading-relaxed">
            {t('unsaved.body1')} <span className="text-blue-300 code-font">{fileName}</span> {t('unsaved.body2')}
          </p>
          <p className="text-xs text-text-muted mt-1 code-font truncate" title={filePath}>
            {filePath}
          </p>
        </div>
      </div>

      {error && <ErrorBanner message={error} className="mt-3" />}
    </Dialog>
  );
}
