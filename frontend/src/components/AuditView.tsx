import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUserTie, faSpinner, faTriangleExclamation, faFolderOpen,
} from '@fortawesome/free-solid-svg-icons';
import type { AuditReport, Exploitability } from '../types';

interface Props {
  hasWorkspace: boolean;
  report: AuditReport | null;
  running: boolean;
  error: string | null;
  onRun: (verify: boolean) => void;
  onOpenFile: (path: string) => void;
  onExportHtml: () => void;
}

const riskStyle: Record<string, string> = {
  low: 'bg-green-500/15 border-green-500/40 text-green-400',
  medium: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400',
  high: 'bg-orange-500/15 border-orange-500/40 text-orange-400',
  critical: 'bg-red-500/15 border-red-500/40 text-red-400',
  unknown: 'bg-gray-500/15 border-gray-500/40 text-gray-400',
};

const riskLabel: Record<string, string> = {
  low: 'НИЗКИЙ', medium: 'СРЕДНИЙ', high: 'ВЫСОКИЙ', critical: 'КРИТИЧЕСКИЙ', unknown: 'Н/Д',
};

const explLabel: Record<Exploitability, string> = {
  high: 'выс.', medium: 'сред.', low: 'низк.', unknown: '?',
};

const explColor: Record<Exploitability, string> = {
  high: 'text-red-400', medium: 'text-yellow-400', low: 'text-green-400', unknown: 'text-gray-500',
};

const sevLabel: Record<string, string> = { critical: 'CRIT', warning: 'WARN', info: 'INFO' };

export function AuditView({ hasWorkspace, report, running, error, onRun, onOpenFile, onExportHtml }: Props) {
  const [verify, setVerify] = useState(false);

  if (!hasWorkspace) {
    return (
      <div className="p-4 text-center">
        <FontAwesomeIcon icon={faFolderOpen} className="text-3xl text-gray-600 mb-2" />
        <p className="text-xs text-gray-500">Откройте проект для аудита</p>
      </div>
    );
  }

  return (
    <>
      <div className="px-3 pb-3 border-b border-[#30363d] space-y-1.5">
        <button
          onClick={() => onRun(verify)}
          disabled={running}
          className="w-full text-xs py-1.5 rounded transition-colors border bg-red-600/20 hover:bg-red-600/40 border-red-500/30 text-red-400 disabled:opacity-40 flex items-center justify-center"
        >
          {running
            ? <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5" />
            : <FontAwesomeIcon icon={faUserTie} className="mr-1.5" />}
          {running ? 'Аудит: суб-агенты работают...' : 'Запустить мульти-агентный аудит'}
        </button>
        <label className="flex items-center text-[10px] text-gray-500 cursor-pointer select-none">
          <input type="checkbox" checked={verify} onChange={e => setVerify(e.target.checked)} className="mr-1.5 accent-red-500" />
          Предварительная LLM-верификация находок
        </label>
        {report && (
          <button
            onClick={onExportHtml}
            className="w-full text-[10px] py-1 rounded border border-[#30363d] bg-[#161b22] text-gray-300 hover:border-blue-500/50 hover:text-blue-300 transition-colors"
            title="Скачать отчёт аудита в HTML"
          >
            Экспорт отчёта (HTML)
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pb-4">
        {error && (
          <div className="mx-2 mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-[10px] text-red-400 flex items-start">
            <FontAwesomeIcon icon={faTriangleExclamation} className="mr-1.5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {report && report.note && (
          <p className="px-3 mt-3 text-[11px] text-gray-500 text-center leading-relaxed">{report.note}</p>
        )}

        {report && !report.note && (
          <>
            {/* Синтезатор */}
            {report.synthesis && (
              <div className="px-3 py-2 space-y-1.5 border-b border-[#30363d]">
                <div className={`border rounded-lg px-2.5 py-2 text-[11px] font-bold ${riskStyle[report.synthesis.overall_risk]}`}>
                  ИТОГ: {riskLabel[report.synthesis.overall_risk]} РИСК
                </div>
                <p className="text-[11px] text-gray-300 leading-relaxed">{report.synthesis.verdict}</p>
                {report.synthesis.attack_vectors.length > 0 && (
                  <div className="space-y-0.5">
                    <p className="text-[9px] uppercase font-bold text-gray-500">Векторы атаки</p>
                    {report.synthesis.attack_vectors.map((v, i) => (
                      <p key={i} className="text-[10px] text-orange-300/80 leading-snug">⚔ {v}</p>
                    ))}
                  </div>
                )}
                {report.synthesis.priorities.length > 0 && (
                  <div className="space-y-0.5">
                    <p className="text-[9px] uppercase font-bold text-gray-500">Приоритеты</p>
                    {report.synthesis.priorities.map((p, i) => (
                      <p key={i} className="text-[10px] text-gray-400 leading-snug">{i + 1}. {p}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Матрица рисков */}
            {report.matrix.length > 0 && (
              <div className="px-3 py-2 border-b border-[#30363d]">
                <p className="text-[9px] uppercase font-bold text-gray-500 mb-1.5">Матрица рисков (CWE)</p>
                <table className="w-full text-[9px] code-font">
                  <thead>
                    <tr className="text-gray-600 text-left">
                      <th className="pb-1">CWE</th>
                      <th className="pb-1 text-center">Кол-во</th>
                      <th className="pb-1 text-center">Тяжесть</th>
                      <th className="pb-1 text-center">Эксплуат.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.matrix.map(m => (
                      <tr key={m.cwe} className="border-t border-[#21262d] text-gray-400">
                        <td className="py-1">{m.cwe}</td>
                        <td className="py-1 text-center">×{m.count}</td>
                        <td className={`py-1 text-center ${m.max_severity === 'critical' ? 'text-red-400' : m.max_severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'}`}>
                          {sevLabel[m.max_severity]}
                        </td>
                        <td className={`py-1 text-center ${explColor[m.exploitability]}`}>
                          {explLabel[m.exploitability]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Домены суб-агентов */}
            {report.domains.map(d => (
              <div key={d.domain} className="px-3 py-2 border-b border-[#21262d] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-300">{d.label}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${riskStyle[d.risk]}`}>
                    {riskLabel[d.risk]}
                  </span>
                </div>
                {d.agent_error ? (
                  <p className="text-[10px] text-gray-600 italic">Суб-агент недоступен: {d.agent_error}</p>
                ) : (
                  <>
                    <p className="text-[10px] text-gray-400 leading-relaxed">{d.assessment}</p>
                    {d.findings.map((f, i) => (
                      <button
                        key={i}
                        onClick={() => f.file && onOpenFile(f.file)}
                        className={`w-full text-left text-[10px] leading-snug px-2 py-1 rounded bg-[#161b22] border border-[#30363d] hover:border-blue-500/40 transition-colors ${f.real ? '' : 'opacity-50'}`}
                        title={f.real ? 'Открыть файл' : 'Суб-агент считает ложным срабатыванием'}
                      >
                        <span className="text-gray-500 code-font">{f.rule}</span>
                        <span className={`ml-1.5 ${explColor[f.exploitability]}`}>[{explLabel[f.exploitability]}]</span>
                        {!f.real && <span className="ml-1.5 text-green-500">FP</span>}
                        <div className="text-gray-500 mt-0.5">{f.note}</div>
                      </button>
                    ))}
                    {d.recommendations.length > 0 && (
                      <div className="space-y-0.5 pt-0.5">
                        {d.recommendations.map((r, i) => (
                          <p key={i} className="text-[9px] text-gray-500 leading-snug">→ {r}</p>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </>
        )}

        {!report && !error && !running && (
          <div className="p-6 text-center">
            <FontAwesomeIcon icon={faUserTie} className="text-3xl text-gray-600 mb-2" />
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Мульти-агентный аудит: детерминированный скан,<br />
              затем суб-агенты по доменам (инъекции, секреты,<br />
              криптография, конфигурация, зависимости)<br />
              и синтезатор с итоговым вердиктом.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
