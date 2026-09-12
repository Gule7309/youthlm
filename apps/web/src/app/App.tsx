import React, { useState, useEffect, useRef } from 'react';
import {
  Share, Database, FileText, Sparkles,
  MessageSquare, ChevronLeft,
  CircleHelp,
  PanelLeftClose, PanelLeftOpen,
  PanelRightClose, PanelRightOpen,
} from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { NotebookHome } from './components/NotebookHome';
import { SourceCard } from './components/SourceCard';
import { SourceInspector } from './components/SourceInspector';
import { ResultCard } from './components/ResultCard';
import { ResultInspector } from './components/ResultInspector';
import { AssistantSidebar } from './components/AssistantSidebar';
import { PolicyRadarPanel } from './components/PolicyRadarPanel';
import { WorkspaceTour } from './components/WorkspaceTour';
import { TextSizeControl } from './components/TextSizeControl';
import { buildChartArtifactView } from '../chart-artifact.js';
import { buildAnalysisRequest } from './analysis-integration';
import {
  buildAssistantContextOptions,
  buildAssistantRequest,
  buildAssistantResultView,
} from './assistant-integration';
import {
  createPresentation,
  createReport,
  runAnalysis,
  runAssistant,
} from './api-client';
import { RequestGate, resultInputSignature } from './execution-state';
import { readDraft, writeDraft } from './draft-storage';
import { loadSourceCatalog, supportsSourceFilters, validateSourceFilters } from './source-catalog';
import {
  buildPresentationArtifactView,
  buildPresentationRequest,
} from './presentation-integration';
import { buildReportArtifactView, buildReportRequest } from './report-integration';
import { createChartDraftActions, createGuidedChartResult, getChartDraftActions, usesRawSourceInputs } from './result-policy';
import { readTextSizePreference, writeTextSizePreference, type TextSize } from './text-size';
import {
  CONNECTION_COLORS,
  CONNECTION_DROP_MARGIN_PX,
  RESULT_CARD_SIZE,
  SOURCE_CARD_SIZE,
  buildConnectionPath,
  canvasPointFromClient,
  connectCanvasNodes,
  connectionKindBetween,
  connectionPortPoint,
  getFitCanvasTransform,
  isPointNearRect,
  outputConnectionKind,
  type CanvasConnectionKind,
  type CanvasPoint,
} from './canvas-connections';
import {
  cloneWorkspaceNode,
  createPolicyRadarState,
  duplicateWorkspaceNodes,
  getPolicyRadarCounts,
  getPolicyRadarWorkspaceSignature,
  preparePolicyRadarStateForOpen,
  removeResultNode,
  removeSourceNode,
  updateSourceConfig,
} from './workspace-state';
import type {
  AuthUser,
  AnalysisExecution,
  AssistantExecution,
  AssistantConfig,
  CanvasNode,
  Notebook,
  PolicyRadarState,
  PolicyRadarStateByNotebook,
  PresentationExecution,
  ReportExecution,
  ResultConfig,
  SourceConfig,
} from './types';

type AppScreen = 'auth' | 'notebooks' | 'workspace';

const CARD_DRAG_TYPE = 'application/x-youthlm-card';
const ASSISTANT_CARD_SIZE = { width: 340, height: 430 };
type AddableCardType = 'source' | 'result';
type ConnectionDraft = {
  fromNodeId: string;
  pointerId: number;
  kind: CanvasConnectionKind;
  start: CanvasPoint;
  current: CanvasPoint;
  hoveredTargetNodeId: string | null;
};
const NODE_SIZES: Record<CanvasNode['type'], { width: number; height: number }> = {
  source: SOURCE_CARD_SIZE,
  result: RESULT_CARD_SIZE,
  assistant: ASSISTANT_CARD_SIZE,
  transform: { width: 360, height: 430 },
  analysis: { width: 360, height: 350 },
};

function cardWouldOverlap(x: number, y: number, type: CanvasNode['type'], node: CanvasNode) {
  const gap = 24;
  const candidateSize = NODE_SIZES[type];
  const nodeSize = NODE_SIZES[node.type];
  return (
    x < node.x + nodeSize.width + gap
    && x + candidateSize.width + gap > node.x
    && y < node.y + nodeSize.height + gap
    && y + candidateSize.height + gap > node.y
  );
}

function isSourceReady(node: CanvasNode) {
  if (node.type !== 'source' || !node.source?.enabled) return false;
  if (node.source.kind === 'registry') return Boolean(node.source.registrySourceId);
  return false;
}

function isAnalysisReady(execution: AnalysisExecution | undefined) {
  return Boolean(
    execution?.state === 'ready'
    && execution.view
    && execution.view.kind !== 'error'
    && execution.view.kind !== 'blocked'
    && (execution.view.status === 'completed' || execution.view.status === 'partial'),
  );
}

function getUniqueName(baseName: string, existingNames: Set<string>) {
  let name = baseName;
  let suffix = 2;
  while (existingNames.has(name)) {
    name = `${baseName} ${suffix}`;
    suffix += 1;
  }
  existingNames.add(name);
  return name;
}

function createSidebarAssistantNode(): CanvasNode {
  return {
    id: `assistant-sidebar-${crypto.randomUUID()}`,
    type: 'assistant',
    x: 0,
    y: 0,
    assistant: {
      name: 'YouthLM AI 小幫手',
      messages: [],
      draftActions: [],
      contextNodeIds: [],
    },
  };
}

function prepareWorkspaceForSidebarAssistant(workspace: CanvasNode[]): CanvasNode[] {
  const cloned = workspace.map(cloneWorkspaceNode);
  const assistants = cloned.filter(node => node.type === 'assistant' && node.assistant);
  if (assistants.length === 0) return [...cloned, createSidebarAssistantNode()];

  const primary = assistants[0];
  const mergedAssistant: AssistantConfig = {
    name: 'YouthLM AI 小幫手',
    messages: assistants.flatMap(node => node.assistant?.messages ?? []),
    draftActions: assistants.flatMap(node => node.assistant?.draftActions ?? []),
    contextNodeIds: [...new Set(assistants.flatMap(node => node.assistant?.contextNodeIds ?? []))],
    lastPrompt: [...assistants].reverse().find(node => node.assistant?.lastPrompt)?.assistant?.lastPrompt,
  };
  return [
    ...cloned.filter(node => node.type !== 'assistant'),
    { ...primary, x: 0, y: 0, assistant: mergedAssistant },
  ];
}

const INITIAL_WORKSPACES: Record<string, CanvasNode[]> = {};
const INITIAL_POLICY_RADAR_STATES: PolicyRadarStateByNotebook = {};
const INITIAL_NOTEBOOKS: Notebook[] = [];

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('auth');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>(INITIAL_NOTEBOOKS);
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [workspaceNodes, setWorkspaceNodes] = useState<Record<string, CanvasNode[]>>(INITIAL_WORKSPACES);
  const [policyRadarByNotebook, setPolicyRadarByNotebook] = useState<PolicyRadarStateByNotebook>(
    INITIAL_POLICY_RADAR_STATES,
  );
  const [isLeftOpen, setIsLeftOpen] = useState(false);
  const [isRightOpen, setIsRightOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dirtyInspectorNodeId, setDirtyInspectorNodeId] = useState<string | null>(null);
  const [analysisByNode, setAnalysisByNode] = useState<Record<string, AnalysisExecution>>({});
  const [presentationByNode, setPresentationByNode] = useState<Record<string, PresentationExecution>>({});
  const [draftWritable, setDraftWritable] = useState(false);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  const [draftNotice, setDraftNotice] = useState('');
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
  const [connectionNotice, setConnectionNotice] = useState('');
  const [reportByNode, setReportByNode] = useState<Record<string, ReportExecution>>({});
  const [assistantByNode, setAssistantByNode] = useState<Record<string, AssistantExecution>>({});
  const [workspaceTourSeen, setWorkspaceTourSeen] = useState(false);
  const [isWorkspaceTourOpen, setIsWorkspaceTourOpen] = useState(false);
  const [textSize, setTextSize] = useState<TextSize>(() => readTextSizePreference(
    typeof window === 'undefined' ? null : window.localStorage,
  ));

  // Canvas State
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLElement | null>(null);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const connectionDraftRef = useRef<ConnectionDraft | null>(null);
  const completeCanvasConnectionRef = useRef<(fromNodeId: string, toNodeId: string) => void>(() => {});
  const policyRadarRunTimersRef = useRef(new Map<string, number>());
  const inspectorContentRef = useRef<HTMLDivElement>(null);
  const firstNotebookTourIdRef = useRef<string | null>(null);

  // Nodes State
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [fitViewRequest, setFitViewRequest] = useState(0);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [nodeDragOffset, setNodeDragOffset] = useState({ x: 0, y: 0, nodeStartX: 0, nodeStartY: 0 });
  const requestGate = useRef(new RequestGate());
  const executionContext = useRef({ nodes, activeNotebookId, screen, analysisByNode });
  executionContext.current = { nodes, activeNotebookId, screen, analysisByNode };

  const updateConnectionDraft = (draft: ConnectionDraft | null) => {
    connectionDraftRef.current = draft;
    setConnectionDraft(draft);
  };

  const clientToCanvasPoint = (clientX: number, clientY: number) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    return canvasPointFromClient(
      { x: clientX, y: clientY },
      { x: bounds?.left ?? 0, y: bounds?.top ?? 0 },
      panRef.current,
      zoomRef.current,
    );
  };

  useEffect(() => {
    // Switching notebooks or signing out stops waiting, not the server's work.
    requestGate.current.cancelAll();
    updateConnectionDraft(null);
    setConnectionNotice('');
    setAnalysisByNode(current => Object.fromEntries(Object.entries(current).filter(([, value]) => value.state !== 'running')));
    setPresentationByNode(current => Object.fromEntries(Object.entries(current).filter(([, value]) => value.state !== 'running')));
    setReportByNode(current => Object.fromEntries(Object.entries(current).filter(([, value]) => value.state !== 'running')));
    setAssistantByNode(current => Object.fromEntries(Object.entries(current).filter(([, value]) => value.state !== 'running')));
    return () => requestGate.current.cancelAll();
  }, [activeNotebookId, screen]);

  useEffect(() => {
    if (screen !== 'workspace' || !activeNotebookId) return;
    function prune<T extends AnalysisExecution | PresentationExecution | ReportExecution>(current: Record<string, T>): Record<string, T> {
      const invalid = Object.keys(current).filter(id => current[id].projectId === activeNotebookId
        && current[id].inputSignature !== resultInputSignature(id, nodes, analysisByNode));
      if (!invalid.length) return current;
      const next = { ...current };
      invalid.forEach(id => { requestGate.current.cancel(id); delete next[id]; });
      return next;
    }
    setAnalysisByNode(prune);
    setPresentationByNode(prune);
    setReportByNode(prune);
  }, [nodes, activeNotebookId, screen, analysisByNode]);

  const clearAllPolicyRadarRunTimers = () => {
    policyRadarRunTimersRef.current.forEach(timerId => window.clearTimeout(timerId));
    policyRadarRunTimersRef.current.clear();
  };

  useEffect(() => () => clearAllPolicyRadarRunTimers(), []);

  useEffect(() => {
    document.documentElement.dataset.textSize = textSize;
    try {
      writeTextSizePreference(window.localStorage, textSize);
    } catch {
      // The setting still applies for this session when browser storage is unavailable.
    }
  }, [textSize]);

  useEffect(() => {
    if (!currentUser || !draftWritable) return;
    try {
      writeDraft(window.localStorage, currentUser.email, { version: 1, workspaceTourSeen, notebooks,
        workspaces: screen === 'workspace' && activeNotebookId ? { ...workspaceNodes, [activeNotebookId]: nodes } : workspaceNodes,
        radar: policyRadarByNotebook });
      setDraftNotice('本機草稿已保存 · 非雲端備份；重新整理後分析／報告／簡報／小幫手執行需重跑');
      setDraftSaveFailed(false);
    } catch {
      setDraftSaveFailed(true);
      setDraftNotice('本機保存失敗，請勿關閉頁面；可能是瀏覽器限制、空間不足或草稿過大。');
    }
  }, [currentUser, draftWritable, workspaceTourSeen, notebooks, workspaceNodes, nodes, activeNotebookId, screen, policyRadarByNotebook]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyInspectorNodeId || (currentUser && (!draftWritable || draftSaveFailed)) || Object.values(analysisByNode).some(item => item.state === 'running')
        || Object.values(presentationByNode).some(item => item.state === 'running')
        || Object.values(reportByNode).some(item => item.state === 'running')
        || Object.values(assistantByNode).some(item => item.state === 'running')) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirtyInspectorNodeId, analysisByNode, presentationByNode, reportByNode, assistantByNode, currentUser, draftWritable, draftSaveFailed]);


  // Pointer Handlers
  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (connectionDraftRef.current) return;
    const activeInspectorNode = nodes.find(node => node.id === selectedNodeId);
    if (isRightOpen && (activeInspectorNode?.type === 'source' || activeInspectorNode?.type === 'result')) {
      setIsRightOpen(false);
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
    setIsPanning(true);
    setPanStart({
      x: e.clientX - pan.x,
      y: e.clientY - pan.y
    });
  };

  const handleNodePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    if (connectionDraftRef.current) return;
    const node = nodes.find(n => n.id === id);
    if (!node) return;

    setDraggingNode(id);
    setNodeDragOffset({
      x: e.clientX,
      y: e.clientY,
      nodeStartX: node.x,
      nodeStartY: node.y
    });
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (isPanning) {
        setPan({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y
        });
      } else if (draggingNode) {
        const dx = (e.clientX - nodeDragOffset.x) / zoom;
        const dy = (e.clientY - nodeDragOffset.y) / zoom;
        setNodes(nodes.map(n =>
          n.id === draggingNode
            ? { ...n, x: nodeDragOffset.nodeStartX + dx, y: nodeDragOffset.nodeStartY + dy }
            : n
        ));
      }
    };

    const handlePointerUp = () => {
      setIsPanning(false);
      setDraggingNode(null);
    };

    if (isPanning || draggingNode) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isPanning, draggingNode, panStart, nodeDragOffset, zoom, nodes]);

  useEffect(() => {
    if (screen !== 'workspace' || !activeNotebookId) return;
    setWorkspaceNodes(current => ({ ...current, [activeNotebookId]: nodes }));
    setNotebooks(current => current.map(notebook => {
      const visibleCardCount = nodes.filter(node => node.type !== 'assistant').length;
      if (notebook.id !== activeNotebookId || notebook.cardCount === visibleCardCount) return notebook;
      return { ...notebook, cardCount: visibleCardCount, updatedAt: '剛剛' };
    }));
  }, [activeNotebookId, nodes, screen]);

  useEffect(() => {
    if (screen !== 'workspace' || fitViewRequest === 0) return;
    const activeSelectedNode = nodes.find(node => node.id === selectedNodeId);
    const leftInset = isLeftOpen ? 312 : 82;
    const hasInspector = activeSelectedNode?.type === 'source' || activeSelectedNode?.type === 'result';
    const rightInset = isRightOpen ? (activeSelectedNode?.type === 'result' ? 696 : hasInspector ? 436 : 416) : 82;
    const transform = getFitCanvasTransform(
      nodes.filter(node => node.type !== 'assistant').map(node => ({ ...node, ...NODE_SIZES[node.type] })),
      window.innerWidth,
      window.innerHeight,
      leftInset,
      rightInset,
    );
    if (!transform) return;

    zoomRef.current = transform.zoom;
    panRef.current = transform.pan;
    setZoom(transform.zoom);
    setPan(transform.pan);
  }, [fitViewRequest]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (inspectorContentRef.current) inspectorContentRef.current.inert = !isRightOpen;
  }, [isRightOpen]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    if (screen !== 'workspace') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleControlWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault();

      const currentZoom = zoomRef.current;
      const zoomStep = event.deltaY < 0 ? 0.1 : -0.1;
      const nextZoom = Math.max(0.3, Math.min(1.5, Number((currentZoom + zoomStep).toFixed(2))));
      if (nextZoom === currentZoom) return;

      const bounds = canvas.getBoundingClientRect();
      const pointerX = event.clientX - bounds.left;
      const pointerY = event.clientY - bounds.top;
      const currentPan = panRef.current;
      const worldX = (pointerX - currentPan.x) / currentZoom;
      const worldY = (pointerY - currentPan.y) / currentZoom;
      const nextPan = {
        x: pointerX - worldX * nextZoom,
        y: pointerY - worldY * nextZoom,
      };

      zoomRef.current = nextZoom;
      panRef.current = nextPan;
      setZoom(nextZoom);
      setPan(nextPan);
    };

    canvas.addEventListener('wheel', handleControlWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleControlWheel);
  }, [screen]);

  useEffect(() => {
    if (!connectionNotice || connectionDraft) return;
    const timer = window.setTimeout(() => setConnectionNotice(''), 5_000);
    return () => window.clearTimeout(timer);
  }, [connectionNotice, connectionDraft]);

  useEffect(() => {
    if (!connectionDraft) return;

    const targetAt = (clientX: number, clientY: number) => {
      const point = { x: clientX, y: clientY };
      return [...document.querySelectorAll<HTMLElement>('[data-connection-handle="input"]')]
        .map(element => {
          const rect = element.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const topmostAtCenter = document.elementFromPoint(centerX, centerY);
          return {
            nodeId: element.dataset.connectionNodeId ?? null,
            distance: (clientX - centerX) ** 2 + (clientY - centerY) ** 2,
            nearby: rect.width > 0 && rect.height > 0
              && (topmostAtCenter === element || Boolean(topmostAtCenter && element.contains(topmostAtCenter)))
              && isPointNearRect(point, rect, CONNECTION_DROP_MARGIN_PX),
          };
        })
        .filter(candidate => candidate.nodeId && candidate.nearby)
        .sort((left, right) => left.distance - right.distance)[0]?.nodeId ?? null;
    };
    const cancel = (message = '連線已取消。') => {
      updateConnectionDraft(null);
      setConnectionNotice(message);
    };
    const handlePointerMove = (event: PointerEvent) => {
      const currentDraft = connectionDraftRef.current;
      if (!currentDraft || event.pointerId !== currentDraft.pointerId) return;
      updateConnectionDraft({
        ...currentDraft,
        current: clientToCanvasPoint(event.clientX, event.clientY),
        hoveredTargetNodeId: targetAt(event.clientX, event.clientY),
      });
    };
    const handlePointerUp = (event: PointerEvent) => {
      const currentDraft = connectionDraftRef.current;
      if (!currentDraft || event.pointerId !== currentDraft.pointerId) return;
      const targetNodeId = targetAt(event.clientX, event.clientY);
      updateConnectionDraft(null);
      if (!targetNodeId) {
        setConnectionNotice('未放在成果輸入端點上，沒有建立連線。');
        return;
      }
      completeCanvasConnectionRef.current(currentDraft.fromNodeId, targetNodeId);
    };
    const handlePointerCancel = (event: PointerEvent) => {
      const currentDraft = connectionDraftRef.current;
      if (currentDraft && event.pointerId === currentDraft.pointerId) cancel();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel('已按 Esc 取消連線。');
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [connectionDraft?.fromNodeId]);

  const activeNotebook = notebooks.find(notebook => notebook.id === activeNotebookId) ?? null;

  const handleAuthenticated = (user: AuthUser) => {
    requestGate.current.cancelAll();
    clearAllPolicyRadarRunTimers();
    setCurrentUser(user);
    setNotebooks(INITIAL_NOTEBOOKS.map(notebook => ({ ...notebook })));
    setWorkspaceNodes({ ...INITIAL_WORKSPACES });
    setPolicyRadarByNotebook({ ...INITIAL_POLICY_RADAR_STATES });
    setActiveNotebookId(null);
    setSelectedNodeId(null);
    setDirtyInspectorNodeId(null);
    setAnalysisByNode({});
    setPresentationByNode({});
    setReportByNode({});
    setAssistantByNode({});
    setWorkspaceTourSeen(false);
    setIsWorkspaceTourOpen(false);
    firstNotebookTourIdRef.current = null;
    try {
      const draft = readDraft(window.localStorage, user.email);
      if (draft) {
        setWorkspaceTourSeen(draft.workspaceTourSeen === true);
        setNotebooks(draft.notebooks);
        setWorkspaceNodes(draft.workspaces);
        setPolicyRadarByNotebook(draft.radar);
      }
      setDraftWritable(true);
    } catch {
      setDraftWritable(false);
      setDraftNotice('無法讀取本機草稿。已保留原始儲存內容，本次僅使用記憶體，尚未自動保存。');
    }
    setScreen('notebooks');
  };

  const handleLogout = () => {
    if ((!draftWritable || draftSaveFailed) && !window.confirm('本次草稿尚未成功保存，登出可能遺失變更。確定要登出嗎？')) return;
    requestGate.current.cancelAll();
    clearAllPolicyRadarRunTimers();
    setCurrentUser(null);
    setDraftWritable(false);
    setPolicyRadarByNotebook({});
    setActiveNotebookId(null);
    setSelectedNodeId(null);
    setDirtyInspectorNodeId(null);
    setAnalysisByNode({});
    setPresentationByNode({});
    setReportByNode({});
    setAssistantByNode({});
    setWorkspaceTourSeen(false);
    setIsWorkspaceTourOpen(false);
    firstNotebookTourIdRef.current = null;
    setScreen('auth');
  };

  const handleCreateNotebook = (name: string, description: string) =>
    new Promise<Notebook>(resolve => {
      const shouldStartTour = notebooks.length === 0 && !workspaceTourSeen;
      window.setTimeout(() => {
        const notebook: Notebook = {
          id: `notebook-${crypto.randomUUID()}`,
          name,
          description,
          updatedAt: '剛剛',
          cardCount: 0,
        };
        setNotebooks(current => [notebook, ...current]);
        setWorkspaceNodes(current => ({ ...current, [notebook.id]: [createSidebarAssistantNode()] }));
        setPolicyRadarByNotebook(current => ({
          ...current,
          [notebook.id]: createPolicyRadarState(),
        }));
        if (shouldStartTour) firstNotebookTourIdRef.current = notebook.id;
        resolve(notebook);
      }, 650);
    });

  const handleOpenNotebook = (notebook: Notebook) => {
    const isFreshFirstNotebook = firstNotebookTourIdRef.current === notebook.id;
    const shouldStartTour = !workspaceTourSeen && (
      isFreshFirstNotebook
      || (notebooks.length === 1 && notebooks[0]?.id === notebook.id)
    );
    setPolicyRadarByNotebook(current => ({
      ...current,
      [notebook.id]: preparePolicyRadarStateForOpen(current[notebook.id]),
    }));
    setActiveNotebookId(notebook.id);
    setNodes(prepareWorkspaceForSidebarAssistant(workspaceNodes[notebook.id] ?? []));
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setIsLeftOpen(false);
    setIsRightOpen(false);
    setSelectedNodeId(null);
    setDirtyInspectorNodeId(null);
    setIsWorkspaceTourOpen(shouldStartTour);
    setScreen('workspace');
    setFitViewRequest(value => value + 1);
  };

  const handleRenameNotebook = (id: string, name: string, description: string) => {
    setNotebooks(current =>
      current.map(notebook =>
        notebook.id === id ? { ...notebook, name, description, updatedAt: '剛剛' } : notebook,
      ),
    );
  };

  const handleDuplicateNotebook = (source: Notebook) => {
    const existingNames = new Set(notebooks.map(notebook => notebook.name));
    let copyName = `${source.name}（副本）`;
    let copyNumber = 2;
    while (existingNames.has(copyName)) {
      copyName = `${source.name}（副本 ${copyNumber}）`;
      copyNumber += 1;
    }

    const duplicate: Notebook = {
      ...source,
      id: `notebook-${crypto.randomUUID()}`,
      name: copyName,
      updatedAt: '剛剛',
    };
    setNotebooks(current => [duplicate, ...current]);
    setWorkspaceNodes(current => ({
      ...current,
      [duplicate.id]: duplicateWorkspaceNodes(current[source.id] ?? []),
    }));
    setPolicyRadarByNotebook(current => ({
      ...current,
      [duplicate.id]: createPolicyRadarState(),
    }));
  };

  const handleDeleteNotebook = (id: string) => {
    const activeTimer = policyRadarRunTimersRef.current.get(id);
    if (activeTimer !== undefined) {
      window.clearTimeout(activeTimer);
      policyRadarRunTimersRef.current.delete(id);
    }
    setNotebooks(current => current.filter(notebook => notebook.id !== id));
    setWorkspaceNodes(current => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setPolicyRadarByNotebook(current => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (activeNotebookId === id) {
      setActiveNotebookId(null);
      setScreen('notebooks');
    }
  };

  const dismissWorkspaceTour = () => {
    setWorkspaceTourSeen(true);
    setIsWorkspaceTourOpen(false);
    firstNotebookTourIdRef.current = null;
  };

  useEffect(() => {
    if (!isRightOpen || !activeNotebookId) return;
    setPolicyRadarByNotebook(current => {
      const state = current[activeNotebookId] ?? createPolicyRadarState();
      if (state.collapsed) return current;
      return {
        ...current,
        [activeNotebookId]: { ...state, collapsed: true },
      };
    });
  }, [activeNotebookId, isRightOpen]);

  if (screen === 'auth') {
    return <AuthScreen onAuthenticated={handleAuthenticated} textSize={textSize} onTextSizeChange={setTextSize} />;
  }

  if (screen === 'notebooks') {
    return (
      <NotebookHome
        storageNotice={draftNotice}
        displayName={currentUser?.displayName ?? '使用者'}
        notebooks={notebooks}
        onCreate={handleCreateNotebook}
        onOpen={handleOpenNotebook}
        onRename={handleRenameNotebook}
        onDuplicate={handleDuplicateNotebook}
        onDelete={handleDeleteNotebook}
        onLogout={handleLogout}
        textSize={textSize}
        onTextSizeChange={setTextSize}
      />
    );
  }

  const selectedNode = nodes.find(node => node.id === selectedNodeId) ?? null;
  const selectedSource = selectedNode?.type === 'source' ? selectedNode : null;
  const selectedResult = selectedNode?.type === 'result' ? selectedNode : null;
  const sourceNodes = nodes.filter(node => node.type === 'source');
  const resultNodes = nodes.filter(node => node.type === 'result');
  const assistantNodes = nodes.filter(node => node.type === 'assistant');
  const assistantNode = assistantNodes[0] ?? null;
  const canvasNodes = nodes.filter(node => node.type !== 'assistant');
  const assistantDraftActions = getChartDraftActions(assistantNode?.assistant?.draftActions ?? []);
  const sourceNodeIdSet = new Set(sourceNodes.map(source => source.id));
  const canExecuteAssistantDraft = Boolean(
    assistantDraftActions.length
    && assistantDraftActions.every(action => action.sourceNodeIds.some(sourceNodeId => sourceNodeIdSet.has(sourceNodeId))),
  );
  const assistantContextOptions = buildAssistantContextOptions({
    nodes,
    analysisExecutions: analysisByNode,
    presentationExecutions: presentationByNode,
  });
  const availableAssistantContextNodeIds = new Set(
    assistantContextOptions.map(option => option.canvasNodeId),
  );
  const assistantHasUnavailableContext = (assistantNode?.assistant?.contextNodeIds ?? []).some(
    contextNodeId => !availableAssistantContextNodeIds.has(contextNodeId),
  );
  const policyRadarCounts = getPolicyRadarCounts(nodes);
  const hasPolicyRadarContent = policyRadarCounts.readySourceCount > 0
    || policyRadarCounts.configuredResultCount > 0;
  const policyRadarWorkspaceSignature = getPolicyRadarWorkspaceSignature(nodes);
  const activePolicyRadarState = activeNotebookId
    ? policyRadarByNotebook[activeNotebookId] ?? createPolicyRadarState()
    : createPolicyRadarState();

  const isPolicyRadarStale = Boolean(
    activePolicyRadarState.latestRecord
    && activePolicyRadarState.latestRecord.workspaceSignature !== policyRadarWorkspaceSignature,
  );

  const confirmDiscardInspectorChanges = () => {
    if (!dirtyInspectorNodeId) return true;
    const dirtyNode = nodes.find(node => node.id === dirtyInspectorNodeId);
    const label = dirtyNode?.type === 'result'
      ? '成果'
      : dirtyNode?.type === 'assistant'
        ? '小幫手'
        : '來源';
    return window.confirm(`${label}設定尚未儲存，確定要放棄這次修改嗎？`);
  };

  const completeCanvasConnection = (fromNodeId: string, toNodeId: string) => {
    const liveNodes = executionContext.current.nodes;
    const outcome = connectCanvasNodes(liveNodes, fromNodeId, toNodeId);
    if (outcome.status === 'invalid') {
      setConnectionNotice('無法建立連線：來源只能連到圖表，圖表只能連到簡報。');
      return;
    }
    if (outcome.status === 'duplicate') {
      setConnectionNotice('這兩張卡片已經連接。');
      return;
    }

    const fromNode = liveNodes.find(node => node.id === fromNodeId);
    const toNode = liveNodes.find(node => node.id === toNodeId);
    const fromName = fromNode?.source?.name || fromNode?.result?.name || '上游卡片';
    const toName = toNode?.result?.name || '成果卡片';

    requestGate.current.cancel(toNodeId);
    if (outcome.kind === 'source') {
      const downstreamArtifactIds = liveNodes
        .filter(node => (node.result?.kind === 'presentation' || node.result?.kind === 'report')
          && node.result.sourceModuleIds?.includes(toNodeId))
        .map(node => node.id);
      downstreamArtifactIds.forEach(id => requestGate.current.cancel(id));
      setAnalysisByNode(current => {
        if (!(toNodeId in current)) return current;
        const next = { ...current };
        delete next[toNodeId];
        return next;
      });
      setPresentationByNode(current => {
        const idsToClear = new Set([toNodeId, ...downstreamArtifactIds]);
        if (![...idsToClear].some(id => id in current)) return current;
        const next = { ...current };
        idsToClear.forEach(id => delete next[id]);
        return next;
      });
      setReportByNode(current => {
        const idsToClear = new Set([toNodeId, ...downstreamArtifactIds]);
        if (![...idsToClear].some(id => id in current)) return current;
        const next = { ...current };
        idsToClear.forEach(id => delete next[id]);
        return next;
      });
    } else {
      setPresentationByNode(current => {
        if (!(toNodeId in current)) return current;
        const next = { ...current };
        delete next[toNodeId];
        return next;
      });
      setReportByNode(current => {
        if (!(toNodeId in current)) return current;
        const next = { ...current };
        delete next[toNodeId];
        return next;
      });
    }

    setNodes(outcome.nodes);
    setDirtyInspectorNodeId(null);
    setSelectedNodeId(toNodeId);
    setIsRightOpen(true);
    setNotebooks(current => current.map(notebook =>
      notebook.id === activeNotebookId ? { ...notebook, updatedAt: '剛剛' } : notebook,
    ));
    setConnectionNotice(outcome.status === 'replaced'
      ? `「${toName}」已改用「${fromName}」；舊分析結果已清除。`
      : `已連接「${fromName}」與「${toName}」。`);
  };
  completeCanvasConnectionRef.current = completeCanvasConnection;

  const handleConnectionPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    fromNodeId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (dirtyInspectorNodeId) {
      window.alert('請先儲存或放棄卡片設定的修改，再建立連線。');
      return;
    }

    const fromNode = nodes.find(node => node.id === fromNodeId);
    const kind = outputConnectionKind(fromNode);
    const start = fromNode ? connectionPortPoint(fromNode, 'output') : null;
    if (!kind || !start) return;

    setIsPanning(false);
    setDraggingNode(null);
    setConnectionNotice(kind === 'source'
      ? '拖曳到圖表卡片左側的藍色端點。'
      : '拖曳到簡報卡片左側的紫色端點。');
    updateConnectionDraft({
      fromNodeId,
      pointerId: event.pointerId,
      kind,
      start,
      current: start,
      hoveredTargetNodeId: null,
    });
  };

  const handleSelectNode = (id: string) => {
    if (selectedNodeId !== id && !confirmDiscardInspectorChanges()) return false;
    if (selectedNodeId !== id) setDirtyInspectorNodeId(null);
    const nextNode = nodes.find(node => node.id === id);
    setSelectedNodeId(id);
    setIsRightOpen(nextNode?.type !== 'assistant');
    return true;
  };

  const closeInspector = () => {
    setDirtyInspectorNodeId(null);
    setSelectedNodeId(null);
    setIsRightOpen(true);
  };

  const handleOpenAssistantChat = () => {
    if (!confirmDiscardInspectorChanges()) return;
    setDirtyInspectorNodeId(null);
    setSelectedNodeId(null);
    setIsRightOpen(true);
  };

  const handleReturnToNotebooks = () => {
    if (!confirmDiscardInspectorChanges()) return;
    setDirtyInspectorNodeId(null);
    setSelectedNodeId(null);
    setScreen('notebooks');
  };

  const handleTogglePolicyRadar = () => {
    if (!activeNotebookId) return;
    const notebookId = activeNotebookId;
    setPolicyRadarByNotebook(current => {
      const currentState = current[notebookId] ?? createPolicyRadarState();
      return {
        ...current,
        [notebookId]: { ...currentState, collapsed: !currentState.collapsed },
      };
    });
  };

  const handleRunPolicyRadar = () => {
    if (!activeNotebookId || policyRadarCounts.readySourceCount === 0) return;

    const notebookId = activeNotebookId;
    const runId = `policy-radar-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const capturedCounts = { ...policyRadarCounts };
    const capturedSignature = policyRadarWorkspaceSignature;
    const previousTimer = policyRadarRunTimersRef.current.get(notebookId);

    if (previousTimer !== undefined) window.clearTimeout(previousTimer);

    setPolicyRadarByNotebook(current => {
      const currentState = current[notebookId] ?? createPolicyRadarState();
      return {
        ...current,
        [notebookId]: {
          ...currentState,
          running: true,
          activeRunId: runId,
        },
      };
    });
    setNotebooks(current => current.map(notebook => (
      notebook.id === notebookId ? { ...notebook, updatedAt: '剛剛' } : notebook
    )));

    const timerId = window.setTimeout(() => {
      policyRadarRunTimersRef.current.delete(notebookId);
      setPolicyRadarByNotebook(current => {
        const currentState = current[notebookId];
        if (!currentState || currentState.activeRunId !== runId) return current;

        return {
          ...current,
          [notebookId]: {
            ...currentState,
            running: false,
            activeRunId: undefined,
            latestRecord: {
              counts: capturedCounts,
              createdAt: new Date().toISOString(),
              workspaceSignature: capturedSignature,
            },
          },
        };
      });
    }, 900);

    policyRadarRunTimersRef.current.set(notebookId, timerId);
  };

  const findOpenCardPosition = (
    x: number,
    y: number,
    type: AddableCardType,
    existingNodes: CanvasNode[] = nodes,
    rightInsetOverride?: number,
  ) => {
    const candidateSize = NODE_SIZES[type];
    const rightInset = rightInsetOverride ?? (type === 'result' ? 696 : 436);
    const visibleBounds = {
      left: ((isLeftOpen ? 308 : 76) - pan.x) / zoom,
      right: (window.innerWidth - rightInset - pan.x) / zoom,
      top: (80 - pan.y) / zoom,
      bottom: (window.innerHeight - 80 - pan.y) / zoom,
    };
    let openPosition = { x, y, score: Number.POSITIVE_INFINITY };

    for (let row = -12; row <= 12; row += 1) {
      for (let column = -12; column <= 12; column += 1) {
        const candidateX = x + column * 36;
        const candidateY = y + row * 36;
        if (existingNodes.some(node => node.type !== 'assistant' && cardWouldOverlap(candidateX, candidateY, type, node))) continue;

        const outsideDistance = (
          Math.max(0, visibleBounds.left - candidateX)
          + Math.max(0, candidateX + candidateSize.width - visibleBounds.right)
          + Math.max(0, visibleBounds.top - candidateY)
          + Math.max(0, candidateY + candidateSize.height - visibleBounds.bottom)
        );
        const distanceFromDrop = Math.hypot(candidateX - x, candidateY - y);
        const score = distanceFromDrop + outsideDistance * 12;

        if (score < openPosition.score) {
          openPosition = { x: candidateX, y: candidateY, score };
        }
      }
    }

    return Number.isFinite(openPosition.score) ? openPosition : { x, y };
  };

  const findDownstreamCardPosition = (anchor: CanvasNode, type: AddableCardType) => {
    const anchorSize = NODE_SIZES[anchor.type];
    const targetSize = NODE_SIZES[type];
    const x = anchor.x + anchorSize.width + 80;
    const verticalStep = targetSize.height + 40;
    const rowOffsets = [0, 1, -1, 2, -2, 3, -3];

    for (const rowOffset of rowOffsets) {
      const y = anchor.y + rowOffset * verticalStep;
      if (!nodes.some(node => node.type !== 'assistant' && cardWouldOverlap(x, y, type, node))) return { x, y };
    }

    return findOpenCardPosition(x, anchor.y, type);
  };

  const addSourceNode = (x: number, y: number) => {
    if (!confirmDiscardInspectorChanges()) return false;

    const sourceNumber = sourceNodes.length + 1;
    const existingNames = new Set(sourceNodes.map(node => node.source?.name.trim()).filter(Boolean));
    let sourceName = '未命名來源';
    let sourceNameNumber = 2;
    while (existingNames.has(sourceName)) {
      sourceName = `未命名來源 ${sourceNameNumber}`;
      sourceNameNumber += 1;
    }
    const position = findOpenCardPosition(x, y, 'source');
    const sourceNode: CanvasNode = {
      id: `source-${Date.now()}-${sourceNumber}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'source',
      x: position.x,
      y: position.y,
      source: {
        kind: null,
        name: sourceName,
        enabled: true,
        autoClean: true,
      },
    };

    setNodes(current => [...current, sourceNode]);
    setDirtyInspectorNodeId(null);
    setSelectedNodeId(sourceNode.id);
    setIsRightOpen(true);
    return true;
  };

  const addResultNode = (x: number, y: number, rightInsetOverride?: number) => {
    if (!confirmDiscardInspectorChanges()) return false;

    const resultNumber = resultNodes.length + 1;
    const existingNames = new Set(resultNodes.map(node => node.result?.name.trim()).filter(Boolean));
    let resultName = '未命名成果';
    let resultNameNumber = 2;
    while (existingNames.has(resultName)) {
      resultName = `未命名成果 ${resultNameNumber}`;
      resultNameNumber += 1;
    }
    const position = findOpenCardPosition(x, y, 'result', nodes, rightInsetOverride);
    const resultNode: CanvasNode = {
      id: `result-${Date.now()}-${resultNumber}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'result',
      x: position.x,
      y: position.y,
      result: {
        kind: null,
        name: resultName,
        sourceNodeIds: [],
        prompt: '',
      },
    };

    setNodes(current => [...current, resultNode]);
    setDirtyInspectorNodeId(null);
    setSelectedNodeId(resultNode.id);
    setIsRightOpen(true);
    return true;
  };

  const handleAddCardFromClick = (type: AddableCardType) => {
    const leftEdge = isLeftOpen ? 312 : 82;
    const rightEdge = type === 'result' ? 82 : 436;
    const visibleBounds = {
      left: (leftEdge - pan.x) / zoom,
      right: (window.innerWidth - rightEdge - pan.x) / zoom,
      top: (80 - pan.y) / zoom,
      bottom: (window.innerHeight - 80 - pan.y) / zoom,
    };
    const availableWidth = visibleBounds.right - visibleBounds.left;
    const columnGap = 140;
    const columnMargin = Math.max(
      40,
      (availableWidth - SOURCE_CARD_SIZE.width - RESULT_CARD_SIZE.width - columnGap) / 2,
    );
    const x = type === 'source'
      ? visibleBounds.left + columnMargin
      : visibleBounds.right - RESULT_CARD_SIZE.width - columnMargin;
    const y = type === 'source'
      ? visibleBounds.top + 140 + sourceNodes.length * (SOURCE_CARD_SIZE.height + 40)
      : (visibleBounds.top + visibleBounds.bottom - RESULT_CARD_SIZE.height) / 2
        + resultNodes.length * 40;

    const added = type === 'source'
      ? addSourceNode(x, y)
      : addResultNode(x, y, rightEdge);
    if (!added) return;

    if (type === 'result') {
      setIsRightOpen(false);
      setConnectionNotice('從來源或圖表右側端點拖到新成果左側端點；連接後會自動開啟設定。');
    }
    setFitViewRequest(value => value + 1);
  };

  const handleStartTourWithSource = () => {
    dismissWorkspaceTour();
    handleAddCardFromClick('source');
  };

  const handleCardDragStart = (
    event: React.DragEvent<HTMLButtonElement>,
    type: AddableCardType,
  ) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(CARD_DRAG_TYPE, type);
  };

  const handleCanvasDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes(CARD_DRAG_TYPE) ? 'copy' : 'none';
  };

  const handleCanvasDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    const cardType = event.dataTransfer.getData(CARD_DRAG_TYPE);
    if (cardType !== 'source' && cardType !== 'result') return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const cardSize = NODE_SIZES[cardType];
    const x = (event.clientX - bounds.left - pan.x) / zoom - cardSize.width / 2;
    const y = (event.clientY - bounds.top - pan.y) / zoom - cardSize.height / 2;
    if (cardType === 'source') addSourceNode(x, y);
    else addResultNode(x, y);
  };

  const handleSaveSource = (source: SourceConfig) => {
    if (!selectedSource) return;
    const sourceNodeId = selectedSource.id;
    const affectedAnalysisIds = nodes
      .filter(node => node.result?.kind === 'chart' && node.result.sourceNodeIds.includes(sourceNodeId))
      .map(node => node.id);
    setNodes(current => current.map(node =>
      node.id === sourceNodeId
        ? { ...node, source: updateSourceConfig(node.source, source) }
        : node,
    ));
    setAnalysisByNode(current => {
      const next = { ...current };
      affectedAnalysisIds.forEach(nodeId => delete next[nodeId]);
      return next;
    });
    setPresentationByNode(current => {
      const next = { ...current };
      nodes
        .filter(node => node.result?.sourceModuleIds?.some(id => affectedAnalysisIds.includes(id)))
        .forEach(node => delete next[node.id]);
      return next;
    });
    setReportByNode(current => {
      const next = { ...current };
      nodes
        .filter(node => node.result?.sourceModuleIds?.some(id => affectedAnalysisIds.includes(id)))
        .forEach(node => delete next[node.id]);
      return next;
    });
    setDirtyInspectorNodeId(null);
    setNotebooks(current => current.map(notebook =>
      notebook.id === activeNotebookId ? { ...notebook, updatedAt: '剛剛' } : notebook,
    ));
  };

  const handleSaveResult = (result: ResultConfig) => {
    if (!selectedResult) return;
    const resultNodeId = selectedResult.id;
    setNodes(current => current.map(node =>
      node.id === resultNodeId
        ? {
          ...node,
          result: {
            ...result,
            sourceNodeIds: [...result.sourceNodeIds],
            sourceModuleIds: result.sourceModuleIds ? [...result.sourceModuleIds] : undefined,
          },
        }
        : node,
    ));
    setAnalysisByNode(current => {
      const next = { ...current };
      delete next[resultNodeId];
      return next;
    });
    setPresentationByNode(current => {
      const next = { ...current };
      delete next[resultNodeId];
      nodes
        .filter(node => node.result?.sourceModuleIds?.includes(resultNodeId))
        .forEach(node => delete next[node.id]);
      return next;
    });
    setReportByNode(current => {
      const next = { ...current };
      delete next[resultNodeId];
      nodes
        .filter(node => node.result?.sourceModuleIds?.includes(resultNodeId))
        .forEach(node => delete next[node.id]);
      return next;
    });
    setDirtyInspectorNodeId(null);
    setNotebooks(current => current.map(notebook =>
      notebook.id === activeNotebookId ? { ...notebook, updatedAt: '剛剛' } : notebook,
    ));
  };

  const beginExecution = (id: string) => {
    if (dirtyInspectorNodeId) {
      window.alert('請先儲存或放棄卡片設定的修改，再執行分析或產生成果。');
      return null;
    }
    if (analysisByNode[id]?.state === 'running'
      || presentationByNode[id]?.state === 'running'
      || reportByNode[id]?.state === 'running') return null;
    const controller = requestGate.current.begin(id);
    const projectId = activeNotebookId!;
    const inputSignature = resultInputSignature(id, nodes, analysisByNode);
    setSelectedNodeId(id);
    setIsRightOpen(true);
    const isCurrent = () => {
      const live = executionContext.current;
      return requestGate.current.isCurrent(id, controller) && live.screen === 'workspace'
        && live.activeNotebookId === projectId
        && resultInputSignature(id, live.nodes, live.analysisByNode) === inputSignature;
    };
    return { controller, projectId, inputSignature, isCurrent };
  };

  const handleRunAnalysis = async (resultNodeId: string) => {
    const resultNode = nodes.find(node => node.id === resultNodeId);
    if (!activeNotebookId || resultNode?.result?.kind !== 'chart') return;
    const run = beginExecution(resultNodeId);
    if (!run) return;
    // Never reuse a backend module ID: an aborted HTTP request may still finish on the server.
    const moduleId = `analysis-${crypto.randomUUID()}`;
    const metadata = { projectId: run.projectId, moduleId, inputSignature: run.inputSignature };
    setAnalysisByNode(current => ({ ...current, [resultNodeId]: { ...metadata, state: 'running' } }));
    setPresentationByNode(current => {
      const next = { ...current };
      nodes.filter(node => node.result?.sourceModuleIds?.includes(resultNodeId)).forEach(node => {
        requestGate.current.cancel(node.id);
        delete next[node.id];
      });
      return next;
    });
    setReportByNode(current => {
      const next = { ...current };
      nodes
        .filter(node => node.result?.sourceModuleIds?.includes(resultNodeId))
        .forEach(node => {
          requestGate.current.cancel(node.id);
          delete next[node.id];
        });
      return next;
    });
    try {
      const request = buildAnalysisRequest({
        projectId: run.projectId, moduleId, result: resultNode.result, sourceNodes,
      });
      const catalog = await loadSourceCatalog(import.meta.env.VITE_YOUTHLM_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '', run.controller.signal);
      if (!run.isCurrent()) return;
      for (const selection of request.source_selections) {
        const source = catalog.find(item => item.source_id === selection.source_id);
        if (!source || !supportsSourceFilters(source)) throw new Error('選取的資料集目前不可用，請重新整理來源目錄。');
        const problem = validateSourceFilters(source, selection.filters);
        if (problem) throw new Error(problem);
      }
      const response = await runAnalysis(request, undefined, undefined, { signal: run.controller.signal });
      if (!run.isCurrent()) return;
      if (response.httpStatus < 400 && !response.payload.error
        && (response.payload.project_id !== request.project_id || response.payload.module_id !== moduleId)) {
        throw new Error('後端回應的筆記本／分析編號不符，已停止套用結果。');
      }
      const view = buildChartArtifactView(response.payload, { httpStatus: response.httpStatus });
      setAnalysisByNode(current => ({ ...current, [resultNodeId]: {
        ...metadata, state: view.kind === 'error' ? 'failed' : 'ready', view,
      } }));
    } catch (error) {
      if (!run.isCurrent()) return;
      setAnalysisByNode(current => ({ ...current, [resultNodeId]: {
        ...metadata, state: 'failed', view: {
          kind: 'error', httpStatus: 0, code: 'frontend_integration_error',
          message: error instanceof Error ? error.message : '後端無法完成分析。', retriable: true,
        },
      } }));
    } finally { requestGate.current.finish(resultNodeId, run.controller); }
  };

  const handleRunPresentation = async (resultNodeId: string) => {
    const resultNode = nodes.find(node => node.id === resultNodeId);
    if (!activeNotebookId || resultNode?.result?.kind !== 'presentation') return;
    const run = beginExecution(resultNodeId);
    if (!run) return;
    const metadata = { projectId: run.projectId, inputSignature: run.inputSignature };
    setPresentationByNode(current => ({ ...current, [resultNodeId]: { ...metadata, state: 'running' } }));
    try {
      const request = buildPresentationRequest({
        projectId: run.projectId, result: resultNode.result, analyses: analysisByNode,
      });
      const response = await createPresentation(request, undefined, undefined, { signal: run.controller.signal });
      if (!run.isCurrent()) return;
      const view = buildPresentationArtifactView(response.payload, { httpStatus: response.httpStatus });
      if (view.kind === 'ready' && (view.projectId !== run.projectId
        || JSON.stringify([...view.sourceModuleIds].sort()) !== JSON.stringify([...request.source_module_ids].sort()))) {
        throw new Error('簡報引用的分析與目前選取不符，已停止套用結果。');
      }
      setPresentationByNode(current => ({ ...current, [resultNodeId]: {
        ...metadata, state: view.kind === 'error' ? 'failed' : 'ready', view,
      } }));
    } catch (error) {
      if (!run.isCurrent()) return;
      setPresentationByNode(current => ({ ...current, [resultNodeId]: {
        ...metadata, state: 'failed', view: {
          kind: 'error', httpStatus: 0, code: 'frontend_integration_error',
          message: error instanceof Error ? error.message : '後端無法產生簡報。',
          retriable: true, details: {},
        },
      } }));
    } finally { requestGate.current.finish(resultNodeId, run.controller); }
  };

  const handleCancelExecution = (id: string) => {
    requestGate.current.cancel(id);
    const view = { kind: 'error' as const, httpStatus: 0, code: 'cancelled',
      message: '已停止等待；後端可能仍在處理。重試會建立新工作，不會引用舊回應。', retriable: true, details: {} };
    setAnalysisByNode(current => current[id]?.state === 'running'
      ? { ...current, [id]: { ...current[id], state: 'failed', view } } : current);
    setPresentationByNode(current => current[id]?.state === 'running'
      ? { ...current, [id]: { ...current[id], state: 'failed', view } } : current);
    setReportByNode(current => current[id]?.state === 'running'
      ? { ...current, [id]: { ...current[id], state: 'failed', view } } : current);
  };

  const handleCreateChartFromSource = (id: string) => {
    const source = nodes.find(node => node.id === id && node.type === 'source');
    if (!source || !isSourceReady(source) || !confirmDiscardInspectorChanges()) return;

    const position = findDownstreamCardPosition(source, 'result');
    const newId = `result-${crypto.randomUUID()}`;
    const guidedResult = createGuidedChartResult(id, source.source?.name || '資料來源');
    guidedResult.name = getUniqueName(
      guidedResult.name,
      new Set(resultNodes.map(node => node.result?.name || '')),
    );
    setNodes(current => [...current, {
      id: newId,
      type: 'result',
      x: position.x,
      y: position.y,
      result: guidedResult,
    }]);
    setDirtyInspectorNodeId(null);
    setSelectedNodeId(null);
    setIsRightOpen(true);
    setConnectionNotice('已建立並連接圖表；可直接執行，或用鉛筆調整分析問題。');
    setFitViewRequest(value => value + 1);
  };

  const handleCreatePresentationFromAnalysis = (id: string) => {
    if (!isAnalysisReady(analysisByNode[id]) || !confirmDiscardInspectorChanges()) return;
    const source = nodes.find(node => node.id === id)!;
    const position = findDownstreamCardPosition(source, 'result');
    const newId = `result-${crypto.randomUUID()}`;
    const name = getUniqueName(`${source.result?.name || '分析'}簡報`, new Set(resultNodes.map(node => node.result?.name || '')));
    setNodes(current => [...current, {
      id: newId, type: 'result', x: position.x, y: position.y,
      result: { kind: 'presentation', name, sourceNodeIds: [], sourceModuleIds: [id],
        prompt: '保留資料限制、來源與警告，整理為政策會議使用的洞察簡報。' },
    }]);
    setDirtyInspectorNodeId(null);
    setSelectedNodeId(null);
    setIsRightOpen(true);
    setConnectionNotice('已建立並連接簡報；可直接產生，或用鉛筆調整內容指示。');
    setFitViewRequest(value => value + 1);
  };

  const handleRunReport = async (resultNodeId: string) => {
    const resultNode = nodes.find(node => node.id === resultNodeId);
    if (!activeNotebookId || resultNode?.result?.kind !== 'report') return;
    const run = beginExecution(resultNodeId);
    if (!run) return;
    const metadata = { projectId: run.projectId, inputSignature: run.inputSignature };
    setReportByNode(current => ({ ...current, [resultNodeId]: { ...metadata, state: 'running' } }));

    try {
      const request = buildReportRequest({
        projectId: run.projectId,
        result: resultNode.result,
      });
      const response = await createReport(request, undefined, undefined, { signal: run.controller.signal });
      if (!run.isCurrent()) return;
      const view = buildReportArtifactView(response.payload, {
        httpStatus: response.httpStatus,
      });
      if (view.kind === 'ready' && (view.projectId !== run.projectId
        || JSON.stringify([...view.sourceModuleIds].sort()) !== JSON.stringify([...request.source_module_ids].sort()))) {
        throw new Error('報告引用的分析與目前選取不符，已停止套用結果。');
      }
      setReportByNode(current => ({
        ...current,
        [resultNodeId]: {
          ...metadata,
          state: view.kind === 'error' ? 'failed' : 'ready',
          view,
        },
      }));
    } catch (error) {
      if (!run.isCurrent()) return;
      const message = error instanceof Error ? error.message : 'YouthLM API 無法產生研析報告';
      setReportByNode(current => ({
        ...current,
        [resultNodeId]: {
          ...metadata,
          state: 'failed',
          view: {
            kind: 'error',
            httpStatus: 0,
            code: 'frontend_integration_error',
            message,
            retriable: true,
            details: {},
          },
        },
      }));
    } finally { requestGate.current.finish(resultNodeId, run.controller); }
  };

  const executeAssistantRequest = async (
    id: string,
    prompt: string,
    { appendUserMessage = true }: { appendUserMessage?: boolean } = {},
  ) => {
    if (!activeNotebookId) return;
    const assistantNode = nodes.find(
      node => node.id === id && node.type === 'assistant',
    );
    if (!assistantNode?.assistant) return;
    const controller = requestGate.current.begin(id);
    const projectId = activeNotebookId;
    const isCurrent = () => {
      const live = executionContext.current;
      return requestGate.current.isCurrent(id, controller)
        && live.screen === 'workspace'
        && live.activeNotebookId === projectId;
    };

    const submittedAt = Date.now();
    const contextOptions = buildAssistantContextOptions({
      nodes,
      analysisExecutions: analysisByNode,
      presentationExecutions: presentationByNode,
    });
    setNodes(current => current.map(node => {
      if (node.id !== id || node.type !== 'assistant' || !node.assistant) return node;
      return {
        ...node,
        assistant: {
          ...node.assistant,
          lastPrompt: prompt,
          messages: appendUserMessage
            ? [
              ...node.assistant.messages,
              {
                id: `${id}-user-${submittedAt}`,
                role: 'user',
                content: prompt,
                createdAt: new Date(submittedAt).toISOString(),
              },
            ]
            : node.assistant.messages,
        },
      };
    }));
    setAssistantByNode(current => ({
      ...current,
      [id]: { state: 'running' },
    }));

    try {
      const request = buildAssistantRequest({
        projectId,
        assistantId: id,
        message: prompt,
        selectedContextNodeIds: assistantNode.assistant.contextNodeIds ?? [],
        contextOptions,
      });
      const response = await runAssistant(request, undefined, undefined, { signal: controller.signal });
      if (!isCurrent()) return;
      const view = buildAssistantResultView(response.payload, {
        httpStatus: response.httpStatus,
      });
      if (view.kind === 'error') {
        setAssistantByNode(current => ({
          ...current,
          [id]: { state: 'failed', view },
        }));
        return;
      }
      if (view.projectId !== projectId || view.assistantId !== id) {
        throw new Error('小幫手回應的筆記本／卡片編號不符，已停止套用結果。');
      }

      const answeredAt = Date.now();
      setNodes(current => current.map(node => {
        if (node.id !== id || node.type !== 'assistant' || !node.assistant) return node;
        return {
          ...node,
          assistant: {
            ...node.assistant,
            messages: [
              ...node.assistant.messages,
              {
                id: `${id}-assistant-${answeredAt}`,
                role: 'assistant',
                content: view.answer,
                createdAt: new Date(answeredAt).toISOString(),
                resolvedReferences: view.resolvedReferences,
                toolExecutions: view.toolExecutions,
              },
            ],
          },
        };
      }));
      setAssistantByNode(current => ({
        ...current,
        [id]: { state: 'ready', view },
      }));
    } catch (error) {
      if (!isCurrent()) return;
      const message = error instanceof Error ? error.message : 'YouthLM API 無法完成小幫手請求';
      setAssistantByNode(current => ({
        ...current,
        [id]: {
          state: 'failed',
          view: {
            kind: 'error',
            httpStatus: 0,
            code: 'frontend_integration_error',
            message,
            retriable: true,
            details: {},
          },
        },
      }));
    } finally {
      requestGate.current.finish(id, controller);
      setNotebooks(current => current.map(notebook =>
        notebook.id === projectId ? { ...notebook, updatedAt: '剛剛' } : notebook,
      ));
    }
  };

  const handleAssistantSubmit = (id: string, prompt: string) => {
    void executeAssistantRequest(id, prompt);
  };

  const handleAssistantRetry = (id: string) => {
    const prompt = nodes.find(node => node.id === id)?.assistant?.lastPrompt;
    if (prompt) void executeAssistantRequest(id, prompt, { appendUserMessage: false });
  };

  const handleAssistantToggleContext = (assistantId: string, contextNodeId: string) => {
    setNodes(current => current.map(node => {
      if (node.id !== assistantId || node.type !== 'assistant' || !node.assistant) return node;
      const contextNodeIds = node.assistant.contextNodeIds ?? [];
      return {
        ...node,
        assistant: {
          ...node.assistant,
          contextNodeIds: contextNodeIds.includes(contextNodeId)
            ? contextNodeIds.filter(id => id !== contextNodeId)
            : [...contextNodeIds, contextNodeId],
        },
      };
    }));
  };

  const handleAssistantExecuteDraft = (id: string) => {
    const executedAt = Date.now();
    setNodes(current => {
      const assistantNode = current.find(node => node.id === id && node.type === 'assistant');
      if (!assistantNode?.assistant || assistantNode.assistant.draftActions.length === 0) return current;

      const currentSourceNodeIds = new Set(
        current.filter(node => node.type === 'source').map(node => node.id),
      );
      const existingResultNames = new Set(
        current.flatMap(node => (
          node.type === 'result' && node.result?.name.trim() ? [node.result.name.trim()] : []
        )),
      );
      let workingNodes = [...current];
      let createdCount = 0;
      const linkedSourceNodeIds = new Set<string>();

      getChartDraftActions(assistantNode.assistant.draftActions).forEach((action, index) => {
        const validSourceNodeIds = action.sourceNodeIds.filter(sourceNodeId => currentSourceNodeIds.has(sourceNodeId));
        if (validSourceNodeIds.length === 0) return;
        validSourceNodeIds.forEach(sourceNodeId => linkedSourceNodeIds.add(sourceNodeId));

        const sourceAnchor = current.find(node => node.id === validSourceNodeIds[0]);
        const preferredPosition = {
          x: (sourceAnchor?.x ?? 80) + SOURCE_CARD_SIZE.width + 80,
          y: (sourceAnchor?.y ?? 180) + index * (RESULT_CARD_SIZE.height + 36),
        };
        const position = workingNodes.some(node => (
          node.type !== 'assistant'
          && node.id !== sourceAnchor?.id
          && cardWouldOverlap(preferredPosition.x, preferredPosition.y, 'result', node)
        ))
          ? findOpenCardPosition(preferredPosition.x, preferredPosition.y, 'result', workingNodes, 416)
          : preferredPosition;
        const resultNode: CanvasNode = {
          id: `result-assistant-${executedAt}-${index + 1}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'result',
          x: position.x,
          y: position.y,
          result: {
            kind: action.kind,
            name: getUniqueName(action.name, existingResultNames),
            sourceNodeIds: validSourceNodeIds,
            prompt: action.prompt,
          },
        };
        workingNodes = [...workingNodes, resultNode];
        createdCount += 1;
      });

      const notice = createdCount > 0
        ? `已建立 ${createdCount} 張圖表草稿並連結 ${linkedSourceNodeIds.size} 張來源。請在圖表卡片執行分析後查看可信成果。`
        : '目前沒有可用的來源連結，因此沒有建立成果草稿。請重新選擇或新增來源後，再送出一次需求。';

      return workingNodes.map(node => {
        if (node.id !== id || node.type !== 'assistant' || !node.assistant) return node;
        return {
          ...node,
          assistant: {
            ...node.assistant,
            draftActions: createdCount > 0 ? [] : node.assistant.draftActions,
            messages: [
              ...node.assistant.messages,
              {
                id: `${id}-notice-${executedAt}`,
                role: 'assistant',
                content: notice,
                createdAt: new Date(executedAt).toISOString(),
              },
            ],
          },
        };
      });
    });
    setNotebooks(current => current.map(notebook =>
      notebook.id === activeNotebookId ? { ...notebook, updatedAt: '剛剛' } : notebook,
    ));
    setFitViewRequest(current => current + 1);
  };

  const handleDeleteSource = (id: string) => {
    let shouldDiscardOtherInspector = false;
    if (selectedNodeId !== id && dirtyInspectorNodeId) {
      if (!confirmDiscardInspectorChanges()) return;
      shouldDiscardOtherInspector = true;
    }
    const sourceName = nodes.find(node => node.id === id)?.source?.name || '這張來源';
    const affectedAnalysisIds = nodes
      .filter(node => node.result?.kind === 'chart' && node.result.sourceNodeIds.includes(id))
      .map(node => node.id);
    if (!window.confirm(`確定要刪除「${sourceName}」嗎？已連結成果會移除此來源。`)) return;

    if (shouldDiscardOtherInspector) {
      setSelectedNodeId(null);
      setDirtyInspectorNodeId(null);
    }

    setNodes(current => removeSourceNode(current, id));
    setAnalysisByNode(current => {
      const next = { ...current };
      affectedAnalysisIds.forEach(nodeId => delete next[nodeId]);
      return next;
    });
    setPresentationByNode(current => {
      const next = { ...current };
      nodes
        .filter(node => node.result?.sourceModuleIds?.some(nodeId => affectedAnalysisIds.includes(nodeId)))
        .forEach(node => delete next[node.id]);
      return next;
    });
    setReportByNode(current => {
      const next = { ...current };
      nodes
        .filter(node => node.result?.sourceModuleIds?.some(nodeId => affectedAnalysisIds.includes(nodeId)))
        .forEach(node => delete next[node.id]);
      return next;
    });
    if (selectedNodeId === id) {
      setSelectedNodeId(null);
      setDirtyInspectorNodeId(null);
    }
  };

  const handleDeleteResult = (id: string) => {
    let shouldDiscardOtherInspector = false;
    if (selectedNodeId !== id && dirtyInspectorNodeId) {
      if (!confirmDiscardInspectorChanges()) return;
      shouldDiscardOtherInspector = true;
    }
    const resultName = nodes.find(node => node.id === id)?.result?.name || '這張成果';
    if (!window.confirm(`確定要刪除「${resultName}」嗎？這項操作目前無法復原。`)) return;

    if (shouldDiscardOtherInspector) {
      setSelectedNodeId(null);
      setDirtyInspectorNodeId(null);
    }

    setNodes(current => removeResultNode(current, id));
    setAnalysisByNode(current => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setPresentationByNode(current => {
      const next = { ...current };
      delete next[id];
      nodes
        .filter(node => node.result?.sourceModuleIds?.includes(id))
        .forEach(node => delete next[node.id]);
      return next;
    });
    setReportByNode(current => {
      const next = { ...current };
      delete next[id];
      nodes
        .filter(node => node.result?.sourceModuleIds?.includes(id))
        .forEach(node => delete next[node.id]);
      return next;
    });
    if (selectedNodeId === id) {
      setSelectedNodeId(null);
      setDirtyInspectorNodeId(null);
    }
  };

  // Zoom and Fit Controls
  const handleZoomIn = () => setZoom(z => Math.min(1.5, z + 0.1));
  const handleZoomOut = () => setZoom(z => Math.max(0.3, z - 0.1));
  const handleFitView = () => {
    const leftInset = isLeftOpen ? 312 : 82;
    const rightInset = isRightOpen ? (selectedResult ? 696 : selectedSource ? 436 : 416) : 82;
    const transform = getFitCanvasTransform(
      canvasNodes.map(node => ({ ...node, ...NODE_SIZES[node.type] })),
      window.innerWidth,
      window.innerHeight,
      leftInset,
      rightInset,
    );
    if (!transform) return;

    zoomRef.current = transform.zoom;
    panRef.current = transform.pan;
    setZoom(transform.zoom);
    setPan(transform.pan);
  };

  // Node Positions and Connection Points
  const resultConnections = resultNodes.filter(node => usesRawSourceInputs(node.result)).flatMap(resultNode =>
    (resultNode.result?.sourceNodeIds ?? []).flatMap(sourceNodeId => {
      const sourceNode = sourceNodes.find(node => node.id === sourceNodeId);
      if (!sourceNode) return [];
      const start = connectionPortPoint(sourceNode, 'output');
      const end = connectionPortPoint(resultNode, 'input');
      if (!start || !end) return [];
      return [{
        id: `${sourceNode.id}-${resultNode.id}`,
        kind: 'source' as const,
        start,
        end,
      }];
    }),
  );
  const generatedArtifactConnections = resultNodes
    .filter(node => node.result?.kind === 'presentation' || node.result?.kind === 'report')
    .flatMap(artifactNode => (artifactNode.result?.sourceModuleIds ?? []).flatMap(sourceModuleId => {
      const analysisNode = resultNodes.find(node => node.id === sourceModuleId && node.result?.kind === 'chart');
      if (!analysisNode) return [];
      const start = connectionPortPoint(analysisNode, 'output');
      const end = connectionPortPoint(artifactNode, 'input');
      if (!start || !end) return [];
      return [{
        id: `${analysisNode.id}-${artifactNode.id}`,
        kind: 'analysis' as const,
        start,
        end,
      }];
    }));
  const artifactConnections = [...resultConnections, ...generatedArtifactConnections];

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden font-sans relative">
      {draftNotice && <div role="status" className="pointer-events-none absolute bottom-0 left-4 z-50 max-w-[calc(100vw-32px)] rounded bg-white/95 px-2 py-1 text-[10px] text-slate-600">{draftNotice}</div>}
      {connectionNotice && (
        <div
          role="status"
          data-connection-notice="true"
          className="pointer-events-none absolute bottom-16 left-1/2 z-50 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm"
        >
          {connectionNotice}
        </div>
      )}

      {/* Floating Header */}
      <header className="absolute top-4 left-4 right-4 z-50 flex items-start justify-between gap-3 pointer-events-none">
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-3">
          <div className="flex min-w-0 max-w-full items-center gap-3 pointer-events-auto bg-card border border-border shadow-sm rounded-lg px-3 py-2 sm:max-w-[420px]">
            <button
              type="button"
              onClick={handleReturnToNotebooks}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="返回筆記本列表"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="size-6 shrink-0 bg-primary rounded flex items-center justify-center">
              <Sparkles className="size-3.5 text-primary-foreground" />
            </div>
            <span className="shrink-0 font-semibold text-sm tracking-tight pr-2 border-r border-border">YouthLM</span>
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground px-1">
              <span
                className="truncate font-medium text-foreground"
                title={activeNotebook?.name ?? '未命名筆記本'}
              >
                {activeNotebook?.name ?? '未命名筆記本'}
              </span>
            </div>
          </div>

          {/* An empty notebook has nothing to scan, so the radar appears after the first canvas card. */}
          {hasPolicyRadarContent && (
            <div
              className="pointer-events-auto max-w-full shrink-0"
              onPointerDown={event => event.stopPropagation()}
            >
              <PolicyRadarPanel
                counts={policyRadarCounts}
                state={activePolicyRadarState}
                isStale={isPolicyRadarStale}
                onToggle={handleTogglePolicyRadar}
                onRun={handleRunPolicyRadar}
              />
            </div>
          )}
        </div>

        <div className="pointer-events-auto flex shrink-0 gap-2">
          <TextSizeControl value={textSize} onChange={setTextSize} />
          <button
            type="button"
            onClick={() => setIsWorkspaceTourOpen(true)}
            className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
            aria-label="開啟操作教學"
          >
            <CircleHelp className="size-4" />
            <span className="hidden sm:inline">操作教學</span>
          </button>
          <button
            type="button"
            disabled
            title="分享功能尚未開放"
            className="flex h-9 cursor-not-allowed items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-muted-foreground opacity-70 shadow-sm"
          >
            <Share className="size-4" />
            分享
          </button>
        </div>
      </header>

      {/* Main Interactive Canvas Layer */}
      <main
        ref={canvasRef}
        className="absolute inset-0 z-10 overflow-hidden"
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
      >

        {/* Infinite Grid Background (Scales & Pans with Canvas) */}
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
            backgroundImage: 'radial-gradient(circle, var(--color-border) 1px, transparent 1px)',
            opacity: 0.6
          }}
        />

        {/* Panning Interaction Receiver */}
        <div
          className="absolute inset-0 z-0 touch-none"
          style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
          onPointerDown={handleCanvasPointerDown}
        />

        {/* Transformed Canvas Content Container */}
        <div
          className={`absolute inset-0 pointer-events-none z-10 ${canvasNodes.length === 0 ? 'hidden' : ''}`}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0'
          }}
        >
          {/* Dynamic SVG Connections */}
          <svg className="absolute inset-0 size-full overflow-visible pointer-events-none z-0">
            {artifactConnections.map(connection => {
              return (
                <path
                  key={connection.id}
                  data-connection-id={connection.id}
                  data-connection-kind={connection.kind}
                  d={buildConnectionPath(connection.start, connection.end)}
                  fill="none"
                  stroke={CONNECTION_COLORS[connection.kind]}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.8"
                />
              );
            })}
            {connectionDraft && (
              <path
                data-connection-preview="true"
                d={buildConnectionPath(connectionDraft.start, connectionDraft.current)}
                fill="none"
                stroke={CONNECTION_COLORS[connectionDraft.kind]}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="7 5"
                opacity="0.8"
              />
            )}
          </svg>

          {nodes.filter(node => node.type === 'source').map(node => (
            <SourceCard
              key={node.id}
              node={node}
              selected={node.id === selectedNodeId}
              connected={resultNodes.some(resultNode => usesRawSourceInputs(resultNode.result) && resultNode.result?.sourceNodeIds.includes(node.id))}
              onEdit={handleSelectNode}
              onDelete={handleDeleteSource}
              onCreateChart={isSourceReady(node) ? handleCreateChartFromSource : undefined}
              onPointerDown={handleNodePointerDown}
              onOutputPointerDown={handleConnectionPointerDown}
              outputConnecting={connectionDraft?.fromNodeId === node.id}
            />
          ))}

          {resultNodes.map(node => {
            const acceptsDraft = connectionDraft
              ? connectionKindBetween(nodes, connectionDraft.fromNodeId, node.id) !== null
              : false;
            const inputConnectionState = connectionDraft
              ? acceptsDraft
                ? connectionDraft.hoveredTargetNodeId === node.id ? 'hovered' as const : 'available' as const
                : 'invalid' as const
              : undefined;
            return (
              <ResultCard
                key={node.id}
                node={node}
                selected={node.id === selectedNodeId}
                sourcesReady={Boolean(
                  node.result?.kind === 'chart'
                    ? node.result.sourceNodeIds.length
                      && node.result.sourceNodeIds.every(sourceNodeId => {
                        const sourceNode = sourceNodes.find(source => source.id === sourceNodeId);
                        return sourceNode ? isSourceReady(sourceNode) : false;
                      })
                    : (node.result?.kind === 'presentation' || node.result?.kind === 'report')
                      && node.result.sourceModuleIds?.length
                      && node.result.sourceModuleIds.every(sourceModuleId => (
                        isAnalysisReady(analysisByNode[sourceModuleId])
                      ))
                )}
                execution={analysisByNode[node.id]}
                presentationExecution={presentationByNode[node.id]}
                reportExecution={reportByNode[node.id]}
                onRun={node.result?.kind === 'presentation'
                  ? handleRunPresentation
                  : node.result?.kind === 'report'
                    ? handleRunReport
                    : handleRunAnalysis}
                onCreatePresentation={node.result?.kind === 'chart' && isAnalysisReady(analysisByNode[node.id])
                  ? handleCreatePresentationFromAnalysis
                  : undefined}
                onEdit={handleSelectNode}
                onDelete={handleDeleteResult}
                onPointerDown={handleNodePointerDown}
                onOutputPointerDown={outputConnectionKind(node) ? handleConnectionPointerDown : undefined}
                inputConnectionState={inputConnectionState}
                inputConnectionKind={connectionDraft?.kind}
                outputConnecting={connectionDraft?.fromNodeId === node.id}
              />
            );
          })}

        </div>

        {canvasNodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6">
            <div className="pointer-events-auto max-w-md rounded-2xl border border-border/80 bg-card/95 px-8 py-8 text-center shadow-sm">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Database className="size-6" />
              </div>
              <h2 className="mt-4 text-lg font-semibold">從一份可信資料開始</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                加入官方資料，開始建立來源 → 圖表 → 簡報流程。
              </p>
              <button
                type="button"
                onClick={() => handleAddCardFromClick('source')}
                className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 text-sm font-medium text-white transition hover:bg-blue-800"
              >
                <Database className="size-4" />
                選擇官方資料
              </button>
            </div>
          </div>
        )}

        {/* Zoom & Fit Controls */}
        <div className="absolute bottom-6 -translate-x-1/2 flex items-center gap-1 bg-card border border-border rounded-full shadow-sm p-1.5 z-40"
          style={{ left: `calc(50% + ${((isLeftOpen ? 312 : 82) - (isRightOpen ? selectedResult ? 696 : selectedSource ? 436 : 416 : 82)) / 2}px)` }}>
          <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-muted-foreground/80">
            Ctrl + 滾輪縮放
          </span>
          <button
            onClick={handleZoomOut}
            className="size-7 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors"
            aria-label="縮小白板"
          >
            <span className="text-lg font-medium leading-none mb-0.5">-</span>
          </button>
          <div className="flex w-12 justify-center text-center">
            <output
              className="text-xs font-medium text-muted-foreground"
              aria-label={`目前縮放比例 ${Math.round(zoom * 100)}%`}
              aria-live="off"
            >
              {Math.round(zoom * 100)}%
            </output>
          </div>
          <button
            onClick={handleZoomIn}
            className="size-7 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors"
            aria-label="放大白板"
          >
            <span className="text-lg font-medium leading-none mb-0.5">+</span>
          </button>
          <div className="w-px h-4 bg-border/50 mx-1" />
          <button
            onClick={handleFitView}
            className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors"
          >
            全覽
          </button>
        </div>
      </main>

      {/* Floating Left Panel (Collapsible) */}
      <div
        className={`absolute top-20 bottom-6 left-4 z-40 flex bg-card border border-border shadow-sm rounded-xl transition-all duration-300 ease-in-out ${
          isLeftOpen ? 'w-[280px]' : 'w-14'
        }`}
      >
        {/* Rail (Always visible) */}
        <div className="w-14 flex-none border-r border-border/50 flex flex-col items-center py-4 gap-4">
          <button
            onClick={() => setIsLeftOpen(!isLeftOpen)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            title={isLeftOpen ? "收合卡片工具" : "開啟卡片工具"}
          >
            {isLeftOpen ? <PanelLeftClose className="size-5" /> : <PanelLeftOpen className="size-5" />}
          </button>

          <div className="w-8 h-px bg-border/50" />

          <button
            type="button"
            draggable
            onDragStart={(event) => handleCardDragStart(event, 'source')}
            onClick={() => handleAddCardFromClick('source')}
            className="p-2 text-blue-700 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors relative group cursor-grab active:cursor-grabbing"
            aria-label="新增來源卡片"
          >
            <Database className="size-5" />
            {!isLeftOpen && (
              <span className="absolute left-12 bg-foreground text-background text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                點擊新增，或拖入白板
              </span>
            )}
          </button>
          <button
            type="button"
            draggable
            onDragStart={(event) => handleCardDragStart(event, 'result')}
            onClick={() => handleAddCardFromClick('result')}
            className="p-2 text-violet-700 hover:text-violet-800 hover:bg-violet-50 rounded-lg transition-colors relative group cursor-grab active:cursor-grabbing"
            aria-label="新增成果卡片"
          >
            <FileText className="size-5" />
            {!isLeftOpen && (
              <span className="absolute left-12 bg-foreground text-background text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                點擊新增，或拖入白板
              </span>
            )}
          </button>
        </div>

        {/* Expanded Content */}
        <div className={`flex-1 overflow-hidden transition-opacity duration-300 ${isLeftOpen ? 'opacity-100' : 'opacity-0'}`}>
          <div className="w-[224px] h-full flex flex-col">
            <div className="p-4 border-b border-border/50 flex items-center justify-between">
              <div>
                <h2 className="font-medium text-sm">新增卡片</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">點擊，或拖放到白板指定位置</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <button
                type="button"
                draggable
                onDragStart={(event) => handleCardDragStart(event, 'source')}
                onClick={() => handleAddCardFromClick('source')}
                className="w-full rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50 cursor-grab active:cursor-grabbing"
              >
                <span className="flex items-start gap-3">
                  <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-blue-600 text-white">
                    <Database className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-blue-950">來源</span>
                    <span className="mt-1 block text-[11px] leading-4 text-blue-800/80">選擇官方資料集或設定自訂來源</span>
                  </span>
                </span>
              </button>

              <button
                type="button"
                draggable
                onDragStart={(event) => handleCardDragStart(event, 'result')}
                onClick={() => handleAddCardFromClick('result')}
                className="w-full rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-left transition-colors hover:border-violet-300 hover:bg-violet-50 cursor-grab active:cursor-grabbing"
              >
                <span className="flex items-start gap-3">
                  <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-violet-600 text-white">
                    <FileText className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-violet-950">成果</span>
                    <span className="mt-1 block text-[11px] leading-4 text-violet-800/80">連結來源產生圖表，或從分析成果產生簡報</span>
                  </span>
                </span>
              </button>

              <p className="px-1 pt-2 text-[11px] leading-5 text-muted-foreground">
                已安裝資料集可執行真實分析；AI 小幫手已移到右側聊天室，產生的草稿會直接加入白板。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Right Panel - Selected Card Settings */}
      <div
        className={`absolute top-20 bottom-6 right-4 z-[60] flex bg-card border border-border shadow-sm rounded-xl transition-all duration-300 ease-in-out ${
          isRightOpen ? (selectedResult ? 'w-[min(680px,calc(100vw-32px))]' : selectedSource ? 'w-[min(420px,calc(100vw-32px))]' : 'w-[min(400px,calc(100vw-32px))]') : 'w-14'
        }`}
      >
        {/* Expanded Content */}
        <div
          ref={inspectorContentRef}
          aria-hidden={!isRightOpen}
          className={`flex-1 overflow-hidden transition-opacity duration-300 ${isRightOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          {selectedSource ? (
            <div className="h-full w-full min-w-0">
              <SourceInspector
                node={selectedSource}
                onSave={handleSaveSource}
                onDirtyChange={dirty => setDirtyInspectorNodeId(dirty ? selectedSource.id : null)}
                onClose={closeInspector}
              />
            </div>
          ) : selectedResult ? (
            <div className="h-full w-full min-w-0">
              <ResultInspector
                node={selectedResult}
                sourceNodes={sourceNodes}
                analysisNodes={resultNodes.filter(node => (
                  node.id !== selectedResult.id && node.result?.kind === 'chart'
                ))}
                analysisExecutions={analysisByNode}
                execution={analysisByNode[selectedResult.id]}
                presentationExecution={presentationByNode[selectedResult.id]}
                reportExecution={reportByNode[selectedResult.id]}
                onSave={handleSaveResult}
                onCancel={() => handleCancelExecution(selectedResult.id)}
                onCreatePresentation={isAnalysisReady(analysisByNode[selectedResult.id])
                  ? () => handleCreatePresentationFromAnalysis(selectedResult.id) : undefined}
                onRun={selectedResult.result?.kind === 'chart'
                  && selectedResult.result.sourceNodeIds.length > 0
                  && selectedResult.result.sourceNodeIds.every(sourceNodeId => {
                    const sourceNode = sourceNodes.find(source => source.id === sourceNodeId);
                    return sourceNode ? isSourceReady(sourceNode) : false;
                  })
                  ? () => handleRunAnalysis(selectedResult.id)
                  : (selectedResult.result?.kind === 'presentation'
                      || selectedResult.result?.kind === 'report')
                    && selectedResult.result.sourceModuleIds?.length
                    && selectedResult.result.sourceModuleIds.every(sourceModuleId => (
                      isAnalysisReady(analysisByNode[sourceModuleId])
                    ))
                    ? selectedResult.result.kind === 'presentation'
                      ? () => handleRunPresentation(selectedResult.id)
                      : () => handleRunReport(selectedResult.id)
                    : undefined}
                onDirtyChange={dirty => setDirtyInspectorNodeId(dirty ? selectedResult.id : null)}
                onClose={closeInspector}
              />
            </div>
          ) : assistantNode?.assistant ? (
            <AssistantSidebar
              config={assistantNode.assistant}
              sourceCount={sourceNodes.length}
              resultCount={resultNodes.length}
              contextOptions={assistantContextOptions}
              execution={assistantByNode[assistantNode.id]}
              hasUnavailableContext={assistantHasUnavailableContext}
              onSubmit={prompt => handleAssistantSubmit(assistantNode.id, prompt)}
              onToggleContext={contextNodeId => handleAssistantToggleContext(assistantNode.id, contextNodeId)}
              onRetry={() => handleAssistantRetry(assistantNode.id)}
              onExecuteDraft={canExecuteAssistantDraft ? () => handleAssistantExecuteDraft(assistantNode.id) : undefined}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-5 text-center text-xs text-muted-foreground">
              正在準備筆記本小幫手…
            </div>
          )}
        </div>

        {/* Rail (Always visible on right edge) */}
        <div className="w-14 flex-none border-l border-border/50 flex flex-col items-center py-4 gap-4 bg-card rounded-r-xl">
          <button
            onClick={() => setIsRightOpen(!isRightOpen)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            title={isRightOpen ? "收合右側面板" : "開啟 AI 小幫手"}
            aria-label={isRightOpen ? "收合右側面板" : "開啟 AI 小幫手"}
          >
            {isRightOpen ? <PanelRightClose className="size-5" /> : <PanelRightOpen className="size-5" />}
          </button>

          <div className="w-8 h-px bg-border/50" />

          <button
            type="button"
            className={`group relative rounded-lg p-2 transition-colors ${!selectedSource && !selectedResult && isRightOpen ? 'bg-emerald-50 text-emerald-700' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            onClick={handleOpenAssistantChat}
            aria-label="開啟 AI 小幫手聊天室"
            title="AI 小幫手聊天室"
          >
            <MessageSquare className="size-5" />
            {!isRightOpen && (
              <span className="absolute right-12 bg-foreground text-background text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                AI 小幫手
              </span>
            )}
          </button>
        </div>
      </div>

      {isWorkspaceTourOpen && (
        <WorkspaceTour
          onDismiss={dismissWorkspaceTour}
          onStartWithSource={handleStartTourWithSource}
        />
      )}

    </div>
  );
}
