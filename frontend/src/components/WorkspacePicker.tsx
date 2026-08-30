import { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTimes, faFolderOpen, faCodeBranch, faClockRotateLeft,
  faFolder, faHouse, faArrowUp, faSpinner, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { workspaceApi } from '../services/api';
import type { BrowseResponse } from '../types';
import { useI18n } from '../i18n';

interface Props {
  recent: string[];
  loading: boolean;
  error: string | null;
  onOpenLocal: (path: string) => Promise<boolean>;
  onClone: (url: string, target?: string) => Promise<boolean>;
  onClose: () => void;
  onClearError: () => void;
}

type Tab = 'local' | 'git' | 'recent';

export function WorkspacePicker({ recent, loading, error, onOpenLocal, onClone, onClose, onClearError }: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>(recent.length > 0 ? 'recent' : 'local');
  const [localPath, setLocalPath] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [gitTarget, setGitTarget] = useState('');
  const [browser, setBrowser] = useState<BrowseResponse | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);

  const openBrowse = useCallback(async (path?: string) => {
    try {
      const data = await workspaceApi.browse(path);
      setBrowser(data);
      setBrowseOpen(true);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { onClearError(); }, [tab, onClearError]);

  const handleLocalSubmit = async () => {
    if (!localPath.trim()) return;
    const ok = await onOpenLocal(localPath.trim());
    if (ok) onClose();
  };

  const handleGitSubmit = async () => {
    if (!gitUrl.trim()) return;
    const ok = await onClone(gitUrl.trim(), gitTarget.trim() || undefined);
    if (ok) onClose();
  };

  const handleRecentClick = async (path: string) => {
    const ok = await onOpenLocal(path);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '85vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#30363d]">
          <h3 className="text-base font-bold text-white flex items-center">
            <FontAwesomeIcon icon={faFolderOpen} className="mr-2 text-blue-400" />
            {t('picker.openProject')}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#30363d] px-4">
          {([
            { id: 'local',  label: t('picker.tabLocal'), icon: faFolderOpen },
            { id: 'git',    label: t('picker.tabGit'), icon: faCodeBranch },
            { id: 'recent', label: t('picker.tabRecent', { count: recent.length }), icon: faClockRotateLeft },
          ] as const).map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`px-4 py-2.5 text-xs font-semibold transition-colors flex items-center ${
                tab === item.id
                  ? 'text-blue-400 border-b-2 border-blue-500'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <FontAwesomeIcon icon={item.icon} className="mr-2" />
              {item.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {error && (
            <div className="mb-4 p-2.5 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-400 flex items-start">
              <span className="flex-1">⚠️ {error}</span>
              <button onClick={onClearError} className="text-red-400 hover:text-red-300 ml-2">
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
          )}

          {tab === 'local' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">
                {t('picker.localHint')}
              </p>
              <div>
                <label className="text-[10px] text-gray-500 uppercase font-semibold block mb-1">{t('picker.path')}</label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={localPath}
                    onChange={e => setLocalPath(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLocalSubmit()}
                    placeholder="C:\Users\you\my-project"
                    className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500 code-font"
                  />
                  <button
                    onClick={() => openBrowse(undefined)}
                    className="px-3 bg-[#30363d] hover:bg-[#484f58] text-gray-300 text-xs rounded transition-colors"
                  >
                    {t('picker.browse')}
                  </button>
                </div>
              </div>
              <button
                onClick={handleLocalSubmit}
                disabled={!localPath.trim() || loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded transition-colors flex items-center justify-center"
              >
                {loading ? <FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> : <FontAwesomeIcon icon={faFolderOpen} className="mr-2" />}
                {t('picker.openProject')}
              </button>
            </div>
          )}

          {tab === 'git' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">
                {t('picker.gitHint')} <code className="bg-[#0d1117] px-1 rounded text-gray-300">backend/projects/</code>.
              </p>
              <div>
                <label className="text-[10px] text-gray-500 uppercase font-semibold block mb-1">{t('picker.repoUrl')}</label>
                <input
                  type="text"
                  value={gitUrl}
                  onChange={e => setGitUrl(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500 code-font"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase font-semibold block mb-1">
                  {t('picker.folderName')} <span className="text-gray-600 font-normal normal-case">{t('picker.optional')}</span>
                </label>
                <input
                  type="text"
                  value={gitTarget}
                  onChange={e => setGitTarget(e.target.value)}
                  placeholder={t('picker.folderNamePlaceholder')}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500 code-font"
                />
              </div>
              <button
                onClick={handleGitSubmit}
                disabled={!gitUrl.trim() || loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded transition-colors flex items-center justify-center"
              >
                {loading ? <FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> : <FontAwesomeIcon icon={faCodeBranch} className="mr-2" />}
                {loading ? t('picker.cloning') : t('picker.cloneAndOpen')}
              </button>
            </div>
          )}

          {tab === 'recent' && (
            <div className="space-y-1">
              {recent.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-8">{t('picker.noRecent')}</p>
              )}
              {recent.map(path => (
                <button
                  key={path}
                  onClick={() => handleRecentClick(path)}
                  disabled={loading}
                  className="w-full flex items-center px-3 py-2 bg-[#0d1117] hover:bg-[#21262d] disabled:opacity-50 border border-[#30363d] rounded text-left transition-colors"
                >
                  <FontAwesomeIcon icon={faFolder} className="mr-3 text-blue-400 text-sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-200 font-semibold truncate">
                      {path.split(/[\\/]/).filter(Boolean).pop()}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate code-font">{path}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Folder browser sub-modal */}
      {browseOpen && browser && (
        <div className="fixed inset-0 bg-black/50 z-[210] flex items-center justify-center p-4" onClick={() => setBrowseOpen(false)}>
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '70vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-[#30363d]">
              <span className="text-sm font-bold text-white">{t('picker.chooseFolder')}</span>
              <button onClick={() => setBrowseOpen(false)} className="text-gray-500 hover:text-white">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="px-3 py-2 bg-[#0d1117] border-b border-[#30363d] flex items-center space-x-2">
              {browser.parent && (
                <button onClick={() => openBrowse(browser.parent!)} className="text-gray-400 hover:text-white text-xs p-1" title={t('picker.up')}>
                  <FontAwesomeIcon icon={faArrowUp} />
                </button>
              )}
              <button onClick={() => openBrowse(browser.home)} className="text-gray-400 hover:text-white text-xs p-1" title={t('picker.home')}>
                <FontAwesomeIcon icon={faHouse} />
              </button>
              <span className="text-[11px] text-gray-300 code-font truncate flex-1">{browser.current || t('picker.root')}</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
              {browser.entries.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">{t('picker.noFolders')}</p>
              ) : (
                browser.entries.map(e => (
                  <button
                    key={e.path}
                    onDoubleClick={() => openBrowse(e.path)}
                    onClick={() => openBrowse(e.path)}
                    className="w-full flex items-center px-2 py-1.5 text-xs text-gray-300 hover:bg-[#21262d] rounded transition-colors"
                  >
                    <FontAwesomeIcon icon={faFolder} className="mr-2 text-blue-400" />
                    <span className="truncate">{e.name}</span>
                  </button>
                ))
              )}
            </div>
            <div className="p-3 border-t border-[#30363d] flex justify-end space-x-2">
              <button
                onClick={() => setBrowseOpen(false)}
                className="px-3 py-1.5 bg-[#30363d] hover:bg-[#484f58] text-gray-300 text-xs rounded transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  if (browser.current) {
                    setLocalPath(browser.current);
                    setBrowseOpen(false);
                  }
                }}
                disabled={!browser.current}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs rounded transition-colors"
              >
                {t('picker.selectThisFolder')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
