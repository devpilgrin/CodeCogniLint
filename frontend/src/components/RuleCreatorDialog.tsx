import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import type { RuleCategory } from '../types';
import { useI18n } from '../i18n';
import { Dialog } from './ui/Dialog';
import { ErrorBanner } from './ui/ErrorBanner';
import { Button } from './ui/Button';

interface Props {
  selectedCode: string;
  initialCategory: RuleCategory;
  onConfirm: (category: RuleCategory) => Promise<boolean>;
  onClose: () => void;
  loading: boolean;
  error?: string | null;
}

const CATEGORIES: RuleCategory[] = ['syntax', 'semantic', 'analysis'];

const categoryKey = (cat: RuleCategory, suffix: string) =>
  'rules.category' + cat.charAt(0).toUpperCase() + cat.slice(1) + suffix;

const borderColor: Record<RuleCategory, string> = {
  syntax:   'border-blue-500 bg-blue-500/10',
  semantic: 'border-purple-500 bg-purple-500/10',
  analysis: 'border-orange-500 bg-orange-500/10',
};

export function RuleCreatorDialog({ selectedCode, initialCategory, onConfirm, onClose, loading, error }: Props) {
  const { t } = useI18n();
  const [category, setCategory] = useState<RuleCategory>(initialCategory);

  const handleConfirm = async () => {
    const ok = await onConfirm(category);
    if (ok) onClose();
  };

  return (
    <Dialog
      title={t('rulecreator.title')}
      icon={faWandMagicSparkles}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} className="flex-1">
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            loading={loading}
            className="flex-1"
          >
            {!loading && <FontAwesomeIcon icon={faWandMagicSparkles} className="mr-2" />}
            {loading ? t('rulecreator.generating') : t('rulecreator.createRule')}
          </Button>
        </>
      }
    >
      <div className="bg-bg-canvas rounded p-3 mb-4 max-h-32 overflow-y-auto custom-scrollbar">
        <pre className="text-xs text-text-primary code-font whitespace-pre-wrap">{selectedCode}</pre>
      </div>

      <div className="mb-4">
        <p className="text-xs text-text-muted uppercase font-semibold mb-2">{t('rulecreator.categoryLabel')}</p>
        <div className="space-y-2">
          {CATEGORIES.map(catValue => (
            <label
              key={catValue}
              className={`flex items-start space-x-3 p-2 rounded border cursor-pointer transition-colors ${
                category === catValue ? borderColor[catValue] : 'border-border-default hover:border-gray-500'
              }`}
            >
              <input
                type="radio"
                name="category"
                value={catValue}
                checked={category === catValue}
                onChange={() => setCategory(catValue)}
                className="mt-0.5"
              />
              <div>
                <p className="text-xs text-gray-200 font-semibold">{t(categoryKey(catValue, ''))}</p>
                <p className="text-xs text-text-muted">{t(categoryKey(catValue, 'Desc'))}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {error && <ErrorBanner message={error} />}
    </Dialog>
  );
}
