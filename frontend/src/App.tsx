import { useState, useCallback, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWandMagicSparkles, faChartBar } from '@fortawesome/free-solid-svg-icons';

import { Header } from './components/Header';
import { ActivityBar } from './components/ActivityBar';
import { Sidebar } from './components/Sidebar';
import { EditorPane, type EditorPaneHandle } from './components/EditorPane';
import { AIPanel, type AIView } from './components/AIPanel';
import { StatusBar } from './components/StatusBar';
import { AnalysisOverlay } from './components/AnalysisOverlay';
import { RuleCreatorDialog } from './components/RuleCreatorDialog';
import { ManualRuleDialog } from './components/ManualRuleDialog';
import { WorkspacePicker } from './components/WorkspacePicker';
import { ReportDialog } from './components/ReportDialog';
import { UnsavedChangesDialog } from './components/UnsavedChangesDialog';

import { useRules } from './hooks/useRules';
import { useAnalysis } from './hooks/useAnalysis';
import { useWorkspace } from './hooks/useWorkspace';
import { useReview } from './hooks/useReview';
import { useSecurity } from './hooks/useSecurity';
import { usePentest } from './hooks/usePentest';
import type { OpenTab, Rule, RuleCategory, Violation } from './types';

type SidebarPanel = 'explorer' | 'search' | 'git' | 'rules' | 'settings' | 'security';

interface PendingRule {
  code: string;
  category: RuleCategory;
}

export default function App() {
  const [activePanel, setActivePanel] = useState<SidebarPanel>('explorer');
  const [aiView, setAiView] = useState<AIView>('file');
  const [tabsCollapsed, setTabsCollapsed] = useState(false);

  const handleViewChange = useCallback((v: AIView) => {
    setAiView(v);
  }, []);
  const handleToggleTabsCollapsed = useCallback(() => {
    setTabsCollapsed(c => !c);
  }, []);
  const [pendingRule, setPendingRule] = useState<PendingRule | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [pendingCloseTab, setPendingCloseTab] = useState<OpenTab | null>(null);
  const [saveToast, setSaveToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  const editorPaneRef = useRef<EditorPaneHandle>(null);

  const {
    rules, loading: rulesLoading, lastError: ruleError,
    generateRule, createRule, updateRule, toggleRule, deleteRule, clearError: clearRuleError,
  } = useRules();
  const {
    resultsByFile, messages, analyzing, progress, stepLabel,
    analyzeFile, analyzeRepository, sendMessage,
    clearFileResult, clearAllResults, clearMessages,
  } = useAnalysis();
  const {
    workspace, tree, recent, loading: wsLoading, error: wsError, backendOnline,
    openLocal, cloneGit, closeWorkspace, loadFile, saveFile, clearError,
  } = useWorkspace();
  const {
    reviewing, state: reviewState, error: reviewError,
    runFileReview, runChangesReview, clearReview,
  } = useReview();
  const {
    tools: securityTools, report: securityReport, baseline: securityBaseline,
    scanning: securityScanning, busyBaseline: securityBusyBaseline, error: securityError,
    runScan: runSecurityScan, saveBaseline: saveSecurityBaseline,
    dropBaseline: dropSecurityBaseline, downloadSarif,
  } = useSecurity(workspace?.path ?? null);
  const {
    tools: pentestTools, report: pentestReport,
    scanning: pentestScanning, error: pentestError,
    loadTools: loadPentestTools, runScan: runPentestScan,
  } = usePentest();

  const activeTab = tabs[activeTabIndex] ?? null;
  const violations: Violation[] = activeTab ? (resultsByFile[activeTab.path]?.violations ?? []) : [];

  // ---- Tab management ----
  const openFile = useCallback(async (path: string) => {
    const idx = tabs.findIndex(t => t.path === path);
    if (idx >= 0) {
      setActiveTabIndex(idx);
      return;
    }
    if (!workspace) return;
    const data = await loadFile(path);
    if (!data) return;
    const tab: OpenTab = {
      path: data.path,
      name: data.name,
      language: data.language,
      content: data.content,
      originalContent: data.content,
      dirty: false,
    };
    setTabs(prev => {
      setActiveTabIndex(prev.length);
      return [...prev, tab];
    });
  }, [tabs, workspace, loadFile]);

  const forceCloseFile = useCallback((path: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.path === path);
      if (idx < 0) return prev;
      const next = prev.filter(t => t.path !== path);
      setActiveTabIndex(curIdx => {
        if (next.length === 0) return 0;
        if (idx < curIdx) return curIdx - 1;
        if (idx === curIdx) return Math.min(curIdx, next.length - 1);
        return curIdx;
      });
      return next;
    });
  }, []);

  /** Save tab content to disk. Returns null on success or error message on failure. */
  const saveTab = useCallback(async (path: string): Promise<string | null> => {
    const tab = tabs.find(t => t.path === path);
    if (!tab) return 'Файл не найден среди открытых табов';
    const snapshot = tab.content;
    const err = await saveFile(path, snapshot);
    if (err) {
      setSaveToast({ kind: 'err', text: err });
      return err;
    }
    // Update originalContent. If user kept typing during save, dirty stays based on
    // comparing current content with the just-saved snapshot.
    setTabs(prev => prev.map(t =>
      t.path === path
        ? { ...t, originalContent: snapshot, dirty: t.content !== snapshot }
        : t
    ));
    setSaveToast({ kind: 'ok', text: `Сохранено: ${tab.name}` });
    return null;
  }, [tabs, saveFile]);

  const closeFile = useCallback((path: string) => {
    const tab = tabs.find(t => t.path === path);
    if (tab?.dirty) {
      setPendingCloseTab(tab);
      return;
    }
    forceCloseFile(path);
  }, [tabs, forceCloseFile]);

  const handleContentChange = useCallback((path: string, content: string) => {
    setTabs(prev => prev.map(t => {
      if (t.path !== path) return t;
      return { ...t, content, dirty: content !== t.originalContent };
    }));
  }, []);

  // ---- Save keyboard shortcut & navigation guard ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (activeTab && activeTab.dirty) saveTab(activeTab.path);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTab, saveTab]);

  useEffect(() => {
    const hasDirty = tabs.some(t => t.dirty);
    if (!hasDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [tabs]);

  // Auto-dismiss save toast
  useEffect(() => {
    if (!saveToast) return;
    const t = setTimeout(() => setSaveToast(null), saveToast.kind === 'ok' ? 1500 : 4000);
    return () => clearTimeout(t);
  }, [saveToast]);

  // ---- Workspace ----
  const confirmDiscardDirty = useCallback((): boolean => {
    const dirty = tabs.filter(t => t.dirty);
    if (dirty.length === 0) return true;
    const list = dirty.map(t => '• ' + t.path).join('\n');
    return window.confirm(
      `Несохранённые изменения в ${dirty.length} файлах:\n\n${list}\n\nПродолжить? Изменения будут потеряны.`
    );
  }, [tabs]);

  const handleCloseWorkspace = useCallback(async () => {
    if (!confirmDiscardDirty()) return;
    await closeWorkspace();
    setTabs([]);
    setActiveTabIndex(0);
  }, [closeWorkspace, confirmDiscardDirty]);

  const wrappedOpenLocal = useCallback(async (path: string) => {
    if (!confirmDiscardDirty()) return false;
    const ok = await openLocal(path);
    if (ok) { setTabs([]); setActiveTabIndex(0); }
    return ok;
  }, [openLocal, confirmDiscardDirty]);

  const wrappedClone = useCallback(async (url: string, target?: string) => {
    if (!confirmDiscardDirty()) return false;
    const ok = await cloneGit(url, target);
    if (ok) { setTabs([]); setActiveTabIndex(0); }
    return ok;
  }, [cloneGit, confirmDiscardDirty]);

  // ---- Unsaved-changes dialog handlers ----
  const handleDialogSave = useCallback(async (): Promise<string | null> => {
    if (!pendingCloseTab) return null;
    const err = await saveTab(pendingCloseTab.path);
    if (err) return err;
    forceCloseFile(pendingCloseTab.path);
    setPendingCloseTab(null);
    return null;
  }, [pendingCloseTab, saveTab, forceCloseFile]);

  const handleDialogDiscard = useCallback(() => {
    if (!pendingCloseTab) return;
    forceCloseFile(pendingCloseTab.path);
    setPendingCloseTab(null);
  }, [pendingCloseTab, forceCloseFile]);

  const handleDialogCancel = useCallback(() => setPendingCloseTab(null), []);

  // ---- Analysis ----
  const handleAnalyzeFile = useCallback(() => {
    if (!activeTab) return;
    analyzeFile(activeTab.path, activeTab.content);
  }, [activeTab, analyzeFile]);

  const handleAnalyzeProject = useCallback(() => {
    if (!workspace) return;
    analyzeRepository();
  }, [workspace, analyzeRepository]);

  // ---- Code Review Agent ----
  const handleReviewFile = useCallback(() => {
    if (!activeTab) return;
    runFileReview(activeTab.path, activeTab.content);
  }, [activeTab, runFileReview]);

  const handleReviewChanges = useCallback(() => {
    if (!workspace) return;
    runChangesReview();
  }, [workspace, runChangesReview]);

  // ---- Security scan ----
  const handleSecurityScan = useCallback((verify: boolean) => {
    if (!workspace) return;
    runSecurityScan(verify);
  }, [workspace, runSecurityScan]);

  /** Открыть файл находки и перепрыгнуть к строке (после загрузки таба). */
  const handleOpenFinding = useCallback((path: string, line: number) => {
    void openFile(path).then(() => {
      setTimeout(() => editorPaneRef.current?.jumpToLine(line), 150);
    });
  }, [openFile]);

  // ---- Rule creation ----
  const handleCreateRule = useCallback((code: string, category: RuleCategory) => {
    setPendingRule({ code, category });
  }, []);

  const handleRuleConfirm = useCallback(async (category: RuleCategory): Promise<boolean> => {
    if (!pendingRule) return false;
    return generateRule(pendingRule.code, category);
  }, [pendingRule, generateRule]);

  const handleManualSubmit = useCallback(async (data: {
    category: RuleCategory; description: string; pattern_description: string; enabled: boolean;
  }): Promise<boolean> => {
    if (editingRule) {
      return updateRule(editingRule.id, data);
    }
    return createRule(data);
  }, [editingRule, createRule, updateRule]);

  const handleOpenManual = useCallback(() => {
    clearRuleError();
    setEditingRule(null);
    setManualOpen(true);
  }, [clearRuleError]);

  const handleEditRule = useCallback((rule: Rule) => {
    clearRuleError();
    setEditingRule(rule);
    setManualOpen(true);
  }, [clearRuleError]);

  const closeManual = useCallback(() => {
    setManualOpen(false);
    setEditingRule(null);
  }, []);

  // ---- Violation interactions ----
  const handleJumpToLine = useCallback((line: number) => {
    editorPaneRef.current?.jumpToLine(line);
  }, []);

  const handleApplyFix = useCallback((violation: Violation) => {
    const context = activeTab ? `Файл: ${activeTab.path}\n\n${activeTab.content}` : undefined;
    sendMessage(
      `Предложи конкретное исправление для нарушения "${violation.rule_description}" на строке ${violation.line_start}: ${violation.explanation}`,
      context,
    );
    setAiView('chat');
  }, [activeTab, sendMessage]);

  const handleSendMessage = useCallback((text: string) => {
    const context = activeTab ? `Файл: ${activeTab.path}\n\n${activeTab.content}` : undefined;
    sendMessage(text, context);
  }, [activeTab, sendMessage]);

  // ---- Reset analysis data per active AI view ----
  const handleResetData = useCallback(() => {
    switch (aiView) {
      case 'file': {
        if (!activeTab) {
          setSaveToast({ kind: 'err', text: 'Нет активного файла' });
          return;
        }
        if (!(activeTab.path in resultsByFile)) {
          setSaveToast({ kind: 'err', text: 'Нет данных для сброса' });
          return;
        }
        clearFileResult(activeTab.path);
        setSaveToast({ kind: 'ok', text: `Результаты для ${activeTab.name} сброшены` });
        break;
      }
      case 'repository': {
        const count = Object.keys(resultsByFile).length;
        if (count === 0) {
          setSaveToast({ kind: 'err', text: 'Нет результатов для сброса' });
          return;
        }
        if (window.confirm(`Удалить результаты анализа всех ${count} файлов?`)) {
          clearAllResults();
          setSaveToast({ kind: 'ok', text: 'Все результаты анализа сброшены' });
        }
        break;
      }
      case 'chat': {
        if (messages.length <= 1) {
          setSaveToast({ kind: 'err', text: 'История уже пустая' });
          return;
        }
        if (window.confirm('Очистить историю чата?')) {
          clearMessages();
        }
        break;
      }
      case 'review': {
        if (!reviewState.file && !reviewState.changes) {
          setSaveToast({ kind: 'err', text: 'Нет результатов ревью для сброса' });
          return;
        }
        clearReview();
        setSaveToast({ kind: 'ok', text: 'Результаты ревью сброшены' });
        break;
      }
      case 'commit':
      case 'pr':
        setSaveToast({ kind: 'err', text: 'Режим в разработке — нечего сбрасывать' });
        break;
    }
  }, [aiView, activeTab, resultsByFile, messages, reviewState, clearFileResult, clearAllResults, clearMessages, clearReview]);

  // Auto-open picker on first load when no workspace and backend is online
  // (commented out — let user see empty state instead)
  // useEffect(() => {
  //   if (backendOnline && !workspace && recent.length === 0) setPickerOpen(true);
  // }, [backendOnline, workspace, recent.length]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header
        contextHealth={85}
        workspace={workspace}
        onAnalyzeProject={handleAnalyzeProject}
        analyzing={analyzing}
      />

      <div className="flex flex-1 overflow-hidden relative">
        <ActivityBar
          activePanel={activePanel}
          onSelect={p => setActivePanel(p as SidebarPanel)}
        />

        <Sidebar
          panel={activePanel}
          workspace={workspace}
          tree={tree}
          activeFile={activeTab?.path ?? null}
          resultsByFile={resultsByFile}
          backendOnline={backendOnline}
          onFileOpen={openFile}
          onOpenPicker={() => setPickerOpen(true)}
          onCloseWorkspace={handleCloseWorkspace}
          rules={rules}
          onDeleteRule={deleteRule}
          onToggleRule={toggleRule}
          onCreateRuleManually={handleOpenManual}
          onEditRule={handleEditRule}
          securityTools={securityTools}
          securityReport={securityReport}
          securityBaseline={securityBaseline}
          securityScanning={securityScanning}
          securityBusyBaseline={securityBusyBaseline}
          securityError={securityError}
          onSecurityScan={handleSecurityScan}
          onSecuritySaveBaseline={saveSecurityBaseline}
          onSecurityDropBaseline={dropSecurityBaseline}
          onSecuritySarif={downloadSarif}
          onOpenFinding={handleOpenFinding}
          pentestTools={pentestTools}
          pentestReport={pentestReport}
          pentestScanning={pentestScanning}
          pentestError={pentestError}
          onPentestLoadTools={loadPentestTools}
          onPentestScan={runPentestScan}
        />

        <EditorPane
          ref={editorPaneRef}
          tabs={tabs}
          activeTabIndex={activeTabIndex}
          violations={violations}
          onTabSelect={setActiveTabIndex}
          onTabClose={closeFile}
          onContentChange={handleContentChange}
          onCreateRule={handleCreateRule}
        />

        <AIPanel
          messages={messages}
          violations={violations}
          view={aiView}
          onViewChange={handleViewChange}
          onSendMessage={handleSendMessage}
          onApplyFix={handleApplyFix}
          onJumpToLine={handleJumpToLine}
          onResetData={handleResetData}
          tabsCollapsed={tabsCollapsed}
          onToggleTabsCollapsed={handleToggleTabsCollapsed}
          reviewing={reviewing}
          reviewState={reviewState}
          reviewError={reviewError}
          activeFilePath={activeTab?.path ?? null}
          hasWorkspace={workspace !== null}
          onReviewFile={handleReviewFile}
          onReviewChanges={handleReviewChanges}
          onOpenFile={openFile}
        />

        {/* Floating "Summary report" button — inside main content area */}
        <button
          onClick={() => setReportOpen(true)}
          disabled={Object.keys(resultsByFile).length === 0}
          className="absolute bottom-24 right-[336px] bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full p-3 shadow-2xl transition-all z-10 flex items-center justify-center"
          title={
            Object.keys(resultsByFile).length === 0
              ? 'Сначала запустите анализ файла или проекта'
              : `Сводный отчёт (${Object.keys(resultsByFile).length} файлов)`
          }
        >
          <FontAwesomeIcon icon={faChartBar} className="text-lg" />
          {Object.keys(resultsByFile).length > 0 && (
            <span className="ml-2 text-[10px] font-bold bg-white/20 px-1.5 rounded">
              {Object.keys(resultsByFile).length}
            </span>
          )}
        </button>
      </div>

      <StatusBar
        language={activeTab?.language ?? '—'}
        rulesCount={rules.length}
        violationsCount={violations.length}
        activeFile={activeTab?.path ?? null}
      />

      <AnalysisOverlay visible={analyzing} progress={progress} stepLabel={stepLabel} />

      <button
        onClick={handleAnalyzeFile}
        disabled={analyzing || !activeTab}
        className="fixed bottom-10 right-[336px] bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full p-4 shadow-2xl pulse-ring transition-all z-10"
        title={activeTab ? `Анализировать текущий файл: ${activeTab.name}` : 'Откройте файл для анализа'}
      >
        <FontAwesomeIcon icon={faWandMagicSparkles} className="text-xl" />
      </button>

      {pickerOpen && (
        <WorkspacePicker
          recent={recent}
          loading={wsLoading}
          error={wsError}
          onOpenLocal={wrappedOpenLocal}
          onClone={wrappedClone}
          onClose={() => setPickerOpen(false)}
          onClearError={clearError}
        />
      )}

      {pendingRule && (
        <RuleCreatorDialog
          selectedCode={pendingRule.code}
          initialCategory={pendingRule.category}
          onConfirm={handleRuleConfirm}
          onClose={() => setPendingRule(null)}
          loading={rulesLoading}
          error={ruleError}
        />
      )}

      {manualOpen && (
        <ManualRuleDialog
          initial={editingRule ?? undefined}
          loading={rulesLoading}
          error={ruleError}
          onSubmit={handleManualSubmit}
          onClose={closeManual}
        />
      )}

      {reportOpen && (
        <ReportDialog
          resultsByFile={resultsByFile}
          onFileOpen={openFile}
          onClose={() => setReportOpen(false)}
        />
      )}

      {pendingCloseTab && (
        <UnsavedChangesDialog
          fileName={pendingCloseTab.name}
          filePath={pendingCloseTab.path}
          onSave={handleDialogSave}
          onDiscard={handleDialogDiscard}
          onCancel={handleDialogCancel}
        />
      )}

      {saveToast && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded shadow-lg text-xs z-[300] border ${
            saveToast.kind === 'ok'
              ? 'bg-green-900/90 border-green-500/50 text-green-300'
              : 'bg-red-900/90 border-red-500/50 text-red-300'
          }`}
        >
          {saveToast.kind === 'ok' ? '✓ ' : '⚠️ '}{saveToast.text}
        </div>
      )}
    </div>
  );
}
