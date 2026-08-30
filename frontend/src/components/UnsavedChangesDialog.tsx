import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTriangleExclamation, faFloppyDisk, faTrash,
  faXmark, faSpinner,
} from '@fortawesome/free-solid-svg-icons';
import { useI18n } from '../i18n';

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[210] flex items-center justify-center p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-5">
          <div className="flex items-start space-x-3 mb-4">
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              className="text-2xl text-yellow-400 flex-shrink-0 mt-0.5"
            />
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white mb-1">
                {t('unsaved.title')}
              </h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                {t('unsaved.body1')} <span className="text-blue-300 code-font">{fileName}</span> {t('unsaved.body2')}
              </p>
              <p className="text-[10px] text-gray-500 mt-1 code-font truncate" title={filePath}>
                {filePath}
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-3 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-400">
              ⚠️ {error}
            </div>
          )}

          <div className="flex space-x-2">
            <button
              onClick={onCancel}
              disabled={saving}
              className="flex-1 bg-[#30363d] hover:bg-[#484f58] disabled:opacity-50 text-gray-300 text-xs py-2 rounded transition-colors flex items-center justify-center"
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
          </div>
        </div>
      </div>
    </div>
  );
}
