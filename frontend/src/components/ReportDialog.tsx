import { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTimes, faFileExcel, faFileLines, faSpinner,
  faChartBar, faFolderOpen,
} from '@fortawesome/free-solid-svg-icons';
import type { AnalysisResult } from '../types';
import { reportsApi } from '../services/api';
import { useI18n } from '../i18n';

interface Props {
  resultsByFile: Record<string, AnalysisResult>;
  onClose: () => void;
  onFileOpen?: (path: string) => void;
}

const CATEGORY_KEYS: Record<string, string> = {
  syntax: 'rules.categorySyntax',
  semantic: 'rules.categorySemantic',
  analysis: 'rules.categoryAnalysis',
};

const SEVERITY_KEYS: Record<string, string> = {
  critical: 'report.sevCritical',
  warning: 'report.sevWarning',
  info: 'report.sevInfo',
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'text-orange-400',
  warning:  'text-yellow-400',
  info:     'text-blue-400',
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ReportDialog({ resultsByFile, onClose, onFileOpen }: Props) {
  const { t } = useI18n();
  const [exporting, setExporting] = useState<'xlsx' | 'md' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const entries = Object.entries(resultsByFile);
    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let totalViolations = 0;

    const perFile = entries.map(([path, r]) => {
      const violations = r?.violations ?? [];
      const critical = violations.filter(v => v.severity === 'critical').length;
      const warning = violations.filter(v => v.severity === 'warning').length;
      const info = violations.filter(v => v.severity === 'info').length;
      totalViolations += violations.length;
      for (const v of violations) {
        byCategory[v.category] = (byCategory[v.category] ?? 0) + 1;
        bySeverity[v.severity] = (bySeverity[v.severity] ?? 0) + 1;
      }
      return { path, total: violations.length, critical, warning, info };
    }).sort((a, b) => b.total - a.total);

    return {
      totalFiles: entries.length,
      totalViolations,
      byCategory,
      bySeverity,
      perFile,
    };
  }, [resultsByFile]);

  const handleExport = async (format: 'xlsx' | 'md') => {
    setExporting(format);
    setExportError(null);
    try {
      const blob = format === 'xlsx'
        ? await reportsApi.xlsx(resultsByFile as Record<string, unknown>)
        : await reportsApi.md(resultsByFile as Record<string, unknown>);
      const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      downloadBlob(blob, `hybrid-report-${ts}.${format}`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t('report.exportError'));
    } finally {
      setExporting(null);
    }
  };

  const isEmpty = stats.totalFiles === 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl w-full max-w-3xl flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#30363d]">
          <h3 className="text-base font-bold text-white flex items-center">
            <FontAwesomeIcon icon={faChartBar} className="mr-2 text-blue-400" />
            {t('report.title')}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
          {isEmpty ? (
            <div className="text-center py-16">
              <FontAwesomeIcon icon={faChartBar} className="text-4xl text-gray-700 mb-3" />
              <p className="text-sm text-gray-400">{t('report.noData')}</p>
              <p className="text-xs text-gray-600 mt-1">{t('report.noDataHint')}</p>
            </div>
          ) : (
            <>
              {/* Top stats cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0d1117] border border-[#30363d] rounded p-3">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold">{t('report.files')}</p>
                  <p className="text-2xl font-bold text-blue-400 mt-1">{stats.totalFiles}</p>
                </div>
                <div className="bg-[#0d1117] border border-[#30363d] rounded p-3">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold">{t('report.violations')}</p>
                  <p className="text-2xl font-bold text-orange-400 mt-1">{stats.totalViolations}</p>
                </div>
              </div>

              {/* Categories / Severities */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0d1117] border border-[#30363d] rounded p-3">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold mb-2">{t('report.byCategory')}</p>
                  {Object.keys(stats.byCategory).length === 0 ? (
                    <p className="text-xs text-gray-600">—</p>
                  ) : (
                    Object.entries(stats.byCategory)
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs py-0.5">
                          <span className="text-gray-300">{t(CATEGORY_KEYS[k] ?? '') || k}</span>
                          <span className="text-gray-100 font-semibold">{v}</span>
                        </div>
                      ))
                  )}
                </div>
                <div className="bg-[#0d1117] border border-[#30363d] rounded p-3">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold mb-2">{t('report.bySeverity')}</p>
                  {Object.keys(stats.bySeverity).length === 0 ? (
                    <p className="text-xs text-gray-600">—</p>
                  ) : (
                    Object.entries(stats.bySeverity)
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs py-0.5">
                          <span className={SEVERITY_COLOR[k] ?? 'text-gray-300'}>
                            {t(SEVERITY_KEYS[k] ?? '') || k}
                          </span>
                          <span className="text-gray-100 font-semibold">{v}</span>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Per-file table */}
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-semibold mb-2">
                  {t('report.byFiles')}
                </p>
                <div className="bg-[#0d1117] border border-[#30363d] rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-[#21262d]">
                      <tr className="text-left text-[10px] uppercase text-gray-500">
                        <th className="p-2">{t('report.colFile')}</th>
                        <th className="p-2 text-right">{t('report.colTotal')}</th>
                        <th className="p-2 text-right">{t('report.sevCritical')}</th>
                        <th className="p-2 text-right">{t('report.sevWarning')}</th>
                        <th className="p-2 text-right">{t('report.sevInfo')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.perFile.map(f => (
                        <tr
                          key={f.path}
                          className={`border-t border-[#30363d] ${onFileOpen ? 'hover:bg-[#21262d] cursor-pointer' : ''}`}
                          onClick={() => onFileOpen && onFileOpen(f.path)}
                          title={onFileOpen ? t('report.openFile', { path: f.path }) : f.path}
                        >
                          <td className="p-2 text-gray-300 code-font truncate max-w-xs flex items-center">
                            {onFileOpen && <FontAwesomeIcon icon={faFolderOpen} className="mr-2 text-[10px] text-gray-500" />}
                            {f.path}
                          </td>
                          <td className="p-2 text-right text-gray-300 font-semibold">{f.total}</td>
                          <td className={`p-2 text-right ${f.critical > 0 ? 'text-orange-400 font-semibold' : 'text-gray-600'}`}>
                            {f.critical}
                          </td>
                          <td className={`p-2 text-right ${f.warning > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                            {f.warning}
                          </td>
                          <td className={`p-2 text-right ${f.info > 0 ? 'text-blue-400' : 'text-gray-600'}`}>
                            {f.info}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {exportError && (
            <div className="p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-400">
              ⚠️ {exportError}
            </div>
          )}
        </div>

        {/* Footer with export buttons */}
        <div className="flex space-x-2 p-4 border-t border-[#30363d]">
          <button
            onClick={onClose}
            className="px-4 bg-[#30363d] hover:bg-[#484f58] text-gray-300 text-xs py-2 rounded transition-colors"
          >
            {t('common.close')}
          </button>
          <button
            onClick={() => handleExport('md')}
            disabled={isEmpty || exporting !== null}
            className="flex-1 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-blue-300 text-xs py-2 rounded transition-colors flex items-center justify-center"
          >
            {exporting === 'md' ? (
              <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
            ) : (
              <FontAwesomeIcon icon={faFileLines} className="mr-2" />
            )}
            {t('report.exportMd')}
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            disabled={isEmpty || exporting !== null}
            className="flex-1 bg-green-600/20 hover:bg-green-600/40 border border-green-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-green-300 text-xs py-2 rounded transition-colors flex items-center justify-center"
          >
            {exporting === 'xlsx' ? (
              <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
            ) : (
              <FontAwesomeIcon icon={faFileExcel} className="mr-2" />
            )}
            {t('report.exportXlsx')}
          </button>
        </div>
      </div>
    </div>
  );
}
