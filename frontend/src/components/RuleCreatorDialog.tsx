import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import type { RuleCategory } from '../types';

interface Props {
  selectedCode: string;
  initialCategory: RuleCategory;
  onConfirm: (category: RuleCategory) => Promise<boolean>;
  onClose: () => void;
  loading: boolean;
  error?: string | null;
}

const CATEGORIES: { value: RuleCategory; label: string; desc: string }[] = [
  { value: 'syntax',   label: 'Синтаксис', desc: 'Оформление, именование, структура' },
  { value: 'semantic', label: 'Семантика',  desc: 'Логика, смысл, поведение' },
  { value: 'analysis', label: 'Анализ',     desc: 'Безопасность, техдолг, история Git' },
];

const borderColor: Record<RuleCategory, string> = {
  syntax:   'border-blue-500 bg-blue-500/10',
  semantic: 'border-purple-500 bg-purple-500/10',
  analysis: 'border-orange-500 bg-orange-500/10',
};

export function RuleCreatorDialog({ selectedCode, initialCategory, onConfirm, onClose, loading, error }: Props) {
  const [category, setCategory] = useState<RuleCategory>(initialCategory);

  const handleConfirm = async () => {
    const ok = await onConfirm(category);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white flex items-center">
            <FontAwesomeIcon icon={faWandMagicSparkles} className="mr-2 text-blue-400" />
            Создать правило из кода (LLM)
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="bg-[#0d1117] rounded p-3 mb-4 max-h-32 overflow-y-auto custom-scrollbar">
          <pre className="text-[11px] text-gray-300 code-font whitespace-pre-wrap">{selectedCode}</pre>
        </div>

        <div className="mb-4">
          <p className="text-[11px] text-gray-500 uppercase font-semibold mb-2">Категория правила</p>
          <div className="space-y-2">
            {CATEGORIES.map(cat => (
              <label
                key={cat.value}
                className={`flex items-start space-x-3 p-2 rounded border cursor-pointer transition-colors ${
                  category === cat.value ? borderColor[cat.value] : 'border-[#30363d] hover:border-gray-500'
                }`}
              >
                <input
                  type="radio"
                  name="category"
                  value={cat.value}
                  checked={category === cat.value}
                  onChange={() => setCategory(cat.value)}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-xs text-gray-200 font-semibold">{cat.label}</p>
                  <p className="text-[10px] text-gray-500">{cat.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-3 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-400">
            ⚠️ {error}
          </div>
        )}

        <div className="flex space-x-2">
          <button
            onClick={onClose}
            className="flex-1 bg-[#30363d] hover:bg-[#484f58] text-gray-300 text-xs py-2 rounded transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs py-2 rounded transition-colors flex items-center justify-center"
          >
            {loading ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                LLM генерирует...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faWandMagicSparkles} className="mr-2" />
                Создать правило
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
