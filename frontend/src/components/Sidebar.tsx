import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDatabase, faFolderOpen,
  faXmark, faTriangleExclamation, faPlus, faPencil, faTrash,
} from '@fortawesome/free-solid-svg-icons';
import type { Rule, AnalysisResult, TreeNode, WorkspaceInfo, SecurityReport, SecurityBaselineInfo } from '../types';
import { settingsApi } from '../services/api';
import { FileTree } from './FileTree';
import { GitPanel } from './GitPanel';
import { SecurityPanel } from './SecurityPanel';

interface Props {
  panel: 'explorer' | 'search' | 'git' | 'rules' | 'settings' | 'security';
  workspace: WorkspaceInfo | null;
  tree: TreeNode | null;
  activeFile: string | null;
  resultsByFile: Record<string, AnalysisResult>;
  backendOnline: boolean;
  onFileOpen: (path: string) => void;
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
  onSecurityScan: (verify: boolean) => void;
  onSecuritySaveBaseline: () => void;
  onSecurityDropBaseline: () => void;
  onSecuritySarif: () => void;
  onOpenFinding: (path: string, line: number) => void;
}

const categoryColor: Record<string, string> = {
  syntax:   'text-blue-400 bg-blue-400/10',
  semantic: 'text-purple-400 bg-purple-400/10',
  analysis: 'text-orange-400 bg-orange-400/10',
};

function SettingsPanel() {
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
    <aside className="w-64 border-r border-[#30363d] bg-[#0d1117] flex flex-col overflow-hidden flex-shrink-0">
      <div className="p-3 text-[11px] uppercase font-bold text-gray-500 tracking-wider">Настройки LLM</div>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 space-y-4 pb-4">
        <div>
          <label className="text-[10px] text-gray-500 uppercase font-semibold block mb-1">Провайдер</label>
          <select
            value={provider}
            onChange={e => setProvider(e.target.value)}
            className="w-full bg-[#161b22] border border-[#30363d] rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="lmstudio">LM Studio (локальный)</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 uppercase font-semibold block mb-1">Base URL</label>
          <input
            type="text"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            className="w-full bg-[#161b22] border border-[#30363d] rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 code-font"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 uppercase font-semibold block mb-1">Модель</label>
          <input
            type="text"
            value={model}
            onChange={e => setModel(e.target.value)}
            className="w-full bg-[#161b22] border border-[#30363d] rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 code-font"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 uppercase font-semibold block mb-1">API Key (необязательно)</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full bg-[#161b22] border border-[#30363d] rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 code-font"
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
          {status === 'saving' ? 'Сохранение...' :
           status === 'saved'  ? '✓ Сохранено' :
           status === 'error'  ? '✗ Ошибка' : 'Сохранить настройки'}
        </button>
      </div>
    </aside>
  );
}

export function Sidebar(props: Props) {
  const {
    panel, workspace, tree, activeFile, resultsByFile, backendOnline,
    onFileOpen, onOpenPicker, onCloseWorkspace,
    rules, onDeleteRule, onToggleRule, onCreateRuleManually, onEditRule,
  } = props;

  if (panel === 'rules') {
    const activeCount = rules.filter(r => r.enabled).length;
    return (
      <aside className="w-64 border-r border-[#30363d] bg-[#0d1117] flex flex-col overflow-hidden flex-shrink-0">
        <div className="p-3 text-[11px] uppercase font-bold text-gray-500 tracking-wider flex justify-between items-center">
          <span>Правила {rules.length > 0 && <span className="text-gray-400 normal-case">({activeCount}/{rules.length} активно)</span>}</span>
          <button
            onClick={onCreateRuleManually}
            className="text-blue-400 hover:text-blue-300 transition-colors"
            title="Создать правило вручную"
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
          Новое правило
        </button>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-2 pb-4">
          {rules.length === 0 && (
            <div className="text-center mt-6 px-2">
              <p className="text-xs text-gray-500 leading-relaxed">
                Правил пока нет.<br />
                Создайте вручную кнопкой выше,<br />
                либо выделите код в редакторе.
              </p>
            </div>
          )}
          {rules.map(rule => (
            <div
              key={rule.id}
              className={`bg-[#161b22] border rounded p-2 space-y-1.5 transition-colors ${
                rule.enabled ? 'border-[#30363d]' : 'border-[#30363d] opacity-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${categoryColor[rule.category]}`}>
                  {rule.category.toUpperCase()}
                </span>
                <button
                  onClick={() => onToggleRule(rule.id, !rule.enabled)}
                  className={`text-[9px] px-2 py-0.5 rounded font-semibold transition-colors ${
                    rule.enabled
                      ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                      : 'bg-gray-600/30 text-gray-500 hover:bg-gray-500/40'
                  }`}
                  title={rule.enabled ? 'Кликните чтобы отключить' : 'Кликните чтобы включить'}
                >
                  {rule.enabled ? '● АКТИВНО' : '○ ОТКЛ.'}
                </button>
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed font-medium">{rule.description}</p>
              <p className="text-[10px] text-gray-500 leading-relaxed line-clamp-3">{rule.pattern_description}</p>
              <div className="flex justify-end space-x-1 pt-1 border-t border-[#30363d]">
                <button
                  onClick={() => onEditRule(rule)}
                  className="px-2 py-0.5 text-[9px] text-gray-400 hover:text-blue-300 transition-colors flex items-center"
                  title="Редактировать"
                >
                  <FontAwesomeIcon icon={faPencil} className="mr-1" />
                  Изменить
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Удалить правило «${rule.description}»?`)) onDeleteRule(rule.id);
                  }}
                  className="px-2 py-0.5 text-[9px] text-gray-400 hover:text-red-400 transition-colors flex items-center"
                  title="Удалить"
                >
                  <FontAwesomeIcon icon={faTrash} className="mr-1" />
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>
    );
  }

  if (panel === 'settings') {
    return <SettingsPanel />;
  }

  if (panel === 'git') {
    return <GitPanel workspace={workspace} onFileOpen={onFileOpen} />;
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
        onScan={props.onSecurityScan}
        onSaveBaseline={props.onSecuritySaveBaseline}
        onDropBaseline={props.onSecurityDropBaseline}
        onDownloadSarif={props.onSecuritySarif}
        onOpenFinding={props.onOpenFinding}
      />
    );
  }

  // Explorer panel
  return (
    <aside className="w-64 border-r border-[#30363d] bg-[#0d1117] flex flex-col overflow-hidden flex-shrink-0">
      <div className="p-3 text-[11px] uppercase font-bold text-gray-500 tracking-wider flex justify-between items-center">
        <span>Проводник</span>
        <button
          onClick={onOpenPicker}
          className="text-gray-400 hover:text-white transition-colors text-xs"
          title="Открыть/сменить проект"
        >
          <FontAwesomeIcon icon={faFolderOpen} />
        </button>
      </div>

      {/* Backend offline warning */}
      {!backendOnline && (
        <div className="mx-2 my-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-[10px] text-red-400 flex items-start">
          <FontAwesomeIcon icon={faTriangleExclamation} className="mr-1.5 mt-0.5 flex-shrink-0" />
          <span>Бэкенд не отвечает.<br />Запустите start-backend.bat</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar text-sm">
        {/* Workspace header */}
        {workspace && (
          <div className="px-3 py-2 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-gray-200 font-semibold truncate" title={workspace.path}>
                {workspace.name}
              </div>
              <div className="text-[9px] text-gray-500 truncate code-font">{workspace.path}</div>
            </div>
            <button
              onClick={onCloseWorkspace}
              className="ml-2 text-gray-500 hover:text-red-400 text-xs"
              title="Закрыть проект"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        )}

        {/* No workspace state */}
        {!workspace && backendOnline && (
          <div className="p-4 text-center">
            <FontAwesomeIcon icon={faFolderOpen} className="text-3xl text-gray-600 mb-2" />
            <p className="text-xs text-gray-500 mb-3">
              Откройте локальную папку или<br />клонируйте Git-репозиторий
            </p>
            <button
              onClick={onOpenPicker}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-1.5 rounded transition-colors"
            >
              Открыть проект
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
          <p className="text-xs text-gray-500 text-center py-4">Загрузка дерева...</p>
        )}

        {/* Problems summary */}
        {Object.keys(resultsByFile).length > 0 && (
          <>
            <div className="mt-4 p-3 text-[11px] uppercase font-bold text-gray-500 tracking-wider border-t border-[#30363d]">
              <FontAwesomeIcon icon={faDatabase} className="mr-1" /> Проблемы
            </div>
            <div className="px-3 space-y-1 pb-4">
              {Object.entries(resultsByFile).map(([path, res]) => (
                res.violations.length > 0 && (
                  <button
                    key={path}
                    onClick={() => onFileOpen(path)}
                    className="w-full text-left text-[11px] text-gray-400 hover:text-blue-300 py-0.5 flex justify-between"
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
        <div className="p-2 border-t border-[#30363d]">
          <button
            onClick={onOpenPicker}
            className="w-full text-[10px] text-gray-400 hover:text-white py-1 px-2 rounded hover:bg-[#21262d] transition-colors flex items-center justify-center"
          >
            <FontAwesomeIcon icon={faFolderOpen} className="mr-1.5" />
            Сменить проект
          </button>
        </div>
      )}
    </aside>
  );
}
