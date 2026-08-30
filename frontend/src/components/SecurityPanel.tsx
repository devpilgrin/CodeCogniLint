import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faShieldHalved, faSpinner, faFolderOpen, faTriangleExclamation,
  faCheckCircle, faCircleQuestion, faXmark, faBookmark, faFileExport,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import type { SecurityFinding, SecurityReport, SecurityBaselineInfo, PentestReport, AuditReport } from '../types';
import { PentestView } from './PentestView';
import { AuditView } from './AuditView';
import { useI18n } from '../i18n';

interface Props {
  hasWorkspace: boolean;
  tools: Record<string, boolean> | null;
  report: SecurityReport | null;
  baseline: SecurityBaselineInfo | null;
  scanning: boolean;
  busyBaseline: boolean;
  error: string | null;
  watching: boolean;
  lastWatchScan: string | null;
  onToggleWatch: () => void;
  onScan: (verify: boolean) => void;
  onSaveBaseline: () => void;
  onDropBaseline: () => void;
  onDownloadSarif: () => void;
  onOpenFinding: (path: string, line: number) => void;
  // Pentest (DAST)
  pentestTools: Record<string, boolean> | null;
  pentestReport: PentestReport | null;
  pentestScanning: boolean;
  pentestError: string | null;
  onPentestLoadTools: () => void;
  onPentestScan: (url: string, fuzz: boolean, configChecks: boolean, interpret: boolean) => void;
  // Мульти-агентный аудит
  auditReport: AuditReport | null;
  auditRunning: boolean;
  auditError: string | null;
  onAuditRun: (verify: boolean) => void;
  onAuditExportHtml: () => void;
}

const sevBadge: Record<SecurityFinding['severity'], string> = {
  critical: 'text-red-400 bg-red-400/10',
  warning: 'text-yellow-400 bg-yellow-400/10',
  info: 'text-blue-400 bg-blue-400/10',
};

const TOOL_NAMES: [string, string][] = [
  ['semgrep', 'Semgrep'], ['gitleaks', 'Gitleaks'], ['pip_audit', 'pip-audit'], ['npm', 'npm'],
];

export function SecurityPanel({ hasWorkspace, tools, report, baseline, scanning, busyBaseline, error,
  watching, lastWatchScan, onToggleWatch,
  onScan, onSaveBaseline, onDropBaseline, onDownloadSarif, onOpenFinding,
  pentestTools, pentestReport, pentestScanning, pentestError, onPentestLoadTools, onPentestScan,
  auditReport, auditRunning, auditError, onAuditRun, onAuditExportHtml }: Props) {
  const { t } = useI18n();
  const [verify, setVerify] = useState(true);
  const [view, setView] = useState<'code' | 'pentest' | 'audit'>('code');

  // Пентест не требует открытого workspace — цель задаётся URL
  const pentestMode = view === 'pentest';
  const auditMode = view === 'audit';
  const codeMode = view === 'code';

  const sevLabel: Record<SecurityFinding['severity'], string> = {
    critical: t('sev.critical'),
    warning: t('sev.warning'),
    info: t('sev.info'),
  };

  const toolLabel: Record<string, string> = {
    semgrep: t('security.toolSast'),
    gitleaks: t('security.toolSecrets'),
    secrets: t('security.toolSecrets'),
    'pip-audit': t('security.toolDeps'),
    'npm-audit': t('security.toolDeps'),
  };

  const verIcon: Record<string, { icon: typeof faCheckCircle; cls: string; title: string }> = {
    confirmed: { icon: faCheckCircle, cls: 'text-red-400', title: t('security.verConfirmed') },
    false_positive: { icon: faXmark, cls: 'text-green-500', title: t('security.verFalsePositive') },
    unverified: { icon: faCircleQuestion, cls: 'text-gray-600', title: t('security.verUnverified') },
  };

  return (
    <aside className="w-64 border-r border-[#30363d] bg-[#0d1117] flex flex-col overflow-hidden flex-shrink-0">
      <div className="p-3 text-[11px] uppercase font-bold text-gray-500 tracking-wider">
        {t('security.title')}
      </div>

      {/* Переключатель SAST / DAST / Аудит */}
      <div className="flex mx-3 mb-2 rounded overflow-hidden border border-[#30363d] text-[10px] font-semibold flex-shrink-0">
        <button
          onClick={() => setView('code')}
          className={`flex-1 py-1 transition-colors ${codeMode ? 'bg-red-600/20 text-red-400' : 'text-gray-500 hover:text-gray-300'}`}
        >
          {t('security.viewScan')}
        </button>
        <button
          onClick={() => setView('pentest')}
          className={`flex-1 py-1 transition-colors ${pentestMode ? 'bg-red-600/20 text-red-400' : 'text-gray-500 hover:text-gray-300'}`}
          title={t('security.pentestTitle')}
        >
          {t('security.viewPentest')}
        </button>
        <button
          onClick={() => setView('audit')}
          className={`flex-1 py-1 transition-colors ${auditMode ? 'bg-red-600/20 text-red-400' : 'text-gray-500 hover:text-gray-300'}`}
          title={t('security.auditTitle')}
        >
          {t('security.viewAudit')}
        </button>
      </div>

      {auditMode && (
        <AuditView
          hasWorkspace={hasWorkspace}
          report={auditReport}
          running={auditRunning}
          error={auditError}
          onRun={onAuditRun}
          onOpenFile={(path) => onOpenFinding(path, 1)}
          onExportHtml={onAuditExportHtml}
        />
      )}

      {pentestMode && (
        <PentestView
          tools={pentestTools}
          report={pentestReport}
          scanning={pentestScanning}
          error={pentestError}
          loadTools={onPentestLoadTools}
          onScan={onPentestScan}
        />
      )}

      {!pentestMode && !auditMode && !hasWorkspace && (
        <div className="p-4 text-center">
          <FontAwesomeIcon icon={faFolderOpen} className="text-3xl text-gray-600 mb-2" />
          <p className="text-xs text-gray-500">{t('security.openProjectHint1')}<br />{t('security.openProjectHint2')}</p>
        </div>
      )}

      {!pentestMode && !auditMode && hasWorkspace && (
        <>
          {/* Tools availability */}
          {tools && (
            <div className="px-3 pb-2 flex flex-wrap gap-1">
              {TOOL_NAMES.map(([key, name]) => (
                <span
                  key={key}
                  title={tools[key] ? t('security.toolAvailable', { name }) : t('security.toolMissing', { name })}
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
              {scanning ? t('security.scanning') : t('security.scanProject')}
            </button>
            <label className="flex items-center text-[10px] text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={verify}
                onChange={e => setVerify(e.target.checked)}
                className="mr-1.5 accent-red-500"
              />
              {t('security.verify')}
            </label>
            <button
              onClick={onToggleWatch}
              className={`w-full text-[10px] py-1 rounded border transition-colors flex items-center justify-center ${
                watching
                  ? 'bg-green-600/20 border-green-500/40 text-green-400'
                  : 'border-[#30363d] bg-[#161b22] text-gray-400 hover:border-green-500/40 hover:text-green-300'}`}
              title={t('security.watchTitle')}
            >
              {watching
                ? t('security.watchOn') + (lastWatchScan ? t('security.watchLast', { time: lastWatchScan }) : '')
                : t('security.watchOff')}
            </button>

            {/* Baseline + SARIF */}
            <div className="flex space-x-1.5 pt-1">
              {baseline ? (
                <>
                  <div
                    className="flex-1 text-[9px] text-gray-500 bg-[#161b22] border border-[#30363d] rounded px-2 py-1 truncate"
                    title={t('security.baselineTitle', { date: baseline.created_at }) + (baseline.head ? t('security.baselineCommit', { head: baseline.head }) : '')}
                  >
                    <FontAwesomeIcon icon={faBookmark} className="mr-1 text-blue-400" />
                    {t('security.baselineLabel', { count: baseline.findings })} {baseline.head && `· ${baseline.head}`}
                  </div>
                  <button
                    onClick={onDropBaseline}
                    disabled={busyBaseline}
                    className="px-2 text-[10px] text-gray-500 hover:text-red-400 border border-[#30363d] rounded transition-colors disabled:opacity-40"
                    title={t('security.dropBaseline')}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </>
              ) : (
                <button
                  onClick={onSaveBaseline}
                  disabled={busyBaseline || scanning}
                  className="flex-1 text-[10px] py-1 rounded border border-[#30363d] bg-[#161b22] text-gray-400 hover:text-blue-300 hover:border-blue-500/40 transition-colors disabled:opacity-40 flex items-center justify-center"
                  title={t('security.baselineSaveTitle')}
                >
                  <FontAwesomeIcon icon={faBookmark} className="mr-1" />
                  {busyBaseline ? t('security.baselineSaving') : t('security.makeBaseline')}
                </button>
              )}
              <button
                onClick={onDownloadSarif}
                disabled={scanning}
                className="px-2 text-[10px] text-gray-500 hover:text-green-400 border border-[#30363d] rounded transition-colors disabled:opacity-40"
                title={t('security.sarifTitle')}
              >
                <FontAwesomeIcon icon={faFileExport} />
              </button>
            </div>
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
                  <div className="flex items-center space-x-2 text-[10px] flex-wrap gap-y-1">
                    <span className="text-red-400 font-bold">{report.summary.by_severity.critical} {t('security.sumCrit')}</span>
                    <span className="text-yellow-400 font-bold">{report.summary.by_severity.warning} {t('security.sumWarn')}</span>
                    <span className="text-blue-400 font-bold">{report.summary.by_severity.info} {t('security.sumInfo')}</span>
                    {report.summary.confirmed > 0 && (
                      <span className="text-gray-400">{t('security.confirmed', { count: report.summary.confirmed })}</span>
                    )}
                    {report.summary.suppressed > 0 && (
                      <span className="text-gray-600" title={t('security.suppressedTitle')}>
                        {t('security.suppressed', { count: report.summary.suppressed })}
                      </span>
                    )}
                  </div>
                  {/* Baseline diff */}
                  {report.diff && report.baseline && (
                    <div className="flex items-center space-x-2 text-[10px]">
                      <span className={report.diff.new > 0 ? 'text-red-400 font-bold' : 'text-gray-500'}>
                        {t('security.diffNew', { count: report.diff.new })}
                      </span>
                      <span className={report.diff.fixed > 0 ? 'text-green-400 font-bold' : 'text-gray-500'}>
                        {t('security.diffFixed', { count: report.diff.fixed })}
                      </span>
                      <span className="text-gray-600 code-font text-[9px]">vs {report.baseline.head ?? report.baseline.created_at.slice(0, 10)}</span>
                    </div>
                  )}
                  {/* Coverage */}
                  <div
                    className="text-[9px] text-gray-600"
                    title={t('security.coverageTitle', {
                      total: report.coverage.total_files,
                      code: report.coverage.code_files,
                      sast: report.coverage.sast_scanned,
                      secrets: report.coverage.secrets_scanned,
                      bin: report.coverage.skipped.binary,
                      large: report.coverage.skipped.too_large,
                      noncode: report.coverage.skipped.non_code,
                    })}
                  >
                    {t('security.coverage', { sast: report.coverage.sast_scanned, code: report.coverage.code_files })}
                    {(report.coverage.skipped.binary + report.coverage.skipped.too_large) > 0 &&
                      t('security.coverageSkipped', { count: report.coverage.skipped.binary + report.coverage.skipped.too_large })}
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
                    {t('security.noFindings')}
                  </p>
                )}
                {report.findings.map(f => {
                  const v = verIcon[f.verification.status];
                  return (
                    <button
                      key={f.id}
                      onClick={() => onOpenFinding(f.path, f.line_start)}
                      className={`w-full text-left px-3 py-2 border-b border-[#21262d] hover:bg-[#161b22] transition-colors ${
                        f.suppressed || f.verification.status === 'false_positive' ? 'opacity-45' : ''
                      }`}
                      title={`${f.path}:${f.line_start}\n${f.message}${f.suppressed ? t('security.suppressedNote') : ''}${f.verification.rationale ? t('security.verifierNote', { rationale: f.verification.rationale }) : ''}`}
                    >
                      <div className="flex items-center space-x-1.5">
                        <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${sevBadge[f.severity]}`}>
                          {sevLabel[f.severity]}
                        </span>
                        {f.is_new === true && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded text-red-300 bg-red-500/20 border border-red-500/30">
                            {t('security.badgeNew')}
                          </span>
                        )}
                        {f.suppressed && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded text-gray-500 bg-gray-500/20">
                            {t('security.badgeSuppr')}
                          </span>
                        )}
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
                  {t('security.scanDesc1')}<br />
                  {t('security.scanDesc2')}<br />
                  {t('security.scanDesc3')}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
