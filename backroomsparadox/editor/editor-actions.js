(function () {
  if (typeof window.hasUnsavedChanges === "undefined") window.hasUnsavedChanges = false;
  if (typeof window.isSavingToGitHub === "undefined") window.isSavingToGitHub = false;
  if (typeof window.lastLocalSaveAt === "undefined") window.lastLocalSaveAt = null;
  if (typeof window.lastRemoteSaveAt === "undefined") window.lastRemoteSaveAt = null;
  if (typeof window.lastVersionId === "undefined") window.lastVersionId = null;
  if (typeof window.lastSnapshotPath === "undefined") window.lastSnapshotPath = null;
  if (!window.undoStack) window.undoStack = [];
  if (!window.redoStack) window.redoStack = [];
  if (!window.snapshotCache) window.snapshotCache = new Map();
  if (typeof window.historyIndexCache === "undefined") window.historyIndexCache = null;
  if (typeof window.latestDiffContext === "undefined") window.latestDiffContext = null;
  if (typeof window.autosaveTimer === "undefined") window.autosaveTimer = null;
  if (typeof window.diffTimer === "undefined") window.diffTimer = null;
  if (typeof window.saveCooldownUntil === "undefined") window.saveCooldownUntil = 0;

  function pushUndoState(label = "Edit") {
    window.undoStack.push({
      label,
      data: window.cloneData(window.graphData),
      selectedNodeId: window.selectedNodeId,
      selectedEdgeKey: window.selectedEdgeKey
    });

    if (window.undoStack.length > window.MAX_HISTORY) {
      window.undoStack.shift();
    }

    window.redoStack = [];
    if (window.updateStatsBar) window.updateStatsBar();
  }

  function restoreState(snapshot, reason) {
    window.graphData = window.normalizeData(snapshot.data);
    window.selectedNodeId = snapshot.selectedNodeId || null;
    window.selectedEdgeKey = snapshot.selectedEdgeKey || null;
    if (window.refreshAllUI) window.refreshAllUI();
    if (window.setStatus) window.setStatus(reason);
  }

  function undoAction() {
    if (!window.undoStack.length) return;

    window.redoStack.push({
      label: "Redo",
      data: window.cloneData(window.graphData),
      selectedNodeId: window.selectedNodeId,
      selectedEdgeKey: window.selectedEdgeKey
    });

    const snapshot = window.undoStack.pop();
    restoreState(snapshot, "Undid last action.");
    markDirtyNoHistory("Undo applied.");
  }

  function redoAction() {
    if (!window.redoStack.length) return;

    window.undoStack.push({
      label: "Undo",
      data: window.cloneData(window.graphData),
      selectedNodeId: window.selectedNodeId,
      selectedEdgeKey: window.selectedEdgeKey
    });

    const snapshot = window.redoStack.pop();
    restoreState(snapshot, "Redid last action.");
    markDirtyNoHistory("Redo applied.");
  }

  function saveDraftToLocal() {
    try {
      const payload = {
        savedAt: Date.now(),
        data: window.getSerializableGraphData(),
        selectedNodeId: window.selectedNodeId,
        selectedEdgeKey: window.selectedEdgeKey,
        viewportState: window.viewportState
      };

      localStorage.setItem(window.LOCAL_DRAFT_KEY, JSON.stringify(payload));
      window.lastLocalSaveAt = payload.savedAt;
      if (window.updateStatsBar) window.updateStatsBar();
    } catch (err) {
      console.error(err);
    }
  }

  function loadDraftFromLocal() {
    try {
      const raw = localStorage.getItem(window.LOCAL_DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.data) return null;
      return parsed;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  function clearLocalDraft() {
    try {
      localStorage.removeItem(window.LOCAL_DRAFT_KEY);
    } catch (err) {
      console.error(err);
    }
  }

  function restoreMetaFromLocalStorage() {
    const savedRemote = localStorage.getItem(window.LAST_REMOTE_SAVE_KEY);
    const savedSnapshot = localStorage.getItem(window.LAST_SNAPSHOT_META_KEY);

    if (savedRemote) {
      const n = Number(savedRemote);
      if (!Number.isNaN(n) && n > 0) window.lastRemoteSaveAt = n;
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

    if (window.updateMetaBadges) window.updateMetaBadges();
  }

  function persistMetaToLocalStorage() {
    if (window.lastRemoteSaveAt) {
      localStorage.setItem(window.LAST_REMOTE_SAVE_KEY, String(window.lastRemoteSaveAt));
    }

    localStorage.setItem(window.LAST_SNAPSHOT_META_KEY, JSON.stringify({
      version: window.lastVersionId,
      snapshotPath: window.lastSnapshotPath
    }));
  }

  function scheduleAutosave() {
    clearTimeout(window.autosaveTimer);
    window.autosaveTimer = setTimeout(() => {
      saveDraftToLocal();
    }, 300);
  }

  function scheduleDiffRefresh() {
    clearTimeout(window.diffTimer);
    window.diffTimer = setTimeout(() => {
      if (window.refreshChangeSummary) window.refreshChangeSummary();
    }, 250);
  }

  function markDirty(reason = "Unsaved changes") {
    window.hasUnsavedChanges = true;
    if (window.setSaveBadge) window.setSaveBadge("save-dirty", "Unsaved changes");
    if (window.setStatus && window.innerWidth > 700) window.setStatus(reason);
    saveDraftToLocal();
    scheduleDiffRefresh();
    if (window.updateStatsBar) window.updateStatsBar();
  }

  function markDirtyNoHistory(reason = "Unsaved changes") {
    window.hasUnsavedChanges = true;
    if (window.setSaveBadge) window.setSaveBadge("save-dirty", "Unsaved changes");
    if (window.setStatus && window.innerWidth > 700) window.setStatus(reason);
    saveDraftToLocal();
    scheduleDiffRefresh();
    if (window.updateStatsBar) window.updateStatsBar();
  }

  function markClean(message = "All changes saved locally") {
    window.hasUnsavedChanges = false;
    if (window.setSaveBadge) window.setSaveBadge("save-clean", message);
    if (window.setStatus && window.innerWidth > 700) window.setStatus(message);
    if (window.updateStatsBar) window.updateStatsBar();
    scheduleDiffRefresh();
  }

  function edgeExists(from, to, label = "") {
    return (window.graphData.edges || []).some(
      e => e.from === from && e.to === to && (e.label || "") === (label || "")
    );
  }

  function addEdge(from, to, label = "", oneWay = true) {
    if (!from || !to || from === to) return;
    if (edgeExists(from, to, label)) return;

    const edge = {
      from,
      to,
      label: label || "",
      oneWay: !!oneWay,
      waypoints: []
    };

    window.graphData.edges.push(edge);

    if (!oneWay && !edgeExists(to, from, label)) {
      window.graphData.edges.push({
        from: to,
        to: from,
        label: label || "",
        oneWay: !!oneWay,
        waypoints: []
      });
    }
  }

  function generateNodeId() {
    const used = new Set((window.graphData.nodes || []).map(n => String(n.id || "")));
    return window.makeUniqueId("level", used);
  }

  function addNode() {
    pushUndoState("Add node");

    const nextId = generateNodeId();
    const rect = window.graphViewportRect();
    const center = window.scenePointFromClient(rect.left + rect.width / 2, rect.top + rect.height / 2);

    window.graphData.nodes.push({
      id: nextId,
      label: "New Level",
      subtitle: "",
      description: "",
      notes: "",
      x: Math.round(center.x),
      y: Math.round(center.y),
      type: "stable",
      status: "draft",
      tags: []
    });

    window.selectedNodeId = nextId;
    window.selectedEdgeKey = null;

    if (window.refreshAllUI) window.refreshAllUI();
    markDirty("Added new node.");
  }

  function getActiveNodeFormValues() {
    return {
      label: (document.getElementById("nodeLabel") || {}).value || "",
      subtitle: (document.getElementById("nodeSubtitle") || {}).value || "",
      type: (document.getElementById("nodeType") || {}).value || "stable",
      status: (document.getElementById("nodeStatus") || {}).value || "draft",
      x: (document.getElementById("nodeX") || {}).value || 0,
      y: (document.getElementById("nodeY") || {}).value || 0,
      tags: (document.getElementById("nodeTags") || {}).value || "",
      description: (document.getElementById("nodeDescription") || {}).value || "",
      notes: (document.getElementById("nodeNotes") || {}).value || ""
    };
  }

  function getActiveLinkFormValues() {
    return {
      targetId: (document.getElementById("linkTarget") || {}).value || "",
      label: (document.getElementById("linkLabel") || {}).value || "",
      oneWay: ((document.getElementById("linkOneWay") || {}).value || "yes") === "yes"
    };
  }

  function applySelectedNodeChanges() {
    const node = window.getSelectedNode();
    if (!node) return;

    pushUndoState("Update node");

    const values = getActiveNodeFormValues();
    node.label = values.label.trim() || "Unnamed";
    node.subtitle = values.subtitle.trim();
    node.type = window.normalizeType(values.type);
    node.status = values.status;
    node.x = Number(values.x || 0);
    node.y = Number(values.y || 0);
    node.tags = values.tags.split(",").map(v => v.trim()).filter(Boolean);
    node.description = values.description;
    node.notes = values.notes;

    if (window.refreshAllUI) window.refreshAllUI();
    markDirty("Node updated.");
  }

  function deleteSelectedNode() {
    const node = window.getSelectedNode();
    if (!node) return;

    if (!confirm(`Delete ${node.label}?`)) return;

    pushUndoState("Delete node");
    window.graphData.nodes = window.graphData.nodes.filter(n => n.id !== node.id);
    window.graphData.edges = window.graphData.edges.filter(e => e.from !== node.id && e.to !== node.id);
    window.selectedNodeId = null;
    window.selectedEdgeKey = null;

    if (window.refreshAllUI) window.refreshAllUI();
    markDirty("Deleted node.");
  }

  function addConnectionFromSidebar() {
    const node = window.getSelectedNode();
    if (!node) return;

    const values = getActiveLinkFormValues();
    if (!values.targetId) return;

    pushUndoState("Add link");
    addEdge(node.id, values.targetId, values.label.trim(), values.oneWay);
    if (window.refreshAllUI) window.refreshAllUI();
    markDirty("Added link.");
  }

  function deleteEdge(from, to, label) {
    pushUndoState("Delete link");
    window.graphData.edges = window.graphData.edges.filter(
      e => !(e.from === from && e.to === to && (e.label || "") === (label || ""))
    );

    if (window.selectedEdgeKey) {
      const exists = window.graphData.edges.some(e => window.edgeKeyOf(e) === window.selectedEdgeKey);
      if (!exists) window.selectedEdgeKey = null;
    }

    if (window.refreshAllUI) window.refreshAllUI();
    markDirty("Deleted link.");
  }

  function selectEdgeByKey(key) {
    const edge = window.getEdgeByKey(key);
    window.selectedEdgeKey = edge ? key : null;
    if (window.refreshAllUI) window.refreshAllUI();
  }

  function addWaypointToSelectedEdge() {
    const edge = window.getEdgeByKey(window.selectedEdgeKey);
    if (!edge) return;

    pushUndoState("Add bend point");

    const pts = window.buildEdgePoints(edge);
    const mid = window.getEdgeMidpoint(pts);
    edge.waypoints = window.normalizeWaypoints(edge.waypoints);
    edge.waypoints.push({ x: Math.round(mid.x), y: Math.round(mid.y) });

    if (window.refreshAllUI) window.refreshAllUI();
    markDirty("Added bend point.");
  }

  function removeWaypointFromSelectedEdge(index) {
    const edge = window.getEdgeByKey(window.selectedEdgeKey);
    if (!edge) return;
    if (!Array.isArray(edge.waypoints) || !edge.waypoints[index]) return;

    pushUndoState("Remove bend point");
    edge.waypoints.splice(index, 1);

    if (window.refreshAllUI) window.refreshAllUI();
    markDirty("Removed bend point.");
  }

  function clearWaypointsFromSelectedEdge() {
    const edge = window.getEdgeByKey(window.selectedEdgeKey);
    if (!edge) return;

    pushUndoState("Clear bend points");
    edge.waypoints = [];

    if (window.refreshAllUI) window.refreshAllUI();
    markDirty("Cleared bend points.");
  }

  async function fetchRemoteGraph() {
    const res = await fetch(window.RAW_JSON_URL + "?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load backrooms-levels.json");
    return window.normalizeData(await res.json());
  }

  async function reloadGraph(force = false) {
    try {
      if (window.hasUnsavedChanges && !force) {
        if (window.setStatus) window.setStatus("Reload skipped because you have unsaved changes.");
        return;
      }

      if (window.showLoading) window.showLoading("Loading graph...");
      if (window.setStatus) window.setStatus("Loading latest graph...");

      window.graphData = await fetchRemoteGraph();
      window.selectedNodeId = window.graphData.nodes[0]?.id || null;
      window.selectedEdgeKey = null;

      if (window.refreshAllUI) window.refreshAllUI();
      if (window.fitToGraph) window.fitToGraph();

      if (window.hideLoading) window.hideLoading();
      if (window.hideErrorPanel) window.hideErrorPanel();
      markClean("Loaded latest graph.");
    } catch (err) {
      console.error(err);
      if (window.hideLoading) window.hideLoading();
      if (window.setStatus) window.setStatus("Failed to load graph.", true);
      if (window.showErrorPanel) window.showErrorPanel(err.message || "Failed to load graph.");
    }
  }

  async function saveGraph() {
    try {
      if (window.isSavingToGitHub) return;

      window.isSavingToGitHub = true;
      if (window.setSaveBadge) window.setSaveBadge("save-saving", "Saving to GitHub...");
      if (window.setStatus) window.setStatus("Saving graph...");

      const payload = window.getSerializableGraphData();

      const res = await fetch(window.SAVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: window.PROJECT,
          data: payload
        })
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Save failed");

      window.hasUnsavedChanges = false;
      window.lastRemoteSaveAt = json?.savedAt ? (Date.parse(json.savedAt) || Date.now()) : Date.now();
      window.lastVersionId = json?.version || null;
      window.lastSnapshotPath = json?.snapshotPath || null;

      persistMetaToLocalStorage();
      if (window.updateMetaBadges) window.updateMetaBadges();
      if (window.setSaveBadge) window.setSaveBadge("save-clean", "Saved to GitHub");
      if (window.setStatus) window.setStatus("Saved to GitHub.");

      saveDraftToLocal();
      window.historyIndexCache = null;
      window.snapshotCache = new Map();
      scheduleDiffRefresh();
    } catch (err) {
      console.error(err);
      if (window.setSaveBadge) window.setSaveBadge("save-error", "GitHub save failed");
      if (window.setStatus) window.setStatus("Save failed.", true);
      if (window.showErrorPanel) window.showErrorPanel(err.message || "Save failed.");
    } finally {
      window.isSavingToGitHub = false;
    }
  }

  function discardLocalDraft() {
    if (!confirm("Discard your local draft and reload from GitHub?")) return;
    clearLocalDraft();
    window.hasUnsavedChanges = false;
    reloadGraph(true);
  }

  async function fetchHistoryIndex() {
    if (window.historyIndexCache) return window.historyIndexCache;
    const res = await fetch(`${window.SAVE_URL}?project=${encodeURIComponent(window.PROJECT)}&action=history`);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Failed to fetch history");
    window.historyIndexCache = json;
    return json;
  }

  async function fetchSnapshotByPath(path) {
    if (window.snapshotCache.has(path)) return window.snapshotCache.get(path);
    const res = await fetch(`${window.SAVE_URL}?project=${encodeURIComponent(window.PROJECT)}&action=snapshot&path=${encodeURIComponent(path)}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Failed to fetch snapshot");
    const normalized = window.normalizeData(json?.data || json);
    window.snapshotCache.set(path, normalized);
    return normalized;
  }

  async function previewLatestSnapshot() {
    try {
      const history = await fetchHistoryIndex();
      const versions = Array.isArray(history?.versions) ? history.versions : [];
      if (!versions.length) {
        if (window.setStatus) window.setStatus("No snapshot history yet.");
        return;
      }

      const snapshot = await fetchSnapshotByPath(versions[0].path);
      window.graphData = snapshot;
      window.selectedNodeId = snapshot.nodes[0]?.id || null;
      window.selectedEdgeKey = null;

      if (window.refreshAllUI) window.refreshAllUI();
      if (window.fitToGraph) window.fitToGraph();
      if (window.setStatus) window.setStatus("Previewing latest snapshot.");
    } catch (err) {
      console.error(err);
      if (window.showErrorPanel) window.showErrorPanel(err.message || "Snapshot preview failed.");
    }
  }

  function clearSelection() {
    window.selectedNodeId = null;
    window.selectedEdgeKey = null;
    if (window.refreshAllUI) window.refreshAllUI();
    if (window.setStatus) window.setStatus("Selection cleared.");
  }

  function setupSearch() {
    const input = document.getElementById("searchInput");
    if (!input) return;

    input.addEventListener("input", (event) => {
      window.currentSearch = String(event.target.value || "").trim().toLowerCase();
      if (window.refreshGraph) window.refreshGraph();
    });
  }

  window.pushUndoState = pushUndoState;
  window.restoreState = restoreState;
  window.undoAction = undoAction;
  window.redoAction = redoAction;
  window.saveDraftToLocal = saveDraftToLocal;
  window.loadDraftFromLocal = loadDraftFromLocal;
  window.clearLocalDraft = clearLocalDraft;
  window.restoreMetaFromLocalStorage = restoreMetaFromLocalStorage;
  window.persistMetaToLocalStorage = persistMetaToLocalStorage;
  window.scheduleAutosave = scheduleAutosave;
  window.scheduleDiffRefresh = scheduleDiffRefresh;
  window.markDirty = markDirty;
  window.markDirtyNoHistory = markDirtyNoHistory;
  window.markClean = markClean;
  window.edgeExists = edgeExists;
  window.addEdge = addEdge;
  window.generateNodeId = generateNodeId;
  window.addNode = addNode;
  window.getActiveNodeFormValues = getActiveNodeFormValues;
  window.getActiveLinkFormValues = getActiveLinkFormValues;
  window.applySelectedNodeChanges = applySelectedNodeChanges;
  window.deleteSelectedNode = deleteSelectedNode;
  window.addConnectionFromSidebar = addConnectionFromSidebar;
  window.deleteEdge = deleteEdge;
  window.selectEdgeByKey = selectEdgeByKey;
  window.addWaypointToSelectedEdge = addWaypointToSelectedEdge;
  window.removeWaypointFromSelectedEdge = removeWaypointFromSelectedEdge;
  window.clearWaypointsFromSelectedEdge = clearWaypointsFromSelectedEdge;
  window.fetchRemoteGraph = fetchRemoteGraph;
  window.reloadGraph = reloadGraph;
  window.saveGraph = saveGraph;
  window.discardLocalDraft = discardLocalDraft;
  window.fetchHistoryIndex = fetchHistoryIndex;
  window.fetchSnapshotByPath = fetchSnapshotByPath;
  window.previewLatestSnapshot = previewLatestSnapshot;
  window.clearSelection = clearSelection;
  window.setupSearch = setupSearch;
})();
