import { forwardRef, useImperativeHandle, useRef, useState, useCallback, useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';
import type * as monacoT from 'monaco-editor';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faWandMagicSparkles, faFolderOpen, faCircle } from '@fortawesome/free-solid-svg-icons';
import { faJsSquare, faReact, faPython } from '@fortawesome/free-brands-svg-icons';
import type { OpenTab, RuleCategory, Violation } from '../types';
import { useI18n } from '../i18n';

interface ContextMenu {
  x: number;
  y: number;
  selectedText: string;
}

interface Props {
  tabs: OpenTab[];
  activeTabIndex: number;
  violations: Violation[];
  onTabSelect: (index: number) => void;
  onTabClose: (path: string) => void;
  onContentChange: (path: string, content: string) => void;
  onCreateRule: (code: string, category: RuleCategory) => void;
}

export interface EditorPaneHandle {
  jumpToLine: (line: number) => void;
}

function tabIcon(lang: string) {
  if (lang === 'javascript') return <FontAwesomeIcon icon={faJsSquare} className="mr-2 text-yellow-400 text-sm" />;
  if (lang === 'typescript') return <FontAwesomeIcon icon={faReact} className="mr-2 text-blue-400 text-sm" />;
  if (lang === 'python') return <FontAwesomeIcon icon={faPython} className="mr-2 text-blue-300 text-sm" />;
  return null;
}

export const EditorPane = forwardRef<EditorPaneHandle, Props>(function EditorPane(props, ref) {
  const { tabs, activeTabIndex, violations, onTabSelect, onTabClose, onContentChange, onCreateRule } = props;
  const { t } = useI18n();

  const CATEGORY_ITEMS: { value: RuleCategory; label: string; color: string }[] = [
    { value: 'syntax',   label: t('rulescat.syntax'), color: 'text-blue-400' },
    { value: 'semantic', label: t('rulescat.semantic'), color: 'text-purple-400' },
    { value: 'analysis', label: t('rulescat.analysis'), color: 'text-orange-400' },
  ];

  const editorRef = useRef<monacoT.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monacoT | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [editorReady, setEditorReady] = useState(false);

  const tab = tabs[activeTabIndex];

  useImperativeHandle(ref, () => ({
    jumpToLine: (line: number) => {
      const ed = editorRef.current;
      if (!ed) return;
      ed.revealLineInCenter(line);
      ed.setPosition({ lineNumber: line, column: 1 });
      ed.focus();
    },
  }), []);

  const handleEditorMount = useCallback((editor: monacoT.editor.IStandaloneCodeEditor, monaco: typeof monacoT) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setEditorReady(true);

    editor.onContextMenu((e) => {
      const selection = editor.getSelection();
      if (!selection || selection.isEmpty()) return;
      const model = editor.getModel();
      if (!model) return;
      const text = model.getValueInRange(selection);
      if (!text.trim()) return;

      const rect = containerRef.current?.getBoundingClientRect();
      const event = e.event.browserEvent as MouseEvent;
      setContextMenu({
        x: event.clientX - (rect?.left ?? 0),
        y: event.clientY - (rect?.top ?? 0),
        selectedText: text,
      });
    });

    editor.onDidChangeCursorPosition(() => setContextMenu(null));
  }, []);

  // Sync violations → Monaco markers on the active model
  useEffect(() => {
    if (!editorReady) return;
    const ed = editorRef.current;
    const mc = monacoRef.current;
    if (!ed || !mc) return;

    // Defer one tick so model has switched after tab change
    const t = setTimeout(() => {
      const model = ed.getModel();
      if (!model) return;

      const severityMap = {
        critical: mc.MarkerSeverity.Error,
        warning:  mc.MarkerSeverity.Warning,
        info:     mc.MarkerSeverity.Info,
      };

      const markers: monacoT.editor.IMarkerData[] = violations.map(v => {
        const startLine = Math.max(1, v.line_start);
        const endLine = Math.max(startLine, v.line_end || startLine);
        const safeEndLine = Math.min(endLine, model.getLineCount());
        const messageParts = [
          `[${v.category.toUpperCase()}] ${v.rule_description}`,
          v.code_snippet ? `→ ${v.code_snippet}` : '',
          v.explanation,
          v.suggestion ? `💡 ${v.suggestion}` : '',
        ].filter(Boolean);
        return {
          severity: severityMap[v.severity] ?? mc.MarkerSeverity.Info,
          message: messageParts.join('\n\n'),
          startLineNumber: startLine,
          endLineNumber: safeEndLine,
          startColumn: 1,
          endColumn: model.getLineMaxColumn(safeEndLine),
          source: 'Hybrid LLM',
        };
      });

      mc.editor.setModelMarkers(model, 'hybrid-llm', markers);
    }, 30);

    return () => clearTimeout(t);
  }, [violations, activeTabIndex, editorReady]);

  const handleChange = (value: string | undefined) => {
    if (value === undefined || !tab) return;
    onContentChange(tab.path, value);
  };

  // Empty state — no tabs open
  if (!tab) {
    return (
      <main className="flex-1 flex flex-col bg-[#0d1117] relative min-w-0">
        <div className="h-9 bg-[#161b22] border-b border-[#30363d] flex-shrink-0" />
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <FontAwesomeIcon icon={faFolderOpen} className="text-5xl mb-3 opacity-40" />
            <p className="text-sm">{t('editor.openFileHint')}</p>
            <p className="text-xs text-gray-600 mt-1">{t('editor.orCreateRule')}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col bg-[#0d1117] relative min-w-0" ref={containerRef}>
      {/* Tabs */}
      <div className="h-9 bg-[#161b22] border-b border-[#30363d] flex items-center overflow-x-auto no-scrollbar flex-shrink-0">
        {tabs.map((tabItem, i) => (
          <div
            key={tabItem.path}
            onClick={() => onTabSelect(i)}
            className={`group h-full pl-4 pr-2 flex items-center border-r border-[#30363d] text-xs cursor-pointer transition-colors flex-shrink-0 ${
              i === activeTabIndex
                ? 'bg-[#0d1117] text-gray-200 border-t-2 border-t-blue-500'
                : 'text-gray-500 hover:bg-[#21262d]'
            }`}
          >
            {tabIcon(tabItem.language)}
            <span className="select-none">{tabItem.name}</span>
            {tabItem.dirty && (
              <FontAwesomeIcon
                icon={faCircle}
                className="ml-2 text-[6px] text-gray-400 group-hover:hidden"
                title={t('editor.unsaved')}
              />
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onTabClose(tabItem.path); }}
              className="ml-2 w-4 h-4 rounded hover:bg-[#30363d] flex items-center justify-center text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
              title={t('common.close')}
            >
              <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
            </button>
          </div>
        ))}
      </div>

      {/* Monaco Editor — using `path` makes each tab a separate model */}
      <div className="flex-1 overflow-hidden">
        <MonacoEditor
          path={tab.path}
          language={tab.language}
          value={tab.content}
          theme="vs-dark"
          onChange={handleChange}
          onMount={handleEditorMount}
          options={{
            fontSize: 13,
            fontFamily: "'Fira Code', monospace",
            fontLigatures: true,
            minimap: { enabled: true, scale: 1 },
            scrollBeyondLastLine: false,
            lineNumbers: 'on',
            glyphMargin: true,
            folding: true,
            renderLineHighlight: 'line',
            contextmenu: true,
            wordWrap: 'off',
            automaticLayout: true,
          }}
        />
      </div>

      {/* Custom Context Menu */}
      {contextMenu && (
        <div
          className="context-menu absolute z-50 bg-[#1f2937] border border-[#30363d] rounded shadow-2xl py-1 min-w-[200px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <div className="px-3 py-1 text-[10px] text-gray-500 uppercase font-semibold border-b border-[#30363d] mb-1">
            {t('editor.createRuleFromSelection')}
          </div>
          {CATEGORY_ITEMS.map(({ value, label, color }) => (
            <button
              key={value}
              onMouseDown={(e) => {
                e.preventDefault();
                onCreateRule(contextMenu.selectedText, value);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-[#30363d] transition-colors flex items-center"
            >
              <FontAwesomeIcon icon={faWandMagicSparkles} className={`mr-2 ${color} text-[10px]`} />
              {label}
            </button>
          ))}
        </div>
      )}
    </main>
  );
});
