import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faPencil } from '@fortawesome/free-solid-svg-icons';
import type { Rule, RuleCategory } from '../types';
import { useI18n } from '../i18n';
import { Dialog } from './ui/Dialog';
import { ErrorBanner } from './ui/ErrorBanner';
import { Button } from './ui/Button';

interface Props {
  /** If provided, dialog is in edit mode; otherwise create mode. */
  initial?: Rule;
  loading: boolean;
  error?: string | null;
  onSubmit: (data: { category: RuleCategory; description: string; pattern_description: string; enabled: boolean }) => Promise<boolean>;
  onClose: () => void;
}

const CATEGORIES: { value: RuleCategory; descKey: string; color: string }[] = [
  { value: 'syntax',   descKey: 'manualrule.catSyntaxDesc',   color: 'border-blue-500 bg-blue-500/10' },
  { value: 'semantic', descKey: 'manualrule.catSemanticDesc', color: 'border-purple-500 bg-purple-500/10' },
  { value: 'analysis', descKey: 'rules.categoryAnalysisDesc', color: 'border-orange-500 bg-orange-500/10' },
];

const categoryLabelKey = (cat: RuleCategory) =>
  'rules.category' + cat.charAt(0).toUpperCase() + cat.slice(1);

const exampleKey = (cat: RuleCategory, field: string) =>
  'manualrule.example' + cat.charAt(0).toUpperCase() + cat.slice(1) + field;

export function ManualRuleDialog({ initial, loading, error, onSubmit, onClose }: Props) {
  const { t } = useI18n();
  const isEdit = Boolean(initial);
  const [category, setCategory] = useState<RuleCategory>(initial?.category ?? 'semantic');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [patternDescription, setPatternDescription] = useState(initial?.pattern_description ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  // Auto-fill example only if both fields are empty AND in create mode
  useEffect(() => {
    if (isEdit) return;
    if (description.trim() === '' && patternDescription.trim() === '') {
      // Use placeholder via separate state — handled via input's placeholder prop below
    }
  }, [category, isEdit, description, patternDescription]);

  const canSubmit = description.trim().length >= 3 && patternDescription.trim().length >= 3 && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const ok = await onSubmit({
      category,
      description: description.trim(),
      pattern_description: patternDescription.trim(),
      enabled,
    });
    if (ok) onClose();
  };

  const fillExample = () => {
    setDescription(t(exampleKey(category, 'Description')));
    setPatternDescription(t(exampleKey(category, 'Pattern')));
  };

  return (
    <Dialog
      title={isEdit ? t('manualrule.titleEdit') : t('manualrule.titleCreate')}
      icon={isEdit ? faPencil : faPlus}
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} className="flex-1">
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            loading={loading}
            className="flex-1"
          >
            {!loading && <FontAwesomeIcon icon={isEdit ? faPencil : faPlus} className="mr-2" />}
            {loading
              ? t('manualrule.saving')
              : isEdit ? t('manualrule.saveChanges') : t('manualrule.createRule')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Category */}
        <div>
          <p className="text-[10px] text-text-muted uppercase font-semibold mb-2">{t('manualrule.categoryLabel')}</p>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setCategory(cat.value)}
                className={`p-2 rounded border text-left transition-colors ${
                  category === cat.value ? cat.color : 'border-border-default hover:border-gray-500 bg-bg-canvas'
                }`}
              >
                <p className="text-xs text-gray-200 font-semibold">{t(categoryLabelKey(cat.value))}</p>
                <p className="text-[11px] text-text-muted mt-0.5">{t(cat.descKey)}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <label className="text-[10px] text-text-muted uppercase font-semibold">
              {t('manualrule.descriptionLabel')} <span className="text-red-400 normal-case">*</span>
            </label>
            {!isEdit && (
              <button
                type="button"
                onClick={fillExample}
                className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
              >
                {t('manualrule.fillExample')}
              </button>
            )}
          </div>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t(exampleKey(category, 'Description'))}
            className="w-full bg-bg-canvas border border-border-default rounded px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
            maxLength={500}
          />
          <p className="text-[11px] text-gray-600 mt-1">{t('manualrule.descriptionHint')}</p>
        </div>

        {/* Pattern description */}
        <div>
          <label className="text-[10px] text-text-muted uppercase font-semibold block mb-1">
            {t('manualrule.patternLabel')} <span className="text-red-400 normal-case">*</span>
          </label>
          <textarea
            value={patternDescription}
            onChange={e => setPatternDescription(e.target.value)}
            placeholder={t(exampleKey(category, 'Pattern'))}
            rows={4}
            className="w-full bg-bg-canvas border border-border-default rounded px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500 code-font resize-none"
            maxLength={2000}
          />
          <p className="text-[11px] text-gray-600 mt-1">
            {t('manualrule.patternHint')}
          </p>
        </div>

        {/* Enabled toggle */}
        <label className="flex items-center justify-between p-3 bg-bg-canvas border border-border-default rounded cursor-pointer">
          <div>
            <p className="text-xs text-gray-200 font-semibold">{t('manualrule.ruleActive')}</p>
            <p className="text-xs text-text-muted">{t('manualrule.ruleActiveHint')}</p>
          </div>
          <Toggle checked={enabled} onChange={setEnabled} />
        </label>

        {error && <ErrorBanner message={error} />}
      </div>
    </Dialog>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-blue-500' : 'bg-gray-600'
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
