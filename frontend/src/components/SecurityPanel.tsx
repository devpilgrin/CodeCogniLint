import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faShieldHalved, faSpinner, faFolderOpen, faTriangleExclamation,
  faCheckCircle, faCircleQuestion, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { SecurityFinding, SecurityReport } from '../types';

interface Props {
  hasWorkspace: boolean;
  tools: Record<string, boolean> | null;
  report: SecurityReport | null;
  scanning: boolean;
  error: string | null;
  onScan: (verify: boolean) => void;
  onOpenFinding: (path: string, line: number) => void;
}

const sevBadge: Record<SecurityFinding['severity'], string> = {
  critical: 'text-red-400 bg-red-400/10',
  warning: 'text-yellow-400 bg-yellow-400/10',
  info: 'text-blue-400 bg-blue-400/10',
};

const sevLabel: Record<SecurityFinding['severity'], string> = {
  critical: 'CRIT',
  warning: 'WARN',
  info: 'INFO',
};

const toolLabel: Record<string, string> = {
  semgrep: 'SAST',
  gitleaks: 'Секреты',
  secrets: 'Секреты',
  'pip-audit': 'Завис.',
  'npm-audit': 'Завис.',
};

const verIcon: Record<string, { icon: typeof faCheckCircle; cls: string; title: string }> = {
  confirmed: { icon: faCheckCircle, cls: 'text-red-400', title: 'Подтверждено LLM-верификатором' },
  false_positive: { icon: faXmark, cls: 'text-green-500', title: 'Опровергнуто LLM-верификатором' },
  unverified: { icon: faCircleQuestion, cls: 'text-gray-600', title: 'Без верификации' },
};

const TOOL_NAMES: [string, string][] = [
  ['semgrep', 'Semgrep'], ['gitleaks', 'Gitleaks'], ['pip_audit', 'pip-audit'], ['npm', 'npm'],
];

export function SecurityPanel({ hasWorkspace, tools, report, scanning, error, onScan, onOpenFinding }: Props) {
  const [verify, setVerify] = useState(true);

  return (
    <aside className="w-64 border-r border-[#30363d] bg-[#0d1117] flex flex-col overflow-hidden flex-shrink-0">
      <div className="p-3 text-[11px] uppercase font-bold text-gray-500 tracking-wider">
        Безопасность
      </div>

      {!hasWorkspace && (
        <div className="p-4 text-center">
          <FontAwesomeIcon icon={faFolderOpen} className="text-3xl text-gray-600 mb-2" />
          <p className="text-xs text-gray-500">Откройте проект,<br />чтобы запустить сканирование</p>
        </div>
      )}

      {hasWorkspace && (
        <>
          {/* Tools availability */}
          {tools && (
            <div className="px-3 pb-2 flex flex-wrap gap-1">
              {TOOL_NAMES.map(([key, name]) => (
                <span
                  key={key}
                  title={tools[key] ? `${name} доступен` : `${name} не установлен`}
                  className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                    tools[key] ? 'text-green-400 bg-green-400/10' : 'text-gray-600 bg-gray-600/10 line-through'
                  }`}
                >
                  {name}
                </span>
              ))}
            </div>
          )}

          {/* Scan controls */}
          <div className="px-3 pb-3 border-b border-[#30363d] space-y-1.5">
            <button
              onClick={() => onScan(verify)}
              disabled={scanning}
              className="w-full text-xs py-1.5 rounded transition-colors border bg-red-600/20 hover:bg-red-600/40 border-red-500/30 text-red-400 disabled:opacity-40 flex items-center justify-center"
            >
              {scanning
                ? <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5" />
                : <FontAwesomeIcon icon={faShieldHalved} className="mr-1.5" />}
              {scanning ? 'Сканирование...' : 'Сканировать проект'}
            </button>
            <label className="flex items-center text-[10px] text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={verify}
                onChange={e => setVerify(e.target.checked)}
                className="mr-1.5 accent-red-500"
              />
              LLM-верификация находок (топ-10)
            </label>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pb-4">
            {error && (
              <div className="mx-2 mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-[10px] text-red-400 flex items-start">
                <FontAwesomeIcon icon={faTriangleExclamation} className="mr-1.5 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {report && (
              <>
                {/* Summary */}
                <div className="px-3 py-2 space-y-1.5 border-b border-[#30363d]">
                  <div className="flex items-center space-x-2 text-[10px]">
                    <span className="text-red-400 font-bold">{report.summary.by_severity.critical} crit</span>
                    <span className="text-yellow-400 font-bold">{report.summary.by_severity.warning} warn</span>
                    <span className="text-blue-400 font-bold">{report.summary.by_severity.info} info</span>
                    {report.summary.confirmed > 0 && (
                      <span className="text-gray-400">· {report.summary.confirmed} подтв.</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(report.summary.by_cwe).map(([cwe, n]) => (
                      <span key={cwe} className="text-[9px] px-1 py-0.5 rounded text-purple-300 bg-purple-400/10 code-font">
                        {cwe} ×{n}
                      </span>
                    ))}
                  </div>
                  {Object.values(report.layers).map((l, i) =>
                    l.status !== 'ok' && l.reason ? (
                      <p key={i} className="text-[9px] text-gray-600">{l.reason}</p>
                    ) : null
                  )}
                </div>

                {/* Findings */}
                {report.findings.length === 0 && (
                  <p className="px-3 mt-3 text-[11px] text-gray-500 text-center">
                    Находок нет — проект чист по доступным движкам
                  </p>
                )}
                {report.findings.map(f => {
                  const v = verIcon[f.verification.status];
                  return (
                    <button
                      key={f.id}
                      onClick={() => onOpenFinding(f.path, f.line_start)}
                      className={`w-full text-left px-3 py-2 border-b border-[#21262d] hover:bg-[#161b22] transition-colors ${
                        f.verification.status === 'false_positive' ? 'opacity-45' : ''
                      }`}
                      title={`${f.path}:${f.line_start}\n${f.message}${f.verification.rationale ? '\nВерификатор: ' + f.verification.rationale : ''}`}
                    >
                      <div className="flex items-center space-x-1.5">
                        <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${sevBadge[f.severity]}`}>
                          {sevLabel[f.severity]}
                        </span>
                        <span className="text-[9px] px-1 py-0.5 rounded text-gray-500 bg-gray-500/10">
                          {toolLabel[f.tool] ?? f.tool}
                        </span>
                        {f.cwe && (
                          <span className="text-[9px] px-1 py-0.5 rounded text-purple-300 bg-purple-400/10 code-font">
                            {f.cwe}
                          </span>
                        )}
                        <FontAwesomeIcon icon={v.icon} className={`ml-auto text-[10px] ${v.cls}`} title={v.title} />
                      </div>
                      <div className="text-[11px] text-gray-300 mt-1 leading-snug">{f.title}</div>
                      <div className="text-[9px] text-gray-500 code-font mt-0.5 truncate">
                        {f.path}:{f.line_start}
                      </div>
                      {f.verification.rationale && f.verification.status !== 'unverified' && (
                        <div className="text-[9px] text-gray-500 italic mt-0.5 leading-snug">
                          {f.verification.rationale}
                        </div>
                      )}
                    </button>
                  );
                })}
              </>
            )}

            {!report && !error && !scanning && (
              <div className="p-6 text-center">
                <FontAwesomeIcon icon={faShieldHalved} className="text-3xl text-gray-600 mb-2" />
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Детерминированный скан: SAST (Semgrep),<br />
                  секреты, уязвимые зависимости.<br />
                  LLM только верифицирует находки.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
