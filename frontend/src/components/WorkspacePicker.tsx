import { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFolderOpen, faCodeBranch, faClockRotateLeft,
  faFolder, faHouse, faArrowUp, faSpinner,
} from '@fortawesome/free-solid-svg-icons';
import { workspaceApi } from '../services/api';
import type { BrowseResponse } from '../types';
import { useI18n } from '../i18n';
import { Dialog } from './ui/Dialog';
import { ErrorBanner } from './ui/ErrorBanner';

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

  const closeBrowse = useCallback(() => setBrowseOpen(false), []);

  return (
    <>
    <Dialog
      title={t('picker.openProject')}
      icon={faFolderOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      maxHeight="max-h-[85vh]"
      bodyClassName="flex-1 overflow-y-auto p-5 custom-scrollbar"
    >
      {/* Tabs */}
      <div className="flex border-b border-border-default -mx-5 -mt-5 mb-4 px-4">
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
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <FontAwesomeIcon icon={item.icon} className="mr-2" />
            {item.label}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error} onClose={onClearError} className="mb-4" />}

      {tab === 'local' && (
        <div className="space-y-4">
          <p className="text-xs text-text-secondary">
            {t('picker.localHint')}
          </p>
          <div>
            <label className="text-[10px] text-text-muted uppercase font-semibold block mb-1">{t('picker.path')}</label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={localPath}
                onChange={e => setLocalPath(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLocalSubmit()}
                placeholder="C:\Users\you\my-project"
                className="flex-1 bg-bg-canvas border border-border-default rounded px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500 code-font"
              />
              <button
                onClick={() => openBrowse(undefined)}
                className="px-3 bg-border-default hover:bg-surface-hover text-text-primary text-xs rounded transition-colors"
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
          <p className="text-xs text-text-secondary">
            {t('picker.gitHint')} <code className="bg-bg-canvas px-1 rounded text-text-primary">backend/projects/</code>.
          </p>
          <div>
            <label className="text-[10px] text-text-muted uppercase font-semibold block mb-1">{t('picker.repoUrl')}</label>
            <input
              type="text"
              value={gitUrl}
              onChange={e => setGitUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="w-full bg-bg-canvas border border-border-default rounded px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500 code-font"
            />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase font-semibold block mb-1">
              {t('picker.folderName')} <span className="text-gray-600 font-normal normal-case">{t('picker.optional')}</span>
            </label>
            <input
              type="text"
              value={gitTarget}
              onChange={e => setGitTarget(e.target.value)}
              placeholder={t('picker.folderNamePlaceholder')}
              className="w-full bg-bg-canvas border border-border-default rounded px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500 code-font"
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
            <p className="text-xs text-text-muted text-center py-8">{t('picker.noRecent')}</p>
          )}
          {recent.map(path => (
            <button
              key={path}
              onClick={() => handleRecentClick(path)}
              disabled={loading}
              className="w-full flex items-center px-3 py-2 bg-bg-canvas hover:bg-bg-overlay disabled:opacity-50 border border-border-default rounded text-left transition-colors"
            >
              <FontAwesomeIcon icon={faFolder} className="mr-3 text-blue-400 text-sm" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-200 font-semibold truncate">
                  {path.split(/[\\/]/).filter(Boolean).pop()}
                </div>
                <div className="text-xs text-text-muted truncate code-font">{path}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Dialog>

    {/* Folder browser sub-modal */}
    {browseOpen && browser && (
      <Dialog
        title={t('picker.chooseFolder')}
        onClose={closeBrowse}
        maxHeight="max-h-[70vh]"
        bodyClassName="flex-1 overflow-y-auto custom-scrollbar p-2"
        footer={
          <div className="flex justify-end space-x-2 w-full">
            <button
              onClick={closeBrowse}
              className="px-3 py-1.5 bg-border-default hover:bg-surface-hover text-text-primary text-xs rounded transition-colors"
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
        }
      >
        <div className="px-1 pb-2 -mt-2 flex items-center space-x-2">
          {browser.parent && (
            <button
              onClick={() => openBrowse(browser.parent!)}
              className="text-text-secondary hover:text-white text-xs p-1"
              title={t('picker.up')}
              aria-label={t('picker.up')}
            >
              <FontAwesomeIcon icon={faArrowUp} />
            </button>
          )}
          <button
            onClick={() => openBrowse(browser.home)}
            className="text-text-secondary hover:text-white text-xs p-1"
            title={t('picker.home')}
            aria-label={t('picker.home')}
          >
            <FontAwesomeIcon icon={faHouse} />
          </button>
          <span className="text-xs text-text-primary code-font truncate flex-1">{browser.current || t('picker.root')}</span>
        </div>
        {browser.entries.length === 0 ? (
          <p className="text-xs text-text-muted text-center py-4">{t('picker.noFolders')}</p>
        ) : (
          browser.entries.map(e => (
            <button
              key={e.path}
              onDoubleClick={() => openBrowse(e.path)}
              onClick={() => openBrowse(e.path)}
              className="w-full flex items-center px-2 py-1.5 text-xs text-text-primary hover:bg-bg-overlay rounded transition-colors"
            >
              <FontAwesomeIcon icon={faFolder} className="mr-2 text-blue-400" />
              <span className="truncate">{e.name}</span>
            </button>
          ))
        )}
      </Dialog>
    )}
    </>
  );
}
