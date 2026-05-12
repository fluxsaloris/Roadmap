(function () {
  "use strict";

  const DEFAULT_AUTOSAVE_DELAY = 500;
  const DEFAULT_DIFF_DELAY = 200;
  const DEFAULT_SAVE_COOLDOWN = 1500;
  const MAX_HISTORY = window.MAX_HISTORY || 100;

  const safeNow = () => Date.now();

  const deepClone = (value) => {
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch {}
    }

    return JSON.parse(JSON.stringify(value));
  };

  const debounce = (fn, delay) => {
    let timer = null;

    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  };

  const safeStorage = {
    get(key, fallback = null) {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch (err) {
        console.error(err);
        return fallback;
      }
    },

    set(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (err) {
        console.error(err);
        return false;
      }
    },

    remove(key) {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (err) {
        console.error(err);
        return false;
      }
    }
  };

  const app = {
    hasUnsavedChanges: false,
    isSavingToGitHub: false,
    lastLocalSaveAt: null,
    lastRemoteSaveAt: null,
    lastVersionId: null,
    lastSnapshotPath: null,
    historyIndexCache: null,
    latestDiffContext: null,
    autosaveTimer: null,
    diffTimer: null,
    saveCooldownUntil: 0,
    currentSearch: "",
    snapshotCache: new Map(),
    undoStack: [],
    redoStack: []
  };

  Object.entries(app).forEach(([key, value]) => {
    if (typeof window[key] === "undefined") {
      window[key] = value;
    }
  });

  function updateUIState(status, message, isError = false) {
    if (window.setSaveBadge && status) {
      window.setSaveBadge(status, message);
    }

    if (window.setStatus && window.innerWidth > 700) {
      window.setStatus(message, isError);
    }

    if (window.updateStatsBar) {
      window.updateStatsBar();
    }
  }

  function buildSnapshot(label = "Edit") {
    return {
      id: crypto.randomUUID?.() || `${safeNow()}-${Math.random()}`,
      label,
      timestamp: safeNow(),
      data: deepClone(window.graphData),
      selectedNodeId: window.selectedNodeId || null,
      selectedEdgeKey: window.selectedEdgeKey || null
    };
  }

  function pushUndoState(label = "Edit") {
    const snapshot = buildSnapshot(label);

    const lastSnapshot = window.undoStack[window.undoStack.length - 1];

    if (
      lastSnapshot &&
      JSON.stringify(lastSnapshot.data) === JSON.stringify(snapshot.data)
    ) {
      return;
    }

    window.undoStack.push(snapshot);

    if (window.undoStack.length > MAX_HISTORY) {
      window.undoStack.shift();
    }

    window.redoStack.length = 0;

    if (window.updateStatsBar) {
      window.updateStatsBar();
    }
  }

  function restoreState(snapshot, reason = "State restored.") {
    if (!snapshot?.data) return;

    window.graphData = window.normalizeData(deepClone(snapshot.data));
    window.selectedNodeId = snapshot.selectedNodeId || null;
    window.selectedEdgeKey = snapshot.selectedEdgeKey || null;

    if (window.refreshAllUI) {
      window.refreshAllUI();
    }

    updateUIState(null, reason);
  }

  function undoAction() {
    if (!window.undoStack.length) return;

    const currentState = buildSnapshot("Redo");
    window.redoStack.push(currentState);

    const snapshot = window.undoStack.pop();
    restoreState(snapshot, "Undo applied.");

    markDirtyNoHistory("Undo applied.");
  }

  function redoAction() {
    if (!window.redoStack.length) return;

    const currentState = buildSnapshot("Undo");
    window.undoStack.push(currentState);

    const snapshot = window.redoStack.pop();
    restoreState(snapshot, "Redo applied.");

    markDirtyNoHistory("Redo applied.");
  }

  function getDraftPayload() {
    return {
      savedAt: safeNow(),
      data: window.getSerializableGraphData(),
      selectedNodeId: window.selectedNodeId || null,
      selectedEdgeKey: window.selectedEdgeKey || null,
      viewportState: window.viewportState || null
    };
  }

  function saveDraftToLocal() {
    const payload = getDraftPayload();

    const success = safeStorage.set(
      window.LOCAL_DRAFT_KEY,
      JSON.stringify(payload)
    );

    if (success) {
      window.lastLocalSaveAt = payload.savedAt;

      if (window.updateStatsBar) {
        window.updateStatsBar();
      }
    }
  }

  function loadDraftFromLocal() {
    const raw = safeStorage.get(window.LOCAL_DRAFT_KEY);

    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);

      if (!parsed?.data) {
        return null;
      }

      return parsed;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  function clearLocalDraft() {
    safeStorage.remove(window.LOCAL_DRAFT_KEY);
  }

  function restoreMetaFromLocalStorage() {
    const savedRemote = safeStorage.get(window.LAST_REMOTE_SAVE_KEY);
    const savedSnapshot = safeStorage.get(window.LAST_SNAPSHOT_META_KEY);

    if (savedRemote) {
      const parsed = Number(savedRemote);

      if (!Number.isNaN(parsed) && parsed > 0) {
        window.lastRemoteSaveAt = parsed;
      }
    }

    if (savedSnapshot) {
      try {
        const parsed = JSON.parse(savedSnapshot);

        window.lastVersionId = parsed?.version || null;
        window.lastSnapshotPath = parsed?.snapshotPath || null;
      } catch (err) {
        console.error(err);
      }
    }

    if (window.updateMetaBadges) {
      window.updateMetaBadges();
    }
  }

  function persistMetaToLocalStorage() {
    if (window.lastRemoteSaveAt) {
      safeStorage.set(
        window.LAST_REMOTE_SAVE_KEY,
        String(window.lastRemoteSaveAt)
      );
    }

    safeStorage.set(
      window.LAST_SNAPSHOT_META_KEY,
      JSON.stringify({
        version: window.lastVersionId,
        snapshotPath: window.lastSnapshotPath
      })
    );
  }

  const scheduleAutosave = debounce(() => {
    saveDraftToLocal();
  }, DEFAULT_AUTOSAVE_DELAY);

  const scheduleDiffRefresh = debounce(() => {
    if (window.refreshChangeSummary) {
      window.refreshChangeSummary();
    }
  }, DEFAULT_DIFF_DELAY);

  function markDirty(reason = "Unsaved changes") {
    window.hasUnsavedChanges = true;

    updateUIState("save-dirty", "Unsaved changes");

    scheduleAutosave();
    scheduleDiffRefresh();

    if (reason && window.setStatus) {
      window.setStatus(reason);
    }
  }

  function markDirtyNoHistory(reason = "Unsaved changes") {
    window.hasUnsavedChanges = true;

    updateUIState("save-dirty", "Unsaved changes");

    scheduleAutosave();
    scheduleDiffRefresh();

    if (reason && window.setStatus) {
      window.setStatus(reason);
    }
  }

  function markClean(message = "All changes saved") {
    window.hasUnsavedChanges = false;

    updateUIState("save-clean", message);

    scheduleDiffRefresh();
  }

  function edgeExists(from, to, label = "") {
    return (window.graphData.edges || []).some(
      (edge) =>
        edge.from === from &&
        edge.to === to &&
        (edge.label || "") === (label || "")
    );
  }

  function addEdge(from, to, label = "", oneWay = true) {
    if (!from || !to || from === to) return false;

    if (edgeExists(from, to, label)) return false;

    const edge = {
      from,
      to,
      label: String(label || "").trim(),
      oneWay: Boolean(oneWay),
      waypoints: []
    };

    window.graphData.edges.push(edge);

    if (!oneWay && !edgeExists(to, from, label)) {
      window.graphData.edges.push({
        from: to,
        to: from,
        label: edge.label,
        oneWay: false,
        waypoints: []
      });
    }

    return true;
  }

  function generateNodeId() {
    const usedIds = new Set(
      (window.graphData.nodes || []).map((node) =>
        String(node.id || "")
      )
    );

    return window.makeUniqueId("level", usedIds);
  }

  function addNode() {
    pushUndoState("Add node");

    const nextId = generateNodeId();

    const rect = window.graphViewportRect();
    const center = window.scenePointFromClient(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );

    const node = {
      id: nextId,
      label: "New Level",
      subtitle: "",
      description: "",
      notes: "",
      x: Math.round(center.x),
      y: Math.round(center.y),
      type: "stable",
      status: "draft",
      tags: [],
      createdAt: safeNow(),
      updatedAt: safeNow()
    };

    window.graphData.nodes.push(node);

    window.selectedNodeId = nextId;
    window.selectedEdgeKey = null;

    if (window.refreshAllUI) {
      window.refreshAllUI();
    }

    markDirty("Added new node.");
  }

  function getInputValue(id, fallback = "") {
    return document.getElementById(id)?.value ?? fallback;
  }

  function getActiveNodeFormValues() {
    return {
      label: getInputValue("nodeLabel"),
      subtitle: getInputValue("nodeSubtitle"),
      type: getInputValue("nodeType", "stable"),
      status: getInputValue("nodeStatus", "draft"),
      x: getInputValue("nodeX", 0),
      y: getInputValue("nodeY", 0),
      tags: getInputValue("nodeTags"),
      description: getInputValue("nodeDescription"),
      notes: getInputValue("nodeNotes")
    };
  }

  function getActiveLinkFormValues() {
    return {
      targetId: getInputValue("linkTarget"),
      label: getInputValue("linkLabel"),
      oneWay: getInputValue("linkOneWay", "yes") === "yes"
    };
  }

  function applySelectedNodeChanges() {
    const node = window.getSelectedNode();

    if (!node) return;

    pushUndoState("Update node");

    const values = getActiveNodeFormValues();

    Object.assign(node, {
      label: values.label.trim() || "Unnamed",
      subtitle: values.subtitle.trim(),
      type: window.normalizeType(values.type),
      status: values.status,
      x: Number(values.x || 0),
      y: Number(values.y || 0),
      tags: values.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      description: values.description,
      notes: values.notes,
      updatedAt: safeNow()
    });

    if (window.refreshAllUI) {
      window.refreshAllUI();
    }

    markDirty("Node updated.");
  }

  function deleteSelectedNode() {
    const node = window.getSelectedNode();

    if (!node) return;

    if (!confirm(`Delete "${node.label}"?`)) {
      return;
    }

    pushUndoState("Delete node");

    window.graphData.nodes = window.graphData.nodes.filter(
      (n) => n.id !== node.id
    );

    window.graphData.edges = window.graphData.edges.filter(
      (edge) =>
        edge.from !== node.id &&
        edge.to !== node.id
    );

    window.selectedNodeId = null;
    window.selectedEdgeKey = null;

    if (window.refreshAllUI) {
      window.refreshAllUI();
    }

    markDirty("Deleted node.");
  }

  function addConnectionFromSidebar() {
    const node = window.getSelectedNode();

    if (!node) return;

    const values = getActiveLinkFormValues();

    if (!values.targetId) return;

    pushUndoState("Add link");

    const added = addEdge(
      node.id,
      values.targetId,
      values.label,
      values.oneWay
    );

    if (!added) return;

    if (window.refreshAllUI) {
      window.refreshAllUI();
    }

    markDirty("Added link.");
  }

  function deleteEdge(from, to, label = "") {
    pushUndoState("Delete link");

    const before = window.graphData.edges.length;

    window.graphData.edges = window.graphData.edges.filter(
      (edge) =>
        !(
          edge.from === from &&
          edge.to === to &&
          (edge.label || "") === (label || "")
        )
    );

    if (before === window.graphData.edges.length) {
      return;
    }

    if (window.selectedEdgeKey) {
      const exists = window.graphData.edges.some(
        (edge) =>
          window.edgeKeyOf(edge) === window.selectedEdgeKey
      );

      if (!exists) {
        window.selectedEdgeKey = null;
      }
    }

    if (window.refreshAllUI) {
      window.refreshAllUI();
    }

    markDirty("Deleted link.");
  }

  function selectEdgeByKey(key) {
    const edge = window.getEdgeByKey(key);

    window.selectedEdgeKey = edge ? key : null;

    if (window.refreshAllUI) {
      window.refreshAllUI();
    }
  }

  function addWaypointToSelectedEdge() {
    const edge = window.getEdgeByKey(window.selectedEdgeKey);

    if (!edge) return;

    pushUndoState("Add bend point");

    const points = window.buildEdgePoints(edge);
    const midpoint = window.getEdgeMidpoint(points);

    edge.waypoints = window.normalizeWaypoints(edge.waypoints);

    edge.waypoints.push({
      x: Math.round(midpoint.x),
      y: Math.round(midpoint.y)
    });

    if (window.refreshAllUI) {
      window.refreshAllUI();
    }

    markDirty("Added bend point.");
  }

  function removeWaypointFromSelectedEdge(index) {
    const edge = window.getEdgeByKey(window.selectedEdgeKey);

    if (!edge) return;

    if (!Array.isArray(edge.waypoints)) return;

    if (!edge.waypoints[index]) return;

    pushUndoState("Remove bend point");

    edge.waypoints.splice(index, 1);

    if (window.refreshAllUI) {
      window.refreshAllUI();
    }

    markDirty("Removed bend point.");
  }

  function clearWaypointsFromSelectedEdge() {
    const edge = window.getEdgeByKey(window.selectedEdgeKey);

    if (!edge) return;

    pushUndoState("Clear bend points");

    edge.waypoints = [];

    if (window.refreshAllUI) {
      window.refreshAllUI();
    }

    markDirty("Cleared bend points.");
  }

  async function fetchJSON(url, options = {}) {
    const response = await fetch(url, {
      cache: "no-store",
      ...options
    });

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(json?.error || "Request failed");
    }

    return json;
  }

  async function fetchRemoteGraph() {
    const data = await fetchJSON(
      `${window.RAW_JSON_URL}?v=${safeNow()}`
    );

    return window.normalizeData(data);
  }

  async function reloadGraph(force = false) {
    try {
      if (window.hasUnsavedChanges && !force) {
        updateUIState(null, "Reload blocked due to unsaved changes.");
        return;
      }

      if (window.showLoading) {
        window.showLoading("Loading graph...");
      }

      updateUIState("save-loading", "Loading latest graph...");

      const graph = await fetchRemoteGraph();

      window.graphData = graph;
      window.selectedNodeId = graph.nodes?.[0]?.id || null;
      window.selectedEdgeKey = null;

      if (window.refreshAllUI) {
        window.refreshAllUI();
      }

      if (window.fitToGraph) {
        window.fitToGraph();
      }

      if (window.hideLoading) {
        window.hideLoading();
      }

      if (window.hideErrorPanel) {
        window.hideErrorPanel();
      }

      markClean("Loaded latest graph.");
    } catch (err) {
      console.error(err);

      if (window.hideLoading) {
        window.hideLoading();
      }

      updateUIState("save-error", "Failed to load graph.", true);

      if (window.showErrorPanel) {
        window.showErrorPanel(err.message || "Failed to load graph.");
      }
    }
  }

  async function saveGraph() {
    try {
      if (window.isSavingToGitHub) return;

      if (safeNow() < window.saveCooldownUntil) return;

      window.saveCooldownUntil = safeNow() + DEFAULT_SAVE_COOLDOWN;
      window.isSavingToGitHub = true;

      updateUIState("save-saving", "Saving graph...");

      const payload = {
        project: window.PROJECT,
        data: window.getSerializableGraphData()
      };

      const json = await fetchJSON(window.SAVE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      window.hasUnsavedChanges = false;
      window.lastRemoteSaveAt = json?.savedAt
        ? Date.parse(json.savedAt) || safeNow()
        : safeNow();

      window.lastVersionId = json?.version || null;
      window.lastSnapshotPath = json?.snapshotPath || null;

      persistMetaToLocalStorage();

      if (window.updateMetaBadges) {
        window.updateMetaBadges();
      }

      saveDraftToLocal();

      window.historyIndexCache = null;
      window.snapshotCache.clear();

      markClean("Saved to GitHub.");
    } catch (err) {
      console.error(err);

      updateUIState("save-error", "GitHub save failed.", true);

      if (window.showErrorPanel) {
        window.showErrorPanel(err.message || "Save failed.");
      }
    } finally {
      window.isSavingToGitHub = false;
    }
  }

  function discardLocalDraft() {
    const confirmed = confirm(
      "Discard your local draft and reload from GitHub?"
    );

    if (!confirmed) return;

    clearLocalDraft();

    window.hasUnsavedChanges = false;

    reloadGraph(true);
  }

  async function fetchHistoryIndex() {
    if (window.historyIndexCache) {
      return window.historyIndexCache;
    }

    const json = await fetchJSON(
      `${window.SAVE_URL}?project=${encodeURIComponent(
        window.PROJECT
      )}&action=history`
    );

    window.historyIndexCache = json;

    return json;
  }

  async function fetchSnapshotByPath(path) {
    if (!path) {
      throw new Error("Missing snapshot path.");
    }

    if (window.snapshotCache.has(path)) {
      return window.snapshotCache.get(path);
    }

    const json = await fetchJSON(
      `${window.SAVE_URL}?project=${encodeURIComponent(
        window.PROJECT
      )}&action=snapshot&path=${encodeURIComponent(path)}`
    );

    const normalized = window.normalizeData(json?.data || json);

    window.snapshotCache.set(path, normalized);

    return normalized;
  }

  async function previewLatestSnapshot() {
    try {
      const history = await fetchHistoryIndex();

      const versions = Array.isArray(history?.versions)
        ? history.versions
        : [];

      if (!versions.length) {
        updateUIState(null, "No snapshot history available.");
        return;
      }

      const snapshot = await fetchSnapshotByPath(versions[0].path);

      window.graphData = snapshot;
      window.selectedNodeId = snapshot.nodes?.[0]?.id || null;
      window.selectedEdgeKey = null;

      if (window.refreshAllUI) {
        window.refreshAllUI();
      }

      if (window.fitToGraph) {
        window.fitToGraph();
      }

      updateUIState(null, "Previewing latest snapshot.");
    } catch (err) {
      console.error(err);

      if (window.showErrorPanel) {
        window.showErrorPanel(
          err.message || "Snapshot preview failed."
        );
      }
    }
  }

  function clearSelection() {
    window.selectedNodeId = null;
    window.selectedEdgeKey = null;

    if (window.refreshAllUI) {
      window.refreshAllUI();
    }

    updateUIState(null, "Selection cleared.");
  }

  function setupSearch() {
    const input = document.getElementById("searchInput");

    if (!input) return;

    input.addEventListener(
      "input",
      debounce((event) => {
        window.currentSearch = String(
          event.target.value || ""
        )
          .trim()
          .toLowerCase();

        if (window.refreshGraph) {
          window.refreshGraph();
        }
      }, 100)
    );
  }

  window.addEventListener("beforeunload", (event) => {
    if (!window.hasUnsavedChanges) return;

    event.preventDefault();
    event.returnValue = "";
  });

  Object.assign(window, {
    pushUndoState,
    restoreState,
    undoAction,
    redoAction,
    saveDraftToLocal,
    loadDraftFromLocal,
    clearLocalDraft,
    restoreMetaFromLocalStorage,
    persistMetaToLocalStorage,
    scheduleAutosave,
    scheduleDiffRefresh,
    markDirty,
    markDirtyNoHistory,
    markClean,
    edgeExists,
    addEdge,
    generateNodeId,
    addNode,
    getActiveNodeFormValues,
    getActiveLinkFormValues,
    applySelectedNodeChanges,
    deleteSelectedNode,
    addConnectionFromSidebar,
    deleteEdge,
    selectEdgeByKey,
    addWaypointToSelectedEdge,
    removeWaypointFromSelectedEdge,
    clearWaypointsFromSelectedEdge,
    fetchRemoteGraph,
    reloadGraph,
    saveGraph,
    discardLocalDraft,
    fetchHistoryIndex,
    fetchSnapshotByPath,
    previewLatestSnapshot,
    clearSelection,
    setupSearch
  });
})();
