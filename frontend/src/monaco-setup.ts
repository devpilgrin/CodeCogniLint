import * as monaco from 'monaco-editor';
import loader from '@monaco-editor/loader';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker.js?worker';

// Self-host Monaco Editor: используем локальный бандл из node_modules вместо CDN.
// Monaco запрашивает воркеров через MonacoEnvironment — подключаем их через Vite `?worker`-импорты.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

loader.config({ monaco });
