import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faPlus, faPencil } from '@fortawesome/free-solid-svg-icons';
import type { Rule, RuleCategory } from '../types';

interface Props {
  /** If provided, dialog is in edit mode; otherwise create mode. */
  initial?: Rule;
  loading: boolean;
  error?: string | null;
  onSubmit: (data: { category: RuleCategory; description: string; pattern_description: string; enabled: boolean }) => Promise<boolean>;
  onClose: () => void;
}

const CATEGORIES: { value: RuleCategory; label: string; desc: string; color: string }[] = [
  { value: 'syntax',   label: 'Синтаксис', desc: 'Стиль, именование, форматирование',   color: 'border-blue-500 bg-blue-500/10' },
  { value: 'semantic', label: 'Семантика',  desc: 'Логика и поведение',                  color: 'border-purple-500 bg-purple-500/10' },
  { value: 'analysis', label: 'Анализ',     desc: 'Безопасность, техдолг, история Git', color: 'border-orange-500 bg-orange-500/10' },
];

const EXAMPLES: Record<RuleCategory, { description: string; pattern: string }> = {
  syntax: {
    description: 'Использовать только стрелочные функции для React-хуков',
    pattern: 'Запретить function-declaration внутри тел useEffect, useMemo, useCallback. Допустимы только () => {} и () => value.',
  },
  semantic: {
    description: 'Методы оплаты должны логировать результат',
    pattern: 'Любая функция, имя которой содержит "pay", "charge", "refund" — должна вызывать logger.info с результатом операции до возврата.',
  },
  analysis: {
    description: 'Не изменять модуль AuthService без покрытия тестами',
    pattern: 'Изменения в файлах src/AuthService.* должны сопровождаться изменениями в tests/auth.* в том же коммите.',
  },
};

export function ManualRuleDialog({ initial, loading, error, onSubmit, onClose }: Props) {
  const isEdit = Boolean(initial);
  const [category, setCategory] = useState<RuleCategory>(initial?.category ?? 'semantic');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [patternDescription, setPatternDescription] = useState(initial?.pattern_description ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  // Auto-fill example only if both fields are empty AND in create mode
  useEffect(() => {
    if (isEdit) return;
    if (description.trim() === '' && patternDescription.trim() === '') {
      const ex = EXAMPLES[category];
      // Use placeholder via separate state — handled via input's placeholder prop below
      void ex;
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
    const ex = EXAMPLES[category];
    setDescription(ex.description);
    setPatternDescription(ex.pattern);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between p-4 border-b border-[#30363d]">
          <h3 className="text-sm font-bold text-white flex items-center">
            <FontAwesomeIcon icon={isEdit ? faPencil : faPlus} className="mr-2 text-blue-400" />
            {isEdit ? 'Редактировать правило' : 'Новое правило (вручную)'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          {/* Category */}
          <div>
            <p className="text-[10px] text-gray-500 uppercase font-semibold mb-2">Категория</p>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={`p-2 rounded border text-left transition-colors ${
                    category === cat.value ? cat.color : 'border-[#30363d] hover:border-gray-500 bg-[#0d1117]'
                  }`}
                >
                  <p className="text-xs text-gray-200 font-semibold">{cat.label}</p>
                  <p className="text-[9px] text-gray-500 mt-0.5">{cat.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <label className="text-[10px] text-gray-500 uppercase font-semibold">
                Краткое описание <span className="text-red-400 normal-case">*</span>
              </label>
              {!isEdit && (
                <button
                  type="button"
                  onClick={fillExample}
                  className="text-[9px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Подставить пример
                </button>
              )}
            </div>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={EXAMPLES[category].description}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              maxLength={500}
            />
            <p className="text-[9px] text-gray-600 mt-1">Что запрещено или требуется. 1 предложение.</p>
          </div>

          {/* Pattern description */}
          <div>
            <label className="text-[10px] text-gray-500 uppercase font-semibold block mb-1">
              Паттерн (для LLM) <span className="text-red-400 normal-case">*</span>
            </label>
            <textarea
              value={patternDescription}
              onChange={e => setPatternDescription(e.target.value)}
              placeholder={EXAMPLES[category].pattern}
              rows={4}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500 code-font resize-none"
              maxLength={2000}
            />
            <p className="text-[9px] text-gray-600 mt-1">
              Детально опиши паттерн, который LLM должен искать. Используй конкретные имена функций, файлов или признаки.
            </p>
          </div>

          {/* Enabled toggle */}
          <label className="flex items-center justify-between p-3 bg-[#0d1117] border border-[#30363d] rounded cursor-pointer">
            <div>
              <p className="text-xs text-gray-200 font-semibold">Правило активно</p>
              <p className="text-[10px] text-gray-500">Применяется при анализе кода</p>
            </div>
            <Toggle checked={enabled} onChange={setEnabled} />
          </label>

          {error && (
            <div className="p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-400">
              ⚠️ {error}
            </div>
          )}
        </div>

        <div className="flex space-x-2 p-4 border-t border-[#30363d]">
          <button
            onClick={onClose}
            className="flex-1 bg-[#30363d] hover:bg-[#484f58] text-gray-300 text-xs py-2 rounded transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs py-2 rounded transition-colors flex items-center justify-center"
          >
            {loading ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                Сохранение...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={isEdit ? faPencil : faPlus} className="mr-2" />
                {isEdit ? 'Сохранить изменения' : 'Создать правило'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
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
