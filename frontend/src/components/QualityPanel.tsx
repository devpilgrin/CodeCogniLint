import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faGaugeHigh, faSpinner, faTriangleExclamation, faFolderOpen,
  faFire, faFileCode, faChartSimple, faBolt, faArrowRight,
} from '@fortawesome/free-solid-svg-icons';
import type { QualityFinding, QualityHotspot } from '../types';
import { useI18n } from '../i18n';
import { severityText } from './ui/severity';

interface Props {
  hasWorkspace: boolean;
  tools: Record<string, boolean> | null;
  report: import('../types').QualityReport | null;
  scanning: boolean;
  error: string | null;
  onScan: (review: boolean) => void;
  onOpenFinding: (path: string, line: number) => void;
}

const catStyle: Record<string, string> = {
  performance: 'bg-orange-500/15 border-orange-500/40 text-orange-400',
  'best-practices': 'bg-blue-500/15 border-blue-500/40 text-blue-400',
};

function FindingRow({ f, onOpen }: { f: QualityFinding; onOpen: (p: string, l: number) => void }) {
  const { t } = useI18n();
  const catLabel: Record<string, string> = {
    performance: t('qcat.performance'),
    'best-practices': t('qcat.bestPractices'),
  };
  return (
    <button
      onClick={() => onOpen(f.path, f.line_start)}
      className={`w-full text-left px-2 py-1.5 rounded border mb-1 transition-colors hover:border-blue-500/40 ${
        f.suppressed ? 'opacity-40 border-bg-overlay' : 'border-border-default bg-bg-surface'}`}
      title={`${f.path}:${f.line_start}`}
    >
      <div className="flex items-center space-x-1.5">
        <span className={`${severityText[f.severity]} text-xs`}>●</span>
        <span className={`text-[11px] px-1 rounded border ${catStyle[f.category ?? 'best-practices']}`}>
          {catLabel[f.category ?? 'best-practices']}
        </span>
        <span className="text-xs text-text-muted code-font">{f.rule_id}</span>
        {f.suppressed && <span className="text-[11px] text-gray-600">SUPP</span>}
      </div>
      <div className="text-xs text-text-primary mt-0.5">{f.title}</div>
      <div className="text-xs text-text-muted code-font truncate">{f.path}:{f.line_start}</div>
    </button>
  );
}

function HotspotCard({ h, onOpen }: { h: QualityHotspot; onOpen: (p: string, l: number) => void }) {
  return (
    <div className="mx-2 mb-2 p-2 rounded border border-orange-500/25 bg-orange-950/10">
      <button onClick={() => onOpen(h.path, 1)} className="w-full text-left">
        <div className="flex items-center text-xs">
          <FontAwesomeIcon icon={faFire} className="text-orange-400 mr-1.5" />
          <span className="text-gray-200 code-font truncate">{h.path}</span>
          <span className="ml-auto text-orange-400 font-bold flex-shrink-0">{h.score}</span>
        </div>
        <div className="text-xs text-text-muted mt-0.5">{h.reasons.join('; ')}</div>
      </button>
      {h.llm && (
        <div className="mt-1.5 pt-1.5 border-t border-orange-500/20">
          <p className="text-xs text-text-primary">{h.llm.assessment}</p>
          {h.llm.perf_risks.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {h.llm.perf_risks.map((r, i) => (
                <li key={i} className="text-xs text-orange-300 flex items-start">
                  <FontAwesomeIcon icon={faBolt} className="mr-1 mt-0.5 flex-shrink-0 text-[10px]" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
          {h.llm.simplification_steps.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {h.llm.simplification_steps.map((s, i) => (
                <li key={i} className="text-xs text-text-secondary flex items-start">
                  <FontAwesomeIcon icon={faArrowRight} className="mr-1 mt-0.5 flex-shrink-0 text-[10px]" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function QualityPanel({ hasWorkspace, tools, report, scanning, error, onScan, onOpenFinding }: Props) {
  const { t } = useI18n();
  const [review, setReview] = useState(false);
  const [tab, setTab] = useState<'hotspots' | 'findings' | 'metrics'>('hotspots');

  const catLabel: Record<string, string> = {
    performance: t('qcat.performance'),
    'best-practices': t('qcat.bestPractices'),
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pb-3 border-b border-border-default space-y-1.5">
        {/* Инструменты */}
        <div className="flex flex-wrap gap-1">
          {tools && Object.entries(tools).map(([name, ok]) => (
            <span key={name}
              className={`text-[11px] px-1.5 py-0.5 rounded border ${ok
                ? 'text-green-400 border-green-500/30 bg-green-900/10'
                : 'text-gray-600 border-border-default'}`}
              title={`${name}: ${ok ? t('quality.toolAvailable') : t('quality.toolMissing')}`}>
              {name}
            </span>
          ))}
        </div>
        <button
          onClick={() => onScan(review)}
          disabled={!hasWorkspace || scanning}
          className="w-full text-xs py-1.5 rounded transition-colors border bg-orange-600/20 hover:bg-orange-600/40 border-orange-500/30 text-orange-300 disabled:opacity-40 flex items-center justify-center"
        >
          {scanning
            ? <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5" />
            : <FontAwesomeIcon icon={faGaugeHigh} className="mr-1.5" />}
          {scanning ? t('quality.scanning') : t('quality.scan')}
        </button>
        <label className="flex items-center text-xs text-text-muted cursor-pointer select-none">
          <input type="checkbox" checked={review} onChange={e => setReview(e.target.checked)} className="mr-1.5 accent-orange-500" />
          {t('quality.review')}
        </label>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pb-4">
        {!hasWorkspace && (
          <div className="p-4 text-center">
            <FontAwesomeIcon icon={faFolderOpen} className="text-3xl text-gray-600 mb-2" />
            <p className="text-xs text-text-muted">{t('quality.openProject')}</p>
          </div>
        )}
        {error && (
          <div className="mx-2 mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-400 flex items-start">
            <FontAwesomeIcon icon={faTriangleExclamation} className="mr-1.5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {report && (
          <>
            {/* Сводка */}
            <div className="grid grid-cols-3 gap-1 mx-2 mt-2 text-center">
              <div className="p-1.5 rounded bg-bg-surface border border-border-default">
                <div className="text-sm font-bold text-gray-200">{report.metrics.total_loc.toLocaleString()}</div>
                <div className="text-[11px] text-text-muted">LOC</div>
              </div>
              <div className="p-1.5 rounded bg-bg-surface border border-border-default">
                <div className="text-sm font-bold text-gray-200">{report.metrics.total_code_files}</div>
                <div className="text-[11px] text-text-muted">{t('quality.files')}</div>
              </div>
              <div className="p-1.5 rounded bg-bg-surface border border-border-default">
                <div className="text-sm font-bold text-orange-400">{report.total_findings}</div>
                <div className="text-[11px] text-text-muted">{t('quality.findings')}</div>
              </div>
            </div>
            <div className="flex mx-2 mt-1.5 text-[11px] space-x-2 text-text-muted">
              {Object.entries(report.by_category).map(([c, n]) => (
                <span key={c} className={`px-1 rounded border ${catStyle[c] ?? ''}`}>{catLabel[c] ?? c}: {n}</span>
              ))}
            </div>

            {/* Вкладки */}
            <div className="flex mx-2 mt-2 rounded overflow-hidden border border-border-default text-xs font-semibold">
              {([['hotspots', t('quality.tabHotspots')], ['findings', t('quality.tabFindings', { count: report.total_findings })], ['metrics', t('quality.tabMetrics')]] as const).map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`flex-1 py-1 transition-colors ${tab === id ? 'bg-orange-600/20 text-orange-300' : 'bg-bg-surface text-text-muted hover:text-text-primary'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-2">
              {tab === 'hotspots' && (
                <>
                  {report.hotspots.length === 0 && (
                    <p className="px-3 text-xs text-text-muted">{t('quality.noHotspots')}</p>
                  )}
                  {report.hotspots.map(h => <HotspotCard key={h.path} h={h} onOpen={onOpenFinding} />)}
                </>
              )}
              {tab === 'findings' && (
                <div className="px-2">
                  {report.findings.length === 0 && (
                    <p className="text-xs text-text-muted">{t('quality.noFindings')}</p>
                  )}
                  {report.findings.map(f => <FindingRow key={f.id} f={f} onOpen={onOpenFinding} />)}
                </div>
              )}
              {tab === 'metrics' && (
                <div className="px-2 space-y-2">
                  {report.metrics.big_files.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase font-bold text-text-muted mb-1 flex items-center">
                        <FontAwesomeIcon icon={faFileCode} className="mr-1" />
                        {t('quality.bigFiles', { loc: report.metrics.thresholds.file_loc })}
                      </div>
                      {report.metrics.big_files.map(f => (
                        <button key={f.path} onClick={() => onOpenFinding(f.path, 1)}
                          className="w-full text-left text-xs text-text-primary hover:text-blue-300 code-font flex justify-between px-1 py-0.5">
                          <span className="truncate">{f.path}</span><span className="text-text-muted">{f.loc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {report.metrics.long_functions.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase font-bold text-text-muted mb-1 flex items-center">
                        <FontAwesomeIcon icon={faChartSimple} className="mr-1" />
                        {t('quality.longFunctions', { loc: report.metrics.thresholds.func_loc })}
                      </div>
                      {report.metrics.long_functions.map(f => (
                        <button key={`${f.file}:${f.line}`} onClick={() => onOpenFinding(f.file, f.line)}
                          className="w-full text-left text-xs text-text-primary hover:text-blue-300 code-font flex justify-between px-1 py-0.5">
                          <span className="truncate">{f.name} · {f.file}:{f.line}</span><span className="text-text-muted">{f.loc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {report.metrics.complex_functions.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase font-bold text-text-muted mb-1">
                        {t('quality.complexFunctions', { cc: report.metrics.thresholds.func_cc })}
                      </div>
                      {report.metrics.complex_functions.map(f => (
                        <button key={`${f.file}:${f.line}`} onClick={() => onOpenFinding(f.file, f.line)}
                          className="w-full text-left text-xs text-text-primary hover:text-blue-300 code-font flex justify-between px-1 py-0.5">
                          <span className="truncate">{f.name} · {f.file}:{f.line}</span><span className="text-orange-400">CC={f.cc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
