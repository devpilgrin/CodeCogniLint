import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDatabase, faFolderOpen,
  faXmark, faTriangleExclamation, faPlus, faPencil, faTrash,
} from '@fortawesome/free-solid-svg-icons';
import type { Rule, AnalysisResult, TreeNode, WorkspaceInfo, SecurityReport, SecurityBaselineInfo, PentestReport, AuditReport, QualityReport } from '../types';
import { settingsApi } from '../services/api';
import { FileTree } from './FileTree';
import { GitPanel } from './GitPanel';
import { SecurityPanel } from './SecurityPanel';
import { QualityPanel } from './QualityPanel';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useI18n, LOCALES } from '../i18n';

interface Props {
  panel: 'explorer' | 'search' | 'git' | 'rules' | 'settings' | 'security' | 'quality';
  workspace: WorkspaceInfo | null;
  tree: TreeNode | null;
  activeFile: string | null;
  resultsByFile: Record<string, AnalysisResult>;
  backendOnline: boolean;
  onFileOpen: (path: string) => void;
  onReviewCommit: (sha: string) => void;
  onOpenPicker: () => void;
  onCloseWorkspace: () => void;
  rules: Rule[];
  onDeleteRule: (id: string) => void;
  onToggleRule: (id: string, enabled: boolean) => void;
  onCreateRuleManually: () => void;
  onEditRule: (rule: Rule) => void;
  // Security scan
  securityTools: Record<string, boolean> | null;
  securityReport: SecurityReport | null;
  securityBaseline: SecurityBaselineInfo | null;
  securityScanning: boolean;
  securityBusyBaseline: boolean;
  securityError: string | null;
  securityWatching: boolean;
  securityLastWatchScan: string | null;
  onSecurityToggleWatch: () => void;
  onSecurityScan: (verify: boolean) => void;
  onSecuritySaveBaseline: () => void;
  onSecurityDropBaseline: () => void;
  onSecuritySarif: () => void;
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
  // Качество кода
  qualityTools: Record<string, boolean> | null;
  qualityReport: QualityReport | null;
  qualityScanning: boolean;
  qualityError: string | null;
  onQualityScan: (review: boolean) => void;
}

const categoryColor: Record<string, string> = {
  syntax:   'text-blue-400 bg-blue-400/10',
  semantic: 'text-purple-400 bg-purple-400/10',
  analysis: 'text-orange-400 bg-orange-400/10',
};

const categoryLabelKey = (cat: string) =>
  'rules.category' + cat.charAt(0).toUpperCase() + cat.slice(1);

function SettingsPanel() {
  const { t, locale, setLocale } = useI18n();
  const [provider, setProvider] = useState('lmstudio');
  const [baseUrl, setBaseUrl] = useState('http://localhost:1234/v1');
  const [model, setModel] = useState('local-model');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    settingsApi.get().then(s => {
      setProvider(s.provider);
      setBaseUrl(s.baseUrl);
      setModel(s.model);
    }).catch(() => { /* backend offline */ });
  }, []);

  const handleSave = async () => {
    setStatus('saving');
    try {
      await settingsApi.update({
        provider: provider as 'lmstudio' | 'openai' | 'anthropic',
        baseUrl, model, apiKey: apiKey || undefined,
      });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  return (
    <aside className="w-64 border-r border-border-default bg-bg-canvas flex flex-col overflow-hidden flex-shrink-0">
      <div className="p-3 text-xs uppercase font-bold text-text-muted tracking-wider">{t('sidebar.settingsTitle')}</div>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 space-y-4 pb-4">
        <div>
          <label className="text-[10px] text-text-muted uppercase font-semibold block mb-1">{t('settings.language')}</label>
          <select
            value={locale}
            onChange={e => setLocale(e.target.value as typeof locale)}
            className="w-full bg-bg-surface border border-border-default rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          >
            {LOCALES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-text-muted uppercase font-semibold block mb-1">{t('sidebar.provider')}</label>
          <select
            value={provider}
            onChange={e => setProvider(e.target.value)}
            className="w-full bg-bg-surface border border-border-default rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="lmstudio">{t('sidebar.providerLmstudio')}</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-text-muted uppercase font-semibold block mb-1">Base URL</label>
          <input
            type="text"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            className="w-full bg-bg-surface border border-border-default rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 code-font"
          />
        </div>
        <div>
          <label className="text-[10px] text-text-muted uppercase font-semibold block mb-1">{t('sidebar.model')}</label>
          <input
            type="text"
            value={model}
            onChange={e => setModel(e.target.value)}
            className="w-full bg-bg-surface border border-border-default rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 code-font"
          />
        </div>
        <div>
          <label className="text-[10px] text-text-muted uppercase font-semibold block mb-1">{t('sidebar.apiKeyOptional')}</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full bg-bg-surface border border-border-default rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 code-font"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={status === 'saving'}
          className={`w-full text-xs py-1.5 rounded transition-colors border ${
            status === 'saved'  ? 'bg-green-600/20 border-green-500/30 text-green-400' :
            status === 'error'  ? 'bg-red-600/20 border-red-500/30 text-red-400' :
            'bg-blue-600/20 hover:bg-blue-600/40 border-blue-500/30 text-blue-400'
          }`}
        >
          {status === 'saving' ? t('sidebar.saving') :
           status === 'saved'  ? t('sidebar.saved') :
           status === 'error'  ? t('sidebar.saveError') : t('sidebar.saveSettings')}
        </button>
      </div>
    </aside>
  );
}

export function Sidebar(props: Props) {
  const { t } = useI18n();
  const [ruleToDelete, setRuleToDelete] = useState<Rule | null>(null);
  const {
    panel, workspace, tree, activeFile, resultsByFile, backendOnline,
    onFileOpen, onReviewCommit, onOpenPicker, onCloseWorkspace,
    rules, onDeleteRule, onToggleRule, onCreateRuleManually, onEditRule,
  } = props;

  if (panel === 'rules') {
    const activeCount = rules.filter(r => r.enabled).length;
    return (
      <>
      <aside className="w-64 border-r border-border-default bg-bg-canvas flex flex-col overflow-hidden flex-shrink-0">
        <div className="p-3 text-xs uppercase font-bold text-text-muted tracking-wider flex justify-between items-center">
          <span>{t('sidebar.rules')} {rules.length > 0 && <span className="text-text-secondary normal-case">({t('sidebar.rulesActive', { active: activeCount, total: rules.length })})</span>}</span>
          <button
            onClick={onCreateRuleManually}
            className="text-blue-400 hover:text-blue-300 transition-colors"
            title={t('sidebar.createRuleManuallyTitle')}
            aria-label={t('sidebar.createRuleManuallyTitle')}
          >
            <FontAwesomeIcon icon={faPlus} />
          </button>
        </div>

        {/* New rule button — prominent at top */}
        <button
          onClick={onCreateRuleManually}
          className="mx-2 mb-2 py-1.5 text-xs bg-blue-600/15 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 rounded transition-colors flex items-center justify-center"
        >
          <FontAwesomeIcon icon={faPlus} className="mr-1.5" />
          {t('sidebar.newRule')}
        </button>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-2 pb-4">
          {rules.length === 0 && (
            <div className="text-center mt-6 px-2">
              <p className="text-xs text-text-muted leading-relaxed">
                {t('sidebar.noRulesLine1')}<br />
                {t('sidebar.noRulesLine2')}<br />
                {t('sidebar.noRulesLine3')}
              </p>
            </div>
          )}
          {rules.map(rule => (
            <div
              key={rule.id}
              className={`bg-bg-surface border rounded p-2 space-y-1.5 transition-colors ${
                rule.enabled ? 'border-border-default' : 'border-border-default opacity-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${categoryColor[rule.category]}`}>
                  {t(categoryLabelKey(rule.category)).toUpperCase()}
                </span>
                <button
                  onClick={() => onToggleRule(rule.id, !rule.enabled)}
                  className={`text-[11px] px-2 py-0.5 rounded font-semibold transition-colors ${
                    rule.enabled
                      ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                      : 'bg-gray-600/30 text-text-muted hover:bg-gray-500/40'
                  }`}
                  title={rule.enabled ? t('rules.clickToDisable') : t('rules.clickToEnable')}
                >
                  {rule.enabled ? t('rules.stateActive') : t('rules.stateInactive')}
                </button>
              </div>
              <p className="text-xs text-text-primary leading-relaxed font-medium">{rule.description}</p>
              <p className="text-xs text-text-muted leading-relaxed line-clamp-3">{rule.pattern_description}</p>
              <div className="flex justify-end space-x-1 pt-1 border-t border-border-default">
                <button
                  onClick={() => onEditRule(rule)}
                  className="px-2 py-0.5 text-[11px] text-text-secondary hover:text-blue-300 transition-colors flex items-center"
                  title={t('common.edit')}
                >
                  <FontAwesomeIcon icon={faPencil} className="mr-1" />
                  {t('common.edit')}
                </button>
                <button
                  onClick={() => setRuleToDelete(rule)}
                  className="px-2 py-0.5 text-[11px] text-text-secondary hover:text-red-400 transition-colors flex items-center"
                  title={t('common.delete')}
                >
                  <FontAwesomeIcon icon={faTrash} className="mr-1" />
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>
      {ruleToDelete && (
        <ConfirmDialog
          title={t('rules.deleteConfirmTitle')}
          body={t('rules.deleteConfirm', { description: ruleToDelete.description })}
          confirmLabel={t('common.delete')}
          onConfirm={() => {
            onDeleteRule(ruleToDelete.id);
            setRuleToDelete(null);
          }}
          onCancel={() => setRuleToDelete(null)}
        />
      )}
      </>
    );
  }

  if (panel === 'settings') {
    return <SettingsPanel />;
  }

  if (panel === 'git') {
    return <GitPanel workspace={workspace} onFileOpen={onFileOpen} onReviewCommit={onReviewCommit} />;
  }

  if (panel === 'security') {
    return (
      <SecurityPanel
        hasWorkspace={workspace !== null}
        tools={props.securityTools}
        report={props.securityReport}
        baseline={props.securityBaseline}
        scanning={props.securityScanning}
        busyBaseline={props.securityBusyBaseline}
        error={props.securityError}
        watching={props.securityWatching}
        lastWatchScan={props.securityLastWatchScan}
        onToggleWatch={props.onSecurityToggleWatch}
        onScan={props.onSecurityScan}
        onSaveBaseline={props.onSecuritySaveBaseline}
        onDropBaseline={props.onSecurityDropBaseline}
        onDownloadSarif={props.onSecuritySarif}
        onOpenFinding={props.onOpenFinding}
        pentestTools={props.pentestTools}
        pentestReport={props.pentestReport}
        pentestScanning={props.pentestScanning}
        pentestError={props.pentestError}
        onPentestLoadTools={props.onPentestLoadTools}
        onPentestScan={props.onPentestScan}
        auditReport={props.auditReport}
        auditRunning={props.auditRunning}
        auditError={props.auditError}
        onAuditRun={props.onAuditRun}
        onAuditExportHtml={props.onAuditExportHtml}
      />
    );
  }

  if (panel === 'quality') {
    return (
      <QualityPanel
        hasWorkspace={workspace !== null}
        tools={props.qualityTools}
        report={props.qualityReport}
        scanning={props.qualityScanning}
        error={props.qualityError}
        onScan={props.onQualityScan}
        onOpenFinding={props.onOpenFinding}
      />
    );
  }

  // Explorer panel
  return (
    <aside className="w-64 border-r border-border-default bg-bg-canvas flex flex-col overflow-hidden flex-shrink-0">
      <div className="p-3 text-xs uppercase font-bold text-text-muted tracking-wider flex justify-between items-center">
        <span>{t('sidebar.explorer')}</span>
        <button
          onClick={onOpenPicker}
          className="text-text-secondary hover:text-white transition-colors text-xs"
          title={t('sidebar.openOrSwitchProject')}
          aria-label={t('sidebar.openOrSwitchProject')}
        >
          <FontAwesomeIcon icon={faFolderOpen} />
        </button>
      </div>

      {/* Backend offline warning */}
      {!backendOnline && (
        <div className="mx-2 my-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-400 flex items-start">
          <FontAwesomeIcon icon={faTriangleExclamation} className="mr-1.5 mt-0.5 flex-shrink-0" />
          <span>{t('sidebar.backendOfflineLine1')}<br />{t('sidebar.backendOfflineLine2')}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar text-sm">
        {/* Workspace header */}
        {workspace && (
          <div className="px-3 py-2 bg-bg-surface border-b border-border-default flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-gray-200 font-semibold truncate" title={workspace.path}>
                {workspace.name}
              </div>
              <div className="text-[11px] text-text-muted truncate code-font">{workspace.path}</div>
            </div>
            <button
              onClick={onCloseWorkspace}
              className="ml-2 text-text-muted hover:text-red-400 text-xs"
              title={t('sidebar.closeProject')}
              aria-label={t('sidebar.closeProject')}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        )}

        {/* No workspace state */}
        {!workspace && backendOnline && (
          <div className="p-4 text-center">
            <FontAwesomeIcon icon={faFolderOpen} className="text-3xl text-gray-600 mb-2" />
            <p className="text-xs text-text-muted mb-3">
              {t('sidebar.openFolderHint1')}<br />{t('sidebar.openFolderHint2')}
            </p>
            <button
              onClick={onOpenPicker}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-1.5 rounded transition-colors"
            >
              {t('sidebar.openProject')}
            </button>
          </div>
        )}

        {/* File tree */}
        {workspace && tree && (
          <div className="py-1">
            <FileTree
              root={tree}
              activeFile={activeFile}
              resultsByFile={resultsByFile}
              onFileOpen={onFileOpen}
            />
          </div>
        )}

        {workspace && !tree && (
          <p className="text-xs text-text-muted text-center py-4">{t('sidebar.loadingTree')}</p>
        )}

        {/* Problems summary */}
        {Object.keys(resultsByFile).length > 0 && (
          <>
            <div className="mt-4 p-3 text-xs uppercase font-bold text-text-muted tracking-wider border-t border-border-default">
              <FontAwesomeIcon icon={faDatabase} className="mr-1" /> {t('sidebar.problems')}
            </div>
            <div className="px-3 space-y-1 pb-4">
              {Object.entries(resultsByFile).map(([path, res]) => (
                res.violations.length > 0 && (
                  <button
                    key={path}
                    onClick={() => onFileOpen(path)}
                    className="w-full text-left text-xs text-text-secondary hover:text-blue-300 py-0.5 flex justify-between"
                  >
                    <span className="truncate" title={path}>{path.split('/').pop()}</span>
                    <span className="text-orange-400 ml-2 flex-shrink-0">{res.violations.length}</span>
                  </button>
                )
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer with workspace actions */}
      {workspace && (
        <div className="p-2 border-t border-border-default">
          <button
            onClick={onOpenPicker}
            className="w-full text-xs text-text-secondary hover:text-white py-1 px-2 rounded hover:bg-bg-overlay transition-colors flex items-center justify-center"
          >
            <FontAwesomeIcon icon={faFolderOpen} className="mr-1.5" />
            {t('sidebar.switchProject')}
          </button>
        </div>
      )}
    </aside>
  );
}
