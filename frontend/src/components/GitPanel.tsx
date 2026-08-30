import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCodeBranch, faRotate, faArrowUp, faArrowDown,
  faCloudArrowUp, faCloudArrowDown, faFolderOpen, faTriangleExclamation,
  faCodePullRequest, faArrowUpRightFromSquare,
} from '@fortawesome/free-solid-svg-icons';
import type { WorkspaceInfo, GitChangedFile, PrResult } from '../types';
import { useGit } from '../hooks/useGit';

interface Props {
  workspace: WorkspaceInfo | null;
  onFileOpen: (path: string) => void;
}

const statusStyle: Record<GitChangedFile['status'], string> = {
  M: 'text-yellow-400',
  A: 'text-green-400',
  D: 'text-red-400',
  R: 'text-purple-400',
  '?': 'text-blue-400',
};

const statusTitle: Record<GitChangedFile['status'], string> = {
  M: 'Изменён',
  A: 'Добавлен',
  D: 'Удалён',
  R: 'Переименован',
  '?': 'Новый (untracked)',
};

export function GitPanel({ workspace, onFileOpen }: Props) {
  const { status, commits, notRepo, busy, notice, refresh, doCommit, doPush, doPull, doCreatePr } =
    useGit(workspace?.path ?? null);
  const [message, setMessage] = useState('');
  const [prOpen, setPrOpen] = useState(false);
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prBase, setPrBase] = useState('main');
  const [prLlm, setPrLlm] = useState(true);
  const [prResult, setPrResult] = useState<PrResult | null>(null);

  const handleCommit = async () => {
    const ok = await doCommit(message);
    if (ok) setMessage('');
  };

  const handlePr = async () => {
    const r = await doCreatePr(prTitle, prBody, prBase.trim() || 'main', prLlm);
    if (r) setPrResult(r);
  };

  return (
    <aside className="w-64 border-r border-[#30363d] bg-[#0d1117] flex flex-col overflow-hidden flex-shrink-0">
      <div className="p-3 text-[11px] uppercase font-bold text-gray-500 tracking-wider flex justify-between items-center">
        <span>Git</span>
        <button
          onClick={refresh}
          disabled={!workspace || busy !== null}
          className="text-gray-400 hover:text-white transition-colors disabled:opacity-40"
          title="Обновить статус"
        >
          <FontAwesomeIcon icon={faRotate} spin={busy === 'refresh'} />
        </button>
      </div>

      {!workspace && (
        <div className="p-4 text-center">
          <FontAwesomeIcon icon={faFolderOpen} className="text-3xl text-gray-600 mb-2" />
          <p className="text-xs text-gray-500">Откройте проект,<br />чтобы работать с Git</p>
        </div>
      )}

      {workspace && notRepo && (
        <div className="mx-2 mt-2 p-2 bg-yellow-900/20 border border-yellow-500/30 rounded text-[10px] text-yellow-400 flex items-start">
          <FontAwesomeIcon icon={faTriangleExclamation} className="mr-1.5 mt-0.5 flex-shrink-0" />
          <span>Текущий проект не является git-репозиторием. Клонируйте репозиторий или откройте папку с git.</span>
        </div>
      )}

      {workspace && status && (
        <div className="flex-1 overflow-y-auto custom-scrollbar pb-4">
          {/* Branch & sync state */}
          <div className="px-3 py-2 bg-[#161b22] border-b border-[#30363d]">
            <div className="flex items-center text-xs text-gray-200">
              <FontAwesomeIcon icon={faCodeBranch} className="mr-1.5 text-gray-500" />
              <span className="font-semibold code-font">{status.branch ?? 'detached HEAD'}</span>
              <span className="ml-2 text-[10px] text-gray-500 code-font">{status.head}</span>
            </div>
            <div className="flex items-center space-x-2 mt-1 text-[10px]">
              {status.tracking ? (
                <span className="text-gray-500 code-font truncate" title={status.tracking}>→ {status.tracking}</span>
              ) : (
                <span className="text-gray-500">upstream не задан</span>
              )}
              {status.ahead > 0 && (
                <span className="text-green-400 flex items-center" title="Коммитов впереди remote">
                  <FontAwesomeIcon icon={faArrowUp} className="mr-0.5" />{status.ahead}
                </span>
              )}
              {status.behind > 0 && (
                <span className="text-orange-400 flex items-center" title="Коммитов позади remote">
                  <FontAwesomeIcon icon={faArrowDown} className="mr-0.5" />{status.behind}
                </span>
              )}
            </div>
          </div>

          {/* Notice */}
          {notice && (
            <div className={`mx-2 mt-2 p-2 rounded text-[10px] border ${
              notice.kind === 'ok'
                ? 'bg-green-900/20 border-green-500/30 text-green-400'
                : 'bg-red-900/20 border-red-500/30 text-red-400'
            }`}>
              {notice.text}
            </div>
          )}

          {/* Sync actions */}
          <div className="flex space-x-1.5 px-2 mt-2">
            <button
              onClick={doPull}
              disabled={busy !== null}
              className="flex-1 text-[10px] py-1.5 rounded border border-[#30363d] bg-[#161b22] text-gray-300 hover:border-blue-500/50 hover:text-blue-300 transition-colors disabled:opacity-40 flex items-center justify-center"
              title="git pull --ff-only"
            >
              <FontAwesomeIcon icon={faCloudArrowDown} className="mr-1" spin={busy === 'pull'} />
              {busy === 'pull' ? 'Pull...' : 'Pull'}
            </button>
            <button
              onClick={doPush}
              disabled={busy !== null}
              className="flex-1 text-[10px] py-1.5 rounded border border-[#30363d] bg-[#161b22] text-gray-300 hover:border-green-500/50 hover:text-green-300 transition-colors disabled:opacity-40 flex items-center justify-center"
              title="git push"
            >
              <FontAwesomeIcon icon={faCloudArrowUp} className="mr-1" spin={busy === 'push'} />
              {busy === 'push' ? 'Push...' : `Push${status.ahead > 0 ? ` (${status.ahead})` : ''}`}
            </button>
          </div>

          {/* Commit box */}
          <div className="px-2 mt-3">
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Сообщение коммита..."
              rows={3}
              className="w-full bg-[#161b22] border border-[#30363d] rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 resize-none"
            />
            <button
              onClick={handleCommit}
              disabled={busy !== null || !message.trim() || status.clean}
              className="w-full mt-1.5 text-xs py-1.5 rounded transition-colors border bg-blue-600/20 hover:bg-blue-600/40 border-blue-500/30 text-blue-400 disabled:opacity-40 disabled:cursor-not-allowed"
              title={status.clean ? 'Нет изменений для коммита' : `Закоммитить ${status.changed.length} файлов`}
            >
              {busy === 'commit' ? 'Коммит...' : `Коммит (${status.changed.length})`}
            </button>
          </div>

          {/* Pull Request */}
          <div className="px-2 mt-2">
            <button
              onClick={() => setPrOpen(o => !o)}
              className="w-full text-[10px] py-1.5 rounded border border-[#30363d] bg-[#161b22] text-gray-300 hover:border-purple-500/50 hover:text-purple-300 transition-colors flex items-center justify-center"
              title="Создать Pull Request на GitHub (push + API)"
            >
              <FontAwesomeIcon icon={faCodePullRequest} className="mr-1" />
              PR / MR {prOpen ? '▴' : '▾'}
            </button>
            {prOpen && (
              <div className="mt-1.5 space-y-1.5">
                <input
                  value={prTitle}
                  onChange={e => setPrTitle(e.target.value)}
                  placeholder="Заголовок PR (пусто = LLM/коммит)"
                  className="w-full bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-purple-500"
                />
                <textarea
                  value={prBody}
                  onChange={e => setPrBody(e.target.value)}
                  placeholder="Описание (пусто = LLM)"
                  rows={2}
                  className="w-full bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-purple-500 resize-none"
                />
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] text-gray-500">base:</span>
                  <input
                    value={prBase}
                    onChange={e => setPrBase(e.target.value)}
                    className="flex-1 bg-[#161b22] border border-[#30363d] rounded px-2 py-0.5 text-[11px] text-gray-200 code-font focus:outline-none focus:border-purple-500"
                  />
                </div>
                <label className="flex items-center text-[10px] text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={prLlm}
                    onChange={e => setPrLlm(e.target.checked)}
                    className="mr-1.5 accent-purple-500"
                  />
                  Сгенерировать заголовок/описание LLM
                </label>
                <button
                  onClick={handlePr}
                  disabled={busy !== null || (!prLlm && !prTitle.trim())}
                  className="w-full text-[11px] py-1.5 rounded border bg-purple-600/20 hover:bg-purple-600/40 border-purple-500/30 text-purple-300 transition-colors disabled:opacity-40"
                >
                  {busy === 'pr' ? 'Создание...' : 'Создать PR/MR (push + API)'}
                </button>
                {prResult && (
                  <a
                    href={prResult.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-[10px] text-purple-300 hover:text-purple-200 code-font truncate"
                    title={prResult.url}
                  >
                    <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="mr-1" />
                    PR #{prResult.number}: {prResult.branch} → {prResult.base}
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Changed files */}
          <div className="mt-3">
            <div className="px-3 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
              Изменения {status.changed.length > 0 && `(${status.changed.length})`}
            </div>
            {status.clean && (
              <p className="px-3 mt-1 text-[11px] text-gray-500">Рабочее дерево чистое</p>
            )}
            <div className="mt-1">
              {status.changed.map(f => (
                <button
                  key={`${f.path}-${f.staged}`}
                  onClick={() => onFileOpen(f.path)}
                  className="w-full text-left px-3 py-1 text-[11px] text-gray-400 hover:text-blue-300 hover:bg-[#161b22] flex items-center transition-colors"
                  title={`${f.path} — ${statusTitle[f.status]}${f.staged ? ' (staged)' : ''}`}
                >
                  <span className={`w-4 font-bold code-font flex-shrink-0 ${statusStyle[f.status]}`}>
                    {f.status}
                  </span>
                  <span className="truncate code-font">{f.path}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Recent commits */}
          {commits.length > 0 && (
            <div className="mt-3 border-t border-[#30363d]">
              <div className="px-3 pt-2 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                История
              </div>
              {commits.map(c => (
                <div key={c.hash} className="px-3 py-1.5 border-b border-[#21262d]">
                  <div className="flex items-center text-[11px]">
                    <span className="text-blue-400 code-font mr-2 flex-shrink-0">{c.hash}</span>
                    <span className="text-gray-300 truncate" title={c.message}>{c.message}</span>
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    {c.author} · {new Date(c.date).toLocaleString('ru-RU')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {workspace && !status && !notRepo && (
        <p className="text-xs text-gray-500 text-center py-4">Загрузка статуса...</p>
      )}
    </aside>
  );
}
