import React, { useState, useEffect, useRef } from 'react';
import { 
  Share, Database, FileText, Plus, Settings2, Sparkles, 
  MessageSquare, GripHorizontal, ChevronLeft, 
  PanelLeftClose, PanelLeftOpen,
  PanelRightClose, PanelRightOpen, ArrowRight, SlidersHorizontal,
  AlertTriangle, CheckCircle2
} from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { NotebookHome } from './components/NotebookHome';
import { SourceCard } from './components/SourceCard';
import { SourceInspector } from './components/SourceInspector';
import { ResultCard } from './components/ResultCard';
import { ResultInspector } from './components/ResultInspector';
import { AssistantCard } from './components/AssistantCard';
import { PolicyRadarPanel } from './components/PolicyRadarPanel';
import type {
  AuthUser,
  CanvasNode,
  Notebook,
  PolicyRadarCounts,
  PolicyRadarState,
  PolicyRadarStateByNotebook,
  ResultConfig,
  SourceConfig,
} from './types';

type AppScreen = 'auth' | 'notebooks' | 'workspace';

const CARD_DRAG_TYPE = 'application/x-youthlm-card';
const SOURCE_CARD_SIZE = { width: 320, height: 216 };
const RESULT_CARD_SIZE = { width: 320, height: 260 };
const ASSISTANT_CARD_SIZE = { width: 340, height: 430 };
type AddableCardType = 'source' | 'result' | 'assistant';
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
  if (node.source.kind === 'file') return Boolean(node.source.file?.name);
  if (node.source.kind === 'api') return Boolean(node.source.apiUrl?.trim());
  return false;
}

function getPolicyRadarWorkspaceSignature(workspace: CanvasNode[]) {
  const trackedNodes = workspace
    .filter(node => node.type === 'source' || node.type === 'result')
    .sort((first, second) => first.id.localeCompare(second.id))
    .map(node => {
      if (node.type === 'source') {
        return {
          id: node.id,
          type: node.type,
          kind: node.source?.kind ?? null,
          name: node.source?.name ?? '',
          enabled: node.source?.enabled ?? false,
          autoClean: node.source?.autoClean ?? false,
          apiUrl: node.source?.apiUrl ?? '',
          file: node.source?.file ? { ...node.source.file } : null,
        };
      }

      return {
        id: node.id,
        type: node.type,
        kind: node.result?.kind ?? null,
        name: node.result?.name ?? '',
        sourceIds: [...(node.result?.sourceIds ?? [])].sort(),
        prompt: node.result?.prompt ?? '',
      };
    });

  return JSON.stringify(trackedNodes);
}

function createPolicyRadarState(): PolicyRadarState {
  return { collapsed: false, running: false };
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

function getFitTransform(
  targetNodes: CanvasNode[],
  viewportWidth: number,
  viewportHeight: number,
  leftInset: number,
  rightInset: number,
) {
  if (targetNodes.length === 0) return null;

  const minX = Math.min(...targetNodes.map(node => node.x));
  const minY = Math.min(...targetNodes.map(node => node.y));
  const maxX = Math.max(...targetNodes.map(node => node.x + NODE_SIZES[node.type].width));
  const maxY = Math.max(...targetNodes.map(node => node.y + NODE_SIZES[node.type].height));
  const boxWidth = Math.max(1, maxX - minX);
  const boxHeight = Math.max(1, maxY - minY);
  const topInset = 80;
  const bottomInset = 80;
  const availableWidth = viewportWidth - leftInset - rightInset;
  const availableHeight = viewportHeight - topInset - bottomInset;
  const padding = 64;
  const nextZoom = Math.max(0.3, Math.min(
    1.5,
    Math.min(
      (availableWidth - padding * 2) / boxWidth,
      (availableHeight - padding * 2) / boxHeight,
    ),
  ));
  const centerX = minX + boxWidth / 2;
  const centerY = minY + boxHeight / 2;

  return {
    zoom: nextZoom,
    pan: {
      x: leftInset + availableWidth / 2 - centerX * nextZoom,
      y: topInset + availableHeight / 2 - centerY * nextZoom,
    },
  };
}

function cloneWorkspaceNode(node: CanvasNode): CanvasNode {
  return {
    ...node,
    source: node.source
      ? { ...node.source, file: node.source.file ? { ...node.source.file } : undefined }
      : undefined,
    result: node.result
      ? { ...node.result, sourceIds: [...node.result.sourceIds] }
      : undefined,
    assistant: node.assistant
      ? {
        ...node.assistant,
        messages: node.assistant.messages.map(message => ({ ...message })),
        draftActions: node.assistant.draftActions.map(action => ({
          ...action,
          sourceIds: [...action.sourceIds],
        })),
      }
      : undefined,
  };
}

function duplicateWorkspaceNodes(nodes: CanvasNode[]): CanvasNode[] {
  const duplicateKey = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const idMap = new Map(
    nodes.map((node, index) => [node.id, `${node.type}-${duplicateKey}-${index + 1}`]),
  );

  return nodes.map(node => {
    const clone = cloneWorkspaceNode(node);
    const duplicateNodeId = idMap.get(node.id) ?? node.id;
    return {
      ...clone,
      id: duplicateNodeId,
      result: clone.result
        ? {
          ...clone.result,
          sourceIds: clone.result.sourceIds
            .map(sourceId => idMap.get(sourceId))
            .filter((sourceId): sourceId is string => Boolean(sourceId)),
        }
        : undefined,
      assistant: clone.assistant
        ? {
          ...clone.assistant,
          messages: clone.assistant.messages.map((message, index) => ({
            ...message,
            id: `${duplicateNodeId}-message-${index + 1}`,
          })),
          draftActions: clone.assistant.draftActions.map((action, index) => ({
            ...action,
            id: `${duplicateNodeId}-draft-${index + 1}`,
            sourceIds: action.sourceIds
              .map(sourceId => idMap.get(sourceId))
              .filter((sourceId): sourceId is string => Boolean(sourceId)),
          })),
        }
        : undefined,
    };
  });
}

const DEMO_NODES: CanvasNode[] = [
  { id: 'transform', type: 'transform', x: 100, y: 160 },
  { id: 'analysis', type: 'analysis', x: 530, y: 160 },
  {
    id: 'assistant',
    type: 'assistant',
    x: 960,
    y: 150,
    assistant: {
      name: '政策資料小幫手',
      messages: [],
      draftActions: [],
    },
  },
];

const INITIAL_WORKSPACES: Record<string, CanvasNode[]> = {
  'youth-education-employment': DEMO_NODES.map(node => ({ ...node })),
};

const INITIAL_POLICY_RADAR_STATES: PolicyRadarStateByNotebook = {
  'youth-education-employment': createPolicyRadarState(),
};

const INITIAL_NOTEBOOKS: Notebook[] = [
  {
    id: 'youth-education-employment',
    name: '青年教育與就業研究',
    description: '整理青年教育程度、職業訓練與就業資料，準備政策會議分析。',
    updatedAt: '剛剛',
    cardCount: 3,
  },
];

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

  // Canvas State
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLElement | null>(null);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const policyRadarRunTimersRef = useRef(new Map<string, number>());

  // Nodes State
  const [nodes, setNodes] = useState<CanvasNode[]>(DEMO_NODES);
  const [fitAfterAssistantRequest, setFitAfterAssistantRequest] = useState(0);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [nodeDragOffset, setNodeDragOffset] = useState({ x: 0, y: 0, nodeStartX: 0, nodeStartY: 0 });

  const clearAllPolicyRadarRunTimers = () => {
    policyRadarRunTimersRef.current.forEach(timerId => window.clearTimeout(timerId));
    policyRadarRunTimersRef.current.clear();
  };

  useEffect(() => () => clearAllPolicyRadarRunTimers(), []);

  // Pointer Handlers
  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (isRightOpen) {
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
      if (notebook.id !== activeNotebookId || notebook.cardCount === nodes.length) return notebook;
      return { ...notebook, cardCount: nodes.length, updatedAt: '剛剛' };
    }));
  }, [activeNotebookId, nodes, screen]);

  useEffect(() => {
    if (screen !== 'workspace' || fitAfterAssistantRequest === 0) return;
    const activeSelectedNode = nodes.find(node => node.id === selectedNodeId);
    const leftInset = isLeftOpen ? 312 : 82;
    const hasInspector = activeSelectedNode?.type === 'source' || activeSelectedNode?.type === 'result';
    const rightInset = isRightOpen ? (hasInspector ? 436 : 336) : 82;
    const transform = getFitTransform(
      nodes,
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
  }, [fitAfterAssistantRequest]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

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

  const activeNotebook = notebooks.find(notebook => notebook.id === activeNotebookId) ?? null;

  const handleAuthenticated = (user: AuthUser) => {
    clearAllPolicyRadarRunTimers();
    setCurrentUser(user);
    setNotebooks(INITIAL_NOTEBOOKS.map(notebook => ({ ...notebook })));
    setWorkspaceNodes({
      'youth-education-employment': DEMO_NODES.map(node => ({ ...node })),
    });
    setPolicyRadarByNotebook({
      'youth-education-employment': createPolicyRadarState(),
    });
    setActiveNotebookId(null);
    setSelectedNodeId(null);
    setDirtyInspectorNodeId(null);
    setScreen('notebooks');
  };

  const handleLogout = () => {
    clearAllPolicyRadarRunTimers();
    setCurrentUser(null);
    setPolicyRadarByNotebook({});
    setActiveNotebookId(null);
    setSelectedNodeId(null);
    setDirtyInspectorNodeId(null);
    setScreen('auth');
  };

  const handleCreateNotebook = (name: string, description: string) =>
    new Promise<Notebook>(resolve => {
      window.setTimeout(() => {
        const notebook: Notebook = {
          id: `notebook-${Date.now()}`,
          name,
          description,
          updatedAt: '剛剛',
          cardCount: 0,
        };
        setNotebooks(current => [notebook, ...current]);
        setWorkspaceNodes(current => ({ ...current, [notebook.id]: [] }));
        setPolicyRadarByNotebook(current => ({
          ...current,
          [notebook.id]: createPolicyRadarState(),
        }));
        resolve(notebook);
      }, 650);
    });

  const handleOpenNotebook = (notebook: Notebook) => {
    setPolicyRadarByNotebook(current => (
      current[notebook.id]
        ? current
        : { ...current, [notebook.id]: createPolicyRadarState() }
    ));
    setActiveNotebookId(notebook.id);
    setNodes((workspaceNodes[notebook.id] ?? []).map(cloneWorkspaceNode));
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setIsLeftOpen(false);
    setIsRightOpen(false);
    setSelectedNodeId(null);
    setDirtyInspectorNodeId(null);
    setScreen('workspace');
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
      id: `notebook-${Date.now()}`,
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

  if (screen === 'auth') {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  if (screen === 'notebooks') {
    return (
      <NotebookHome
        displayName={currentUser?.displayName ?? '使用者'}
        notebooks={notebooks}
        onCreate={handleCreateNotebook}
        onOpen={handleOpenNotebook}
        onRename={handleRenameNotebook}
        onDuplicate={handleDuplicateNotebook}
        onDelete={handleDeleteNotebook}
        onLogout={handleLogout}
      />
    );
  }

  const selectedNode = nodes.find(node => node.id === selectedNodeId) ?? null;
  const selectedSource = selectedNode?.type === 'source' ? selectedNode : null;
  const selectedResult = selectedNode?.type === 'result' ? selectedNode : null;
  const selectedAssistant = selectedNode?.type === 'assistant' ? selectedNode : null;
  const sourceNodes = nodes.filter(node => node.type === 'source');
  const resultNodes = nodes.filter(node => node.type === 'result');
  const assistantNodes = nodes.filter(node => node.type === 'assistant');
  const currentSourceIds = new Set(sourceNodes.map(node => node.id));
  const policyRadarCounts: PolicyRadarCounts = {
    sourceCount: sourceNodes.length,
    readySourceCount: sourceNodes.filter(isSourceReady).length,
    resultCount: resultNodes.length,
    configuredResultCount: resultNodes.filter(node => Boolean(
      node.result?.kind
      && node.result.sourceIds.length > 0
      && node.result.sourceIds.every(sourceId => currentSourceIds.has(sourceId)),
    )).length,
  };
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
    setIsRightOpen(false);
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
  ) => {
    const candidateSize = NODE_SIZES[type];
    const rightInset = type === 'assistant' ? 82 : 436;
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
        if (existingNodes.some(node => cardWouldOverlap(candidateX, candidateY, type, node))) continue;

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

  const addSourceNode = (x: number, y: number) => {
    if (!confirmDiscardInspectorChanges()) return;

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
  };

  const addResultNode = (x: number, y: number) => {
    if (!confirmDiscardInspectorChanges()) return;

    const resultNumber = resultNodes.length + 1;
    const existingNames = new Set(resultNodes.map(node => node.result?.name.trim()).filter(Boolean));
    let resultName = '未命名成果';
    let resultNameNumber = 2;
    while (existingNames.has(resultName)) {
      resultName = `未命名成果 ${resultNameNumber}`;
      resultNameNumber += 1;
    }
    const position = findOpenCardPosition(x, y, 'result');
    const resultNode: CanvasNode = {
      id: `result-${Date.now()}-${resultNumber}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'result',
      x: position.x,
      y: position.y,
      result: {
        kind: null,
        name: resultName,
        sourceIds: [],
        prompt: '',
      },
    };

    setNodes(current => [...current, resultNode]);
    setDirtyInspectorNodeId(null);
    setSelectedNodeId(resultNode.id);
    setIsRightOpen(true);
  };

  const addAssistantNode = (x: number, y: number) => {
    if (!confirmDiscardInspectorChanges()) return;

    const existingNames = new Set(assistantNodes.map(node => node.assistant?.name.trim()).filter(Boolean));
    let assistantName = '政策資料小幫手';
    let assistantNameNumber = 2;
    while (existingNames.has(assistantName)) {
      assistantName = `政策資料小幫手 ${assistantNameNumber}`;
      assistantNameNumber += 1;
    }
    const position = findOpenCardPosition(x, y, 'assistant');
    const assistantNode: CanvasNode = {
      id: `assistant-${Date.now()}-${assistantNodes.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'assistant',
      x: position.x,
      y: position.y,
      assistant: {
        name: assistantName,
        messages: [],
        draftActions: [],
      },
    };

    setNodes(current => [...current, assistantNode]);
    setDirtyInspectorNodeId(null);
    setSelectedNodeId(assistantNode.id);
    setIsRightOpen(false);
  };

  const handleAddCardFromClick = (type: AddableCardType) => {
    const leftEdge = isLeftOpen ? 312 : 82;
    const rightEdge = type === 'assistant' ? 82 : 436;
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
      : type === 'result'
        ? visibleBounds.right - RESULT_CARD_SIZE.width - columnMargin
        : (visibleBounds.left + visibleBounds.right - ASSISTANT_CARD_SIZE.width) / 2
          + assistantNodes.length * 36;
    const y = type === 'source'
      ? visibleBounds.top + 140 + sourceNodes.length * (SOURCE_CARD_SIZE.height + 40)
      : type === 'result'
        ? (visibleBounds.top + visibleBounds.bottom - RESULT_CARD_SIZE.height) / 2
          + resultNodes.length * 40
        : (visibleBounds.top + visibleBounds.bottom - ASSISTANT_CARD_SIZE.height) / 2
          + assistantNodes.length * 36;

    if (type === 'source') addSourceNode(x, y);
    else if (type === 'result') addResultNode(x, y);
    else addAssistantNode(x, y);
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
    if (cardType !== 'source' && cardType !== 'result' && cardType !== 'assistant') return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const cardSize = NODE_SIZES[cardType];
    const x = (event.clientX - bounds.left - pan.x) / zoom - cardSize.width / 2;
    const y = (event.clientY - bounds.top - pan.y) / zoom - cardSize.height / 2;
    if (cardType === 'source') addSourceNode(x, y);
    else if (cardType === 'result') addResultNode(x, y);
    else addAssistantNode(x, y);
  };

  const handleSaveSource = (source: SourceConfig) => {
    if (!selectedSource) return;
    setNodes(current => current.map(node =>
      node.id === selectedSource.id ? { ...node, source: { ...source } } : node,
    ));
    setDirtyInspectorNodeId(null);
    setNotebooks(current => current.map(notebook =>
      notebook.id === activeNotebookId ? { ...notebook, updatedAt: '剛剛' } : notebook,
    ));
  };

  const handleSaveResult = (result: ResultConfig) => {
    if (!selectedResult) return;
    setNodes(current => current.map(node =>
      node.id === selectedResult.id
        ? { ...node, result: { ...result, sourceIds: [...result.sourceIds] } }
        : node,
    ));
    setDirtyInspectorNodeId(null);
    setNotebooks(current => current.map(notebook =>
      notebook.id === activeNotebookId ? { ...notebook, updatedAt: '剛剛' } : notebook,
    ));
  };

  const handleAssistantSubmit = (id: string, prompt: string) => {
    const submittedAt = Date.now();
    setNodes(current => {
      const sourceIds = current
        .filter(node => node.type === 'source')
        .map(node => node.id);
      const response = sourceIds.length > 0
        ? `需求已記錄，並依目前 ${sourceIds.length} 張來源準備 2 項前端操作草稿：洞察圖表與政策簡報。這不是 AI 分析，也尚未產生任何統計、圖表或簡報內容。`
        : '需求已記錄。這是前端操作示意：目前沒有來源卡片，所以尚不能建立成果草稿。請先新增來源，再重新送出需求；AI 與資料分析尚未串接。';

      return current.map(node => {
        if (node.id !== id || node.type !== 'assistant' || !node.assistant) return node;
        return {
          ...node,
          assistant: {
            ...node.assistant,
            lastPrompt: prompt,
            messages: [
              ...node.assistant.messages,
              {
                id: `${id}-user-${submittedAt}`,
                role: 'user',
                content: prompt,
                createdAt: new Date(submittedAt).toISOString(),
              },
              {
                id: `${id}-notice-${submittedAt}`,
                role: 'assistant',
                content: response,
                createdAt: new Date(submittedAt).toISOString(),
              },
            ],
            draftActions: [
              {
                id: `${id}-draft-chart-${submittedAt}`,
                kind: 'chart',
                name: '政策洞察圖表',
                sourceIds: [...sourceIds],
                prompt,
              },
              {
                id: `${id}-draft-presentation-${submittedAt}`,
                kind: 'presentation',
                name: '政策洞察簡報',
                sourceIds: [...sourceIds],
                prompt,
              },
            ],
          },
        };
      });
    });
    setNotebooks(current => current.map(notebook =>
      notebook.id === activeNotebookId ? { ...notebook, updatedAt: '剛剛' } : notebook,
    ));
  };

  const handleAssistantExecuteDraft = (id: string) => {
    const executedAt = Date.now();
    setNodes(current => {
      const assistantNode = current.find(node => node.id === id && node.type === 'assistant');
      if (!assistantNode?.assistant || assistantNode.assistant.draftActions.length === 0) return current;

      const currentSourceIds = new Set(
        current.filter(node => node.type === 'source').map(node => node.id),
      );
      const existingResultNames = new Set(
        current.flatMap(node => (
          node.type === 'result' && node.result?.name.trim() ? [node.result.name.trim()] : []
        )),
      );
      let workingNodes = [...current];
      let createdCount = 0;
      const linkedSourceIds = new Set<string>();

      assistantNode.assistant.draftActions.forEach((action, index) => {
        const validSourceIds = action.sourceIds.filter(sourceId => currentSourceIds.has(sourceId));
        if (validSourceIds.length === 0) return;
        validSourceIds.forEach(sourceId => linkedSourceIds.add(sourceId));

        const position = findOpenCardPosition(
          assistantNode.x + ASSISTANT_CARD_SIZE.width + 96,
          assistantNode.y + index * (RESULT_CARD_SIZE.height + 36),
          'result',
          workingNodes,
        );
        const resultNode: CanvasNode = {
          id: `result-assistant-${executedAt}-${index + 1}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'result',
          x: position.x,
          y: position.y,
          result: {
            kind: action.kind,
            name: getUniqueName(action.name, existingResultNames),
            sourceIds: validSourceIds,
            prompt: action.prompt,
          },
        };
        workingNodes = [...workingNodes, resultNode];
        createdCount += 1;
      });

      const notice = createdCount > 0
        ? `已建立 ${createdCount} 張成果草稿，並連結 ${linkedSourceIds.size} 張來源。這些卡片只有前端設定；尚未產生圖表、簡報內容或分析結論。`
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
    setFitAfterAssistantRequest(current => current + 1);
  };

  const handleDeleteSource = (id: string) => {
    let shouldDiscardOtherInspector = false;
    if (selectedNodeId !== id && dirtyInspectorNodeId) {
      if (!confirmDiscardInspectorChanges()) return;
      shouldDiscardOtherInspector = true;
    }
    const sourceName = nodes.find(node => node.id === id)?.source?.name || '這張來源';
    if (!window.confirm(`確定要刪除「${sourceName}」嗎？已連結成果會移除此來源。`)) return;

    if (shouldDiscardOtherInspector) {
      setSelectedNodeId(null);
      setDirtyInspectorNodeId(null);
    }

    setNodes(current => current
      .filter(node => node.id !== id)
      .map(node => {
        if (node.type === 'result' && node.result) {
          return {
            ...node,
            result: {
              ...node.result,
              sourceIds: node.result.sourceIds.filter(sourceId => sourceId !== id),
            },
          };
        }
        if (node.type === 'assistant' && node.assistant) {
          return {
            ...node,
            assistant: {
              ...node.assistant,
              draftActions: node.assistant.draftActions.map(action => ({
                ...action,
                sourceIds: action.sourceIds.filter(sourceId => sourceId !== id),
              })),
            },
          };
        }
        return node;
      }));
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

    setNodes(current => current.filter(node => node.id !== id));
    if (selectedNodeId === id) {
      setSelectedNodeId(null);
      setDirtyInspectorNodeId(null);
    }
  };

  const handleDeleteAssistant = (id: string) => {
    let shouldDiscardOtherInspector = false;
    if (selectedNodeId !== id && dirtyInspectorNodeId) {
      if (!confirmDiscardInspectorChanges()) return;
      shouldDiscardOtherInspector = true;
    }
    const assistantName = nodes.find(node => node.id === id)?.assistant?.name || '這張小幫手';
    if (!window.confirm(`確定要刪除「${assistantName}」嗎？已送出的對話與操作草稿會一併移除。`)) return;

    if (shouldDiscardOtherInspector) {
      setSelectedNodeId(null);
      setDirtyInspectorNodeId(null);
    }

    setNodes(current => current.filter(node => node.id !== id));
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
    const rightInset = isRightOpen ? (selectedSource || selectedResult ? 436 : 336) : 82;
    const transform = getFitTransform(
      nodes,
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
  const transform = nodes.find(n => n.type === 'transform');
  const analysis = nodes.find(n => n.type === 'analysis');

  const transformOutput = transform ? { x: transform.x + 365, y: transform.y + 220 } : null;
  const analysisInput = analysis ? { x: analysis.x, y: analysis.y + 85 } : null;
  const resultConnections = resultNodes.flatMap(resultNode =>
    (resultNode.result?.sourceIds ?? []).flatMap(sourceId => {
      const sourceNode = sourceNodes.find(node => node.id === sourceId);
      if (!sourceNode) return [];
      return [{
        id: `${sourceNode.id}-${resultNode.id}`,
        start: {
          x: sourceNode.x + SOURCE_CARD_SIZE.width,
          y: sourceNode.y + SOURCE_CARD_SIZE.height / 2,
        },
        end: {
          x: resultNode.x,
          y: resultNode.y + RESULT_CARD_SIZE.height / 2,
        },
      }];
    }),
  );

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden font-sans relative">
      
      {/* Floating Header */}
      <header className="absolute top-4 left-4 right-4 z-40 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto bg-card border border-border shadow-sm rounded-lg px-3 py-2">
          <button
            type="button"
            onClick={handleReturnToNotebooks}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="返回筆記本列表"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="size-6 bg-primary rounded flex items-center justify-center">
            <Sparkles className="size-3.5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-sm tracking-tight pr-2 border-r border-border">YouthLM</span>
          <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
            <span className="font-medium text-foreground">{activeNotebook?.name ?? '未命名筆記本'}</span>
          </div>
        </div>
        
        <div className="pointer-events-auto flex gap-2">
          <button className="h-9 px-3 text-sm font-medium bg-card border border-border text-foreground shadow-sm rounded-lg hover:bg-muted transition-colors flex items-center gap-2">
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
          className={`absolute inset-0 pointer-events-none z-10 ${nodes.length === 0 ? 'hidden' : ''}`}
          style={{ 
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, 
            transformOrigin: '0 0' 
          }}
        >
          {/* Dynamic SVG Connections */}
          <svg className="absolute top-0 left-0 pointer-events-none z-0" style={{ overflow: 'visible' }}>
            {resultConnections.map(connection => {
              const controlDistance = Math.min(
                140,
                Math.max(60, Math.abs(connection.end.x - connection.start.x) * 0.35),
              );
              const path = connection.end.x >= connection.start.x
                ? `M ${connection.start.x} ${connection.start.y} C ${connection.start.x + controlDistance} ${connection.start.y}, ${connection.end.x - controlDistance} ${connection.end.y}, ${connection.end.x} ${connection.end.y}`
                : `M ${connection.start.x} ${connection.start.y} C ${connection.start.x + 60} ${connection.start.y}, ${connection.end.x - 60} ${connection.end.y}, ${connection.end.x} ${connection.end.y}`;
              return (
                <g key={connection.id}>
                  <path
                    d={path}
                    fill="none"
                    stroke="#7c3aed"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.75"
                  />
                  <circle cx={connection.start.x} cy={connection.start.y} r="4" fill="#2563eb" />
                  <circle cx={connection.end.x} cy={connection.end.y} r="4" fill="#7c3aed" />
                </g>
              );
            })}
            {transformOutput && analysisInput && (
              <>
                <path 
                  d={`M ${transformOutput.x} ${transformOutput.y} C ${transformOutput.x + 70} ${transformOutput.y}, ${analysisInput.x - 70} ${analysisInput.y}, ${analysisInput.x} ${analysisInput.y}`}
                  fill="none" 
                  stroke="var(--color-ring)" 
                  strokeWidth="2" 
                  strokeDasharray="4 4" 
                  opacity="0.5"
                />
                <circle cx={transformOutput.x} cy={transformOutput.y} r="4" fill="var(--color-ring)" opacity="0.8" />
                <circle cx={analysisInput.x} cy={analysisInput.y} r="4" fill="var(--color-ring)" opacity="0.8" />
              </>
            )}
          </svg>

          {nodes.filter(node => node.type === 'source').map(node => (
            <SourceCard
              key={node.id}
              node={node}
              selected={node.id === selectedNodeId}
              connected={resultNodes.some(resultNode => resultNode.result?.sourceIds.includes(node.id))}
              onSelect={handleSelectNode}
              onEdit={handleSelectNode}
              onDelete={handleDeleteSource}
              onPointerDown={handleNodePointerDown}
            />
          ))}

          {resultNodes.map(node => (
            <ResultCard
              key={node.id}
              node={node}
              selected={node.id === selectedNodeId}
              sourcesReady={Boolean(
                node.result?.sourceIds.length
                && node.result.sourceIds.every(sourceId => {
                  const sourceNode = sourceNodes.find(source => source.id === sourceId);
                  return sourceNode ? isSourceReady(sourceNode) : false;
                })
              )}
              onSelect={handleSelectNode}
              onEdit={handleSelectNode}
              onDelete={handleDeleteResult}
              onPointerDown={handleNodePointerDown}
            />
          ))}

          {assistantNodes.map(node => {
            const sourceIdSet = new Set(sourceNodes.map(source => source.id));
            const canExecuteDraft = Boolean(
              node.assistant?.draftActions.length
              && node.assistant.draftActions.every(action =>
                action.sourceIds.some(sourceId => sourceIdSet.has(sourceId)),
              ),
            );

            return (
              <AssistantCard
                key={node.id}
                node={node}
                selected={node.id === selectedNodeId}
                onSelect={handleSelectNode}
                onDelete={handleDeleteAssistant}
                onPointerDown={handleNodePointerDown}
                onSubmit={handleAssistantSubmit}
                onExecuteDraft={canExecuteDraft ? handleAssistantExecuteDraft : undefined}
              />
            );
          })}

          {/* Age Definition Transform Node */}
          <div
            className={`${transform ? '' : 'hidden'} absolute pointer-events-auto w-[360px] bg-card rounded-xl border border-border shadow-sm flex flex-col hover:shadow-md transition-shadow`}
            style={{ left: 0, top: 0, transform: `translate(${transform?.x ?? 0}px, ${transform?.y ?? 0}px)` }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
              className="h-10 border-b border-border px-3 flex items-center justify-between bg-muted/30 rounded-t-xl group cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => transform && handleNodePointerDown(e, transform.id)}
            >
              <div className="flex items-center gap-2 pointer-events-none">
                <GripHorizontal className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                <SlidersHorizontal className="size-3.5 text-blue-600" />
                <span className="text-xs font-semibold tracking-wider text-muted-foreground">年齡口徑轉換</span>
              </div>
              <div className="flex items-center gap-2 pointer-events-none">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  <CheckCircle2 className="size-3" />
                  已完成
                </span>
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">示範資料</span>
              </div>
            </div>

            <div className="p-4 space-y-3.5">
              <div>
                <h3 className="text-sm font-semibold leading-snug">青年年齡口徑統一</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  將不同資料源的年齡分組轉換為《青年基本法》18–35 歲範圍。
                </p>
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">原始口徑</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {['15–24', '25–34', '35–44'].map(range => (
                      <span key={range} className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono text-foreground">
                        {range}
                      </span>
                    ))}
                  </div>
                </div>
                <ArrowRight className="size-4 text-muted-foreground" />
                <div className="rounded-md bg-primary px-2.5 py-2 text-center text-primary-foreground">
                  <p className="text-[10px] opacity-70">目標口徑</p>
                  <p className="mt-0.5 text-sm font-semibold">18–35 歲</p>
                </div>
              </div>

              <div className="rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium">轉換規則</span>
                  <button
                    type="button"
                    className="text-[10px] font-medium text-blue-700 hover:text-blue-900"
                    aria-label="編輯年齡口徑轉換規則"
                  >
                    編輯規則
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  單歲資料精確篩選；彙總區間依行政區人口權重估算。
                </p>
              </div>

              <div className="grid grid-cols-3 divide-x divide-border rounded-lg bg-muted/35 py-2.5 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">輸入</p>
                  <p className="mt-0.5 text-xs font-semibold tabular-nums">86,420</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">保留</p>
                  <p className="mt-0.5 text-xs font-semibold tabular-nums">51,308</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">排除</p>
                  <p className="mt-0.5 text-xs font-semibold tabular-nums">35,112</p>
                </div>
              </div>

              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-amber-900">
                <AlertTriangle className="mt-0.5 size-3.5 flex-none text-amber-600" />
                <p className="text-[11px] leading-relaxed">
                  1 個資料源僅提供彙總年齡層；相關結果將標示為估算，不視為精確值。
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Database className="size-3" />
                  3 個資料來源
                </span>
                <span>2 精確 · 1 估算</span>
              </div>
            </div>

            <div className="absolute right-[-5px] top-[215px] size-2.5 rounded-full border-2 border-primary bg-background ring-4 ring-background"></div>
          </div>

          {/* Analysis Node - Large */}
          <div 
            className={`${analysis ? '' : 'hidden'} absolute pointer-events-auto w-[360px] bg-card rounded-xl border border-border shadow-sm flex flex-col hover:shadow-md transition-shadow`}
            style={{ left: 0, top: 0, transform: `translate(${analysis?.x ?? 0}px, ${analysis?.y ?? 0}px)` }}
            onPointerDown={(e) => e.stopPropagation()} // Prevent canvas drag when clicking inside node
          >
            {/* Input Port */}
            <div className="absolute left-[-5px] top-[80px] size-2.5 rounded-full border-2 border-primary bg-background ring-4 ring-background"></div>
            <div 
              className="h-10 border-b border-border px-3 flex items-center justify-between bg-muted/30 rounded-t-xl group cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => analysis && handleNodePointerDown(e, analysis.id)}
            >
              <div className="flex items-center gap-2 pointer-events-none">
                <GripHorizontal className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                <span className="text-xs font-semibold tracking-wider text-muted-foreground">分析結果</span>
              </div>
              <button className="text-muted-foreground hover:text-foreground pointer-events-auto">
                <Settings2 className="size-3.5" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Question */}
              <div>
                <h3 className="text-sm font-medium leading-snug">
                  職業訓練參與情形與第三季青年就業率有什麼關聯？
                </h3>
              </div>

              {/* Chart Placeholder */}
              <div className="h-32 bg-muted/20 border border-border/50 rounded-lg flex items-end justify-between p-3 relative">
                <div className="absolute top-2 left-2 text-[10px] text-muted-foreground">青年就業率與職訓參與率</div>
                <div className="w-1/6 bg-primary/20 hover:bg-primary/30 transition-colors h-[30%] rounded-t-sm"></div>
                <div className="w-1/6 bg-primary/30 hover:bg-primary/40 transition-colors h-[45%] rounded-t-sm"></div>
                <div className="w-1/6 bg-primary/50 hover:bg-primary/60 transition-colors h-[60%] rounded-t-sm"></div>
                <div className="w-1/6 bg-primary/70 hover:bg-primary/80 transition-colors h-[85%] rounded-t-sm"></div>
                <div className="w-1/6 bg-primary hover:bg-primary/90 transition-colors h-[95%] rounded-t-sm"></div>
              </div>

              {/* Insight */}
              <div className="bg-emerald-50/50 border border-emerald-100/50 p-3 rounded-lg flex gap-3 items-start">
                <Sparkles className="size-4 text-emerald-600 mt-0.5 flex-none" />
                <p className="text-xs leading-relaxed text-emerald-900">
                  示範分析顯示兩者呈正向關聯。主要行政區中，完成認證職訓課程的青年，第三季就業比例高出 <span className="font-semibold">14.2%</span>。
                </p>
              </div>

              {/* Evidence Tag */}
              <div className="flex items-center gap-2 border-t border-border pt-3">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/50 border border-border/50 rounded text-[10px] font-mono text-muted-foreground">
                  <Database className="size-3" />
                  2023_青年就業.csv
                </div>
              </div>
            </div>
            {/* Output Port */}
            <div className="absolute right-[-5px] top-[220px] size-2.5 rounded-full border-2 border-primary bg-background ring-4 ring-background"></div>
          </div>

        </div>

        {nodes.length === 0 && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none px-6">
            <div className="max-w-md rounded-2xl border border-dashed border-border bg-card/95 px-8 py-10 text-center shadow-sm">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Plus className="size-6" />
              </div>
              <h2 className="mt-4 text-lg font-semibold">這本筆記本目前是空的</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                從左側新增「來源」、「成果」或「小幫手」，開始組合你的分析流程。
              </p>
            </div>
          </div>
        )}
        
        {/* Zoom & Fit Controls */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-card border border-border rounded-full shadow-sm p-1.5 z-40">
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

      {/* Fixed Policy Radar - kept outside the transformed canvas */}
      <div
        className="absolute bottom-20 z-30 transition-[right] duration-300"
        style={{
          right: isRightOpen
            ? (selectedSource || selectedResult ? 452 : 352)
            : 86,
        }}
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
          <button
            type="button"
            draggable
            onDragStart={(event) => handleCardDragStart(event, 'assistant')}
            onClick={() => handleAddCardFromClick('assistant')}
            className="p-2 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors relative group cursor-grab active:cursor-grabbing"
            aria-label="新增小幫手卡片"
          >
            <MessageSquare className="size-5" />
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
                    <span className="mt-1 block text-[11px] leading-4 text-blue-800/80">上傳檔案或設定公開 API</span>
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
                    <span className="mt-1 block text-[11px] leading-4 text-violet-800/80">連結來源，設定圖表或簡報</span>
                  </span>
                </span>
              </button>

              <button
                type="button"
                draggable
                onDragStart={(event) => handleCardDragStart(event, 'assistant')}
                onClick={() => handleAddCardFromClick('assistant')}
                className="w-full rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50 cursor-grab active:cursor-grabbing"
              >
                <span className="flex items-start gap-3">
                  <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-emerald-600 text-white">
                    <MessageSquare className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-emerald-950">小幫手</span>
                    <span className="mt-1 block text-[11px] leading-4 text-emerald-800/80">輸入需求，規劃成果卡片草稿</span>
                  </span>
                </span>
              </button>

              <p className="px-1 pt-2 text-[11px] leading-5 text-muted-foreground">
                目前可保存來源、成果與小幫手操作草稿；資料解析、AI 生成及檔案輸出仍等待後端串接。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Right Panel - Selected Card Settings */}
      <div 
        className={`absolute top-20 bottom-6 right-4 z-40 flex bg-card border border-border shadow-sm rounded-xl transition-all duration-300 ease-in-out ${
          isRightOpen ? (selectedSource || selectedResult ? 'w-[420px]' : 'w-[320px]') : 'w-14'
        }`}
      >
        {/* Expanded Content */}
        <div className={`flex-1 overflow-hidden transition-opacity duration-300 ${isRightOpen ? 'opacity-100' : 'opacity-0'}`}>
          {selectedSource ? (
            <div className="h-full w-[364px]">
              <SourceInspector
                node={selectedSource}
                onSave={handleSaveSource}
                onDirtyChange={dirty => setDirtyInspectorNodeId(dirty ? selectedSource.id : null)}
                onClose={closeInspector}
              />
            </div>
          ) : selectedResult ? (
            <div className="h-full w-[364px]">
              <ResultInspector
                node={selectedResult}
                sourceNodes={sourceNodes}
                onSave={handleSaveResult}
                onDirtyChange={dirty => setDirtyInspectorNodeId(dirty ? selectedResult.id : null)}
                onClose={closeInspector}
              />
            </div>
          ) : selectedAssistant ? (
            <div className="w-[264px] h-full flex flex-col">
              <div className="p-4 border-b border-border/50">
                <h2 className="font-medium text-sm flex items-center gap-2">
                  <MessageSquare className="size-4 text-emerald-700" />
                  小幫手
                </h2>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-5 text-center">
                  <MessageSquare className="mx-auto size-5 text-emerald-700" />
                  <p className="mt-3 text-xs font-medium">直接在卡片內輸入需求</p>
                  <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
                    已送出的文字與操作草稿會保留在目前筆記本；真正 AI 與資料分析仍等待後端串接。
                  </p>
                </div>
                <div className="mt-auto rounded-lg bg-muted/30 p-3 text-[11px] leading-5 text-muted-foreground">
                  尚未送出的輸入文字只存在卡片內，切換筆記本時不會保存。
                </div>
              </div>
            </div>
          ) : (
            <div className="w-[264px] h-full flex flex-col">
              <div className="p-4 border-b border-border/50">
                <h2 className="font-medium text-sm flex items-center gap-2">
                  <Settings2 className="size-4 text-primary" />
                  卡片設定
                </h2>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
                  <Settings2 className="mx-auto size-5 text-muted-foreground" />
                  <p className="mt-3 text-xs font-medium">尚未選取卡片</p>
                  <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
                    新增或選取白板上的來源與成果，即可在這裡完成設定。
                  </p>
                </div>
                <div className="mt-auto rounded-lg bg-muted/30 p-3 text-[11px] leading-5 text-muted-foreground">
                  小幫手的對話與操作草稿直接在卡片內完成。
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rail (Always visible on right edge) */}
        <div className="w-14 flex-none border-l border-border/50 flex flex-col items-center py-4 gap-4 bg-card rounded-r-xl">
          <button 
            onClick={() => setIsRightOpen(!isRightOpen)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            title={isRightOpen ? "收合卡片設定" : "開啟卡片設定"}
          >
            {isRightOpen ? <PanelRightClose className="size-5" /> : <PanelRightOpen className="size-5" />}
          </button>
          
          <div className="w-8 h-px bg-border/50" />
          
          <button
            type="button"
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors relative group"
            onClick={() => setIsRightOpen(true)}
          >
            {selectedSource
              ? <Database className="size-5 text-blue-700" />
              : selectedResult
                ? <FileText className="size-5 text-violet-700" />
                : selectedAssistant
                  ? <MessageSquare className="size-5 text-emerald-700" />
                  : <Settings2 className="size-5" />}
            {!isRightOpen && (
              <span className="absolute right-12 bg-foreground text-background text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                {selectedSource
                  ? '來源設定'
                  : selectedResult
                    ? '成果設定'
                    : selectedAssistant
                      ? '小幫手說明'
                      : '卡片設定'}
              </span>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}
