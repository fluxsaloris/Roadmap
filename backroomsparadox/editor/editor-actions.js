(function () {
  "use strict";

  const MAX_HISTORY = 100;

  function deepClone(v) {
    return typeof structuredClone === "function"
      ? structuredClone(v)
      : JSON.parse(JSON.stringify(v));
  }

  function fastHash(g) {
    return `${g.nodes.length}|${g.edges.length}|${g.nodes[0]?.id}`;
  }

  function buildSnapshot(label = "Edit") {
    return {
      id: crypto.randomUUID?.() || String(Date.now()),
      label,
      timestamp: Date.now(),
      data: deepClone(window.graphData),
      selectedNodeId: window.selectedNodeId,
      selectedEdgeKey: window.selectedEdgeKey
    };
  }

  function pushUndo(label) {
    const s = buildSnapshot(label);

    const stack = window.editorRuntime.undoStack;
    const last = stack[stack.length - 1];

    if (last && fastHash(last.data) === fastHash(s.data)) return;

    stack.push(s);
    if (stack.length > MAX_HISTORY) stack.shift();
    window.editorRuntime.redoStack.length = 0;
  }

  function restore(snapshot) {
    const n = window.normalizeData(deepClone(snapshot.data));

    window.graphData.nodes = n.nodes;
    window.graphData.edges = n.edges;

    window.selectedNodeId = snapshot.selectedNodeId;
    window.selectedEdgeKey = snapshot.selectedEdgeKey;

    window.refreshAllUI?.();
  }

  function undo() {
    const stack = window.editorRuntime.undoStack;
    if (!stack.length) return;

    window.editorRuntime.redoStack.push(buildSnapshot("redo"));
    restore(stack.pop());
  }

  function redo() {
    const stack = window.editorRuntime.redoStack;
    if (!stack.length) return;

    window.editorRuntime.undoStack.push(buildSnapshot("undo"));
    restore(stack.pop());
  }

  function edgeExists(from, to, label) {
    return window.graphData.edges.some(
      e => e.from === from && e.to === to && (e.label || "") === (label || "")
    );
  }

  function addEdge(from, to, label = "", oneWay = true) {
    if (!from || !to || from === to) return false;
    if (edgeExists(from, to, label)) return false;

    window.graphData.edges.push({
      from,
      to,
      label,
      oneWay,
      waypoints: []
    });

    return true;
  }

  function addNode() {
    const rect = window.graphViewportRect?.();
    const center = window.scenePointFromClient?.(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );

    const node = {
      id: `node-${Date.now()}`,
      label: "New Node",
      x: center?.x || 0,
      y: center?.y || 0,
      type: "stable",
      status: "draft",
      tags: []
    };

    pushUndo("add node");

    window.graphData.nodes.push(node);
    window.selectedNodeId = node.id;

    window.refreshAllUI?.();
  }

  function markDirty() {
    window.editorRuntime.hasUnsavedChanges = true;
    window.refreshChangeSummary?.();
  }

  window.pushUndoState = pushUndo;
  window.undoAction = undo;
  window.redoAction = redo;
  window.addEdge = addEdge;
  window.addNode = addNode;
  window.markDirty = markDirty;
})();
