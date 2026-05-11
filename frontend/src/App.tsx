import { useState, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';

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

import { useRules } from './hooks/useRules';
import { useAnalysis } from './hooks/useAnalysis';
import { useWorkspace } from './hooks/useWorkspace';
import type { OpenTab, Rule, RuleCategory, Violation } from './types';

type SidebarPanel = 'explorer' | 'search' | 'git' | 'rules' | 'settings';

interface PendingRule {
  code: string;
  category: RuleCategory;
}

export default function App() {
  const [activePanel, setActivePanel] = useState<SidebarPanel>('explorer');
  const [aiView, setAiView] = useState<AIView>('file');

  const handleViewChange = useCallback((v: AIView) => {
    setAiView(v);
  }, []);
  const [pendingRule, setPendingRule] = useState<PendingRule | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);

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
  } = useAnalysis();
  const {
    workspace, tree, recent, loading: wsLoading, error: wsError, backendOnline,
    openLocal, cloneGit, closeWorkspace, loadFile, clearError,
  } = useWorkspace();

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

  const closeFile = useCallback((path: string) => {
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

  const handleContentChange = useCallback((path: string, content: string) => {
    setTabs(prev => prev.map(t => {
      if (t.path !== path) return t;
      return { ...t, content, dirty: content !== t.originalContent };
    }));
  }, []);

  // ---- Workspace ----
  const handleCloseWorkspace = useCallback(async () => {
    await closeWorkspace();
    setTabs([]);
    setActiveTabIndex(0);
  }, [closeWorkspace]);

  // After opening a new workspace, close all tabs (they belong to the old project)
  const wrappedOpenLocal = useCallback(async (path: string) => {
    const ok = await openLocal(path);
    if (ok) { setTabs([]); setActiveTabIndex(0); }
    return ok;
  }, [openLocal]);

  const wrappedClone = useCallback(async (url: string, target?: string) => {
    const ok = await cloneGit(url, target);
    if (ok) { setTabs([]); setActiveTabIndex(0); }
    return ok;
  }, [cloneGit]);

  // ---- Analysis ----
  const handleAnalyzeFile = useCallback(() => {
    if (!activeTab) return;
    analyzeFile(activeTab.path, activeTab.content);
  }, [activeTab, analyzeFile]);

  const handleAnalyzeProject = useCallback(() => {
    if (!workspace) return;
    analyzeRepository();
  }, [workspace, analyzeRepository]);

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

      <div className="flex flex-1 overflow-hidden">
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
        />
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
    </div>
  );
}
