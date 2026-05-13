(function () {
  "use strict";

  console.log("[editor-actions] booting");

  const DEFAULT_AUTOSAVE_DELAY = 500;
  const DEFAULT_DIFF_DELAY = 200;
  const DEFAULT_SAVE_COOLDOWN = 1500;
  const MAX_HISTORY = window.MAX_HISTORY || 100;

  const safeNow = () => Date.now();

  const deepClone = (value) => {
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch (err) {
        console.warn("[deepClone] structuredClone failed", err);
      }
    }

    return JSON.parse(JSON.stringify(value));
  };

  const debounce = (fn, delay) => {
    let timer = null;

    return (...args) => {
      clearTimeout(timer);

      timer = setTimeout(() => {
        fn(...args);
      }, delay);
    };
  };

  const safeStorage = {
    get(key, fallback = null) {
      try {
        const value = localStorage.getItem(key);

        console.log("[safeStorage.get]", key, value);

        return value === null ? fallback : value;
      } catch (err) {
        console.error("[safeStorage.get]", err);
        return fallback;
      }
    },

    set(key, value) {
      try {
        localStorage.setItem(key, value);

        console.log("[safeStorage.set]", key);

        return true;
      } catch (err) {
        console.error("[safeStorage.set]", err);
        return false;
      }
    },

    remove(key) {
      try {
        localStorage.removeItem(key);

        console.log("[safeStorage.remove]", key);

        return true;
      } catch (err) {
        console.error("[safeStorage.remove]", err);
        return false;
      }
    }
  };

  if (!window.editorRuntime) {
    window.editorRuntime = {
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

    console.log("[editor-actions] editorRuntime created");
  }

  function assertDependency(name) {
    if (typeof window[name] === "undefined") {
      console.error(`[editor-actions] Missing dependency: ${name}`);
    }
  }

  [
    "graphData",
    "normalizeData",
    "refreshAllUI",
    "getSerializableGraphData"
  ].forEach(assertDependency);

  function updateUIState(status, message, isError = false) {
    console.log("[updateUIState]", {
      status,
      message,
      isError
    });

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
    console.log("[buildSnapshot]", label);

    return {
      id:
        crypto.randomUUID?.() ||
        `${safeNow()}-${Math.random()}`,

      label,

      timestamp: safeNow(),

      data: deepClone(window.graphData),

      selectedNodeId:
        window.selectedNodeId || null,

      selectedEdgeKey:
        window.selectedEdgeKey || null
    };
  }

  function pushUndoState(label = "Edit") {
    console.log("[pushUndoState]", label);

    const snapshot = buildSnapshot(label);

    const stack =
      window.editorRuntime.undoStack;

    const lastSnapshot =
      stack[stack.length - 1];

    if (
      lastSnapshot &&
      JSON.stringify(lastSnapshot.data) ===
        JSON.stringify(snapshot.data)
    ) {
      console.log(
        "[pushUndoState] duplicate skipped"
      );

      return;
    }

    stack.push(snapshot);

    if (stack.length > MAX_HISTORY) {
      stack.shift();
    }

    window.editorRuntime.redoStack.length = 0;

    console.log(
      "[pushUndoState] undo stack size",
      stack.length
    );

    if (window.updateStatsBar) {
      window.updateStatsBar();
    }
  }

  function restoreState(
    snapshot,
    reason = "State restored."
  ) {
    console.log("[restoreState]", reason);

    if (!snapshot?.data) {
      console.warn(
        "[restoreState] invalid snapshot"
      );

      return;
    }

    const normalized =
      window.normalizeData(
        deepClone(snapshot.data)
      );

    if (!window.graphData) {
      window.graphData = {
        nodes: [],
        edges: []
      };
    }

    window.graphData.nodes.splice(
      0,
      window.graphData.nodes.length,
      ...normalized.nodes
    );

    window.graphData.edges.splice(
      0,
      window.graphData.edges.length,
      ...normalized.edges
    );

    window.selectedNodeId =
      snapshot.selectedNodeId || null;

    window.selectedEdgeKey =
      snapshot.selectedEdgeKey || null;

    if (window.refreshAllUI) {
      window.refreshAllUI();
    }

    updateUIState(null, reason);
  }

  function undoAction() {
    console.log("[undoAction]");

    const undoStack =
      window.editorRuntime.undoStack;

    if (!undoStack.length) {
      console.warn("[undoAction] empty");

      return;
    }

    const currentState =
      buildSnapshot("Redo");

    window.editorRuntime.redoStack.push(
      currentState
    );

    const snapshot = undoStack.pop();

    restoreState(snapshot, "Undo applied.");

    markDirtyNoHistory("Undo applied.");
  }

  function redoAction() {
    console.log("[redoAction]");

    const redoStack =
      window.editorRuntime.redoStack;

    if (!redoStack.length) {
      console.warn("[redoAction] empty");

      return;
    }

    const currentState =
      buildSnapshot("Undo");

    window.editorRuntime.undoStack.push(
      currentState
    );

    const snapshot = redoStack.pop();

    restoreState(snapshot, "Redo applied.");

    markDirtyNoHistory("Redo applied.");
  }

  function getDraftPayload() {
    console.log("[getDraftPayload]");

    return {
      savedAt: safeNow(),

      data:
        window.getSerializableGraphData(),

      selectedNodeId:
        window.selectedNodeId || null,

      selectedEdgeKey:
        window.selectedEdgeKey || null,

      viewportState:
        window.viewportState || null
    };
  }

  function saveDraftToLocal() {
    console.log("[saveDraftToLocal]");

    const payload = getDraftPayload();

    const success = safeStorage.set(
      window.LOCAL_DRAFT_KEY,
      JSON.stringify(payload)
    );

    if (success) {
      window.editorRuntime.lastLocalSaveAt =
        payload.savedAt;

      if (window.updateStatsBar) {
        window.updateStatsBar();
      }
    }
  }

  function loadDraftFromLocal() {
    console.log("[loadDraftFromLocal]");

    const raw = safeStorage.get(
      window.LOCAL_DRAFT_KEY
    );

    if (!raw) {
      console.warn(
        "[loadDraftFromLocal] no draft"
      );

      return null;
    }

    try {
      const parsed = JSON.parse(raw);

      if (!parsed?.data) {
        return null;
      }

      return parsed;
    } catch (err) {
      console.error(
        "[loadDraftFromLocal]",
        err
      );

      return null;
    }
  }

  function clearLocalDraft() {
    console.log("[clearLocalDraft]");

    safeStorage.remove(
      window.LOCAL_DRAFT_KEY
    );
  }

  const scheduleAutosave = debounce(() => {
    console.log("[scheduleAutosave]");
    saveDraftToLocal();
  }, DEFAULT_AUTOSAVE_DELAY);

  const scheduleDiffRefresh = debounce(() => {
    console.log("[scheduleDiffRefresh]");

    if (window.refreshChangeSummary) {
      window.refreshChangeSummary();
    }
  }, DEFAULT_DIFF_DELAY);

  function markDirty(
    reason = "Unsaved changes"
  ) {
    console.log("[markDirty]", reason);

    window.editorRuntime.hasUnsavedChanges =
      true;

    updateUIState(
      "save-dirty",
      "Unsaved changes"
    );

    scheduleAutosave();
    scheduleDiffRefresh();

    if (reason && window.setStatus) {
      window.setStatus(reason);
    }
  }

  function markDirtyNoHistory(
    reason = "Unsaved changes"
  ) {
    console.log(
      "[markDirtyNoHistory]",
      reason
    );

    window.editorRuntime.hasUnsavedChanges =
      true;

    updateUIState(
      "save-dirty",
      "Unsaved changes"
    );

    scheduleAutosave();
    scheduleDiffRefresh();
  }

  function markClean(
    message = "All changes saved"
  ) {
    console.log("[markClean]", message);

    window.editorRuntime.hasUnsavedChanges =
      false;

    updateUIState(
      "save-clean",
      message
    );

    scheduleDiffRefresh();
  }

  function edgeExists(
    from,
    to,
    label = ""
  ) {
    return (
      window.graphData.edges || []
    ).some(
      (edge) =>
        edge.from === from &&
        edge.to === to &&
        (edge.label || "") ===
          (label || "")
    );
  }

  function addEdge(
    from,
    to,
    label = "",
    oneWay = true
  ) {
    console.log("[addEdge]", {
      from,
      to,
      label,
      oneWay
    });

    if (!from || !to || from === to) {
      return false;
    }

    if (edgeExists(from, to, label)) {
      console.warn(
        "[addEdge] duplicate"
      );

      return false;
    }

    const edge = {
      from,
      to,
      label: String(label || "").trim(),
      oneWay: Boolean(oneWay),
      waypoints: []
    };

    window.graphData.edges.push(edge);

    if (
      !oneWay &&
      !edgeExists(to, from, label)
    ) {
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
    console.log("[generateNodeId]");

    const usedIds = new Set(
      (window.graphData.nodes || []).map(
        (node) =>
          String(node.id || "")
      )
    );

    return window.makeUniqueId(
      "level",
      usedIds
    );
  }

  function addNode() {
    console.log("[addNode]");

    if (
      !window.graphViewportRect ||
      !window.scenePointFromClient
    ) {
      console.error(
        "[addNode] viewport helpers missing"
      );

      return;
    }

    pushUndoState("Add node");

    const nextId = generateNodeId();

    const rect =
      window.graphViewportRect();

    const center =
      window.scenePointFromClient(
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

  async function fetchJSON(
    url,
    options = {}
  ) {
    console.log("[fetchJSON]", url);

    const response = await fetch(url, {
      cache: "no-store",
      ...options
    });

    const json = await response
      .json()
      .catch(() => null);

    console.log("[fetchJSON result]", {
      status: response.status,
      json
    });

    if (!response.ok) {
      throw new Error(
        json?.error ||
          `Request failed (${response.status})`
      );
    }

    return json;
  }

  async function fetchRemoteGraph() {
    console.log("[fetchRemoteGraph]");

    const data = await fetchJSON(
      `${window.RAW_JSON_URL}?v=${safeNow()}`
    );

    return window.normalizeData(data);
  }

  async function reloadGraph(
    force = false
  ) {
    console.log("[reloadGraph]", force);

    try {
      if (
        window.editorRuntime
          .hasUnsavedChanges &&
        !force
      ) {
        updateUIState(
          null,
          "Reload blocked due to unsaved changes."
        );

        return;
      }

      if (window.showLoading) {
        window.showLoading(
          "Loading graph..."
        );
      }

      updateUIState(
        "save-loading",
        "Loading latest graph..."
      );

      const graph =
        await fetchRemoteGraph();

      window.graphData.nodes.splice(
        0,
        window.graphData.nodes.length,
        ...graph.nodes
      );

      window.graphData.edges.splice(
        0,
        window.graphData.edges.length,
        ...graph.edges
      );

      window.selectedNodeId =
        graph.nodes?.[0]?.id || null;

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

      markClean(
        "Loaded latest graph."
      );
    } catch (err) {
      console.error(
        "[reloadGraph]",
        err
      );

      if (window.hideLoading) {
        window.hideLoading();
      }

      updateUIState(
        "save-error",
        "Failed to load graph.",
        true
      );
    }
  }

  async function saveGraph() {
    console.log("[saveGraph]");

    try {
      if (
        window.editorRuntime
          .isSavingToGitHub
      ) {
        console.warn(
          "[saveGraph] already saving"
        );

        return;
      }

      window.editorRuntime.isSavingToGitHub =
        true;

      updateUIState(
        "save-saving",
        "Saving graph..."
      );

      const payload = {
        project: window.PROJECT,
        data:
          window.getSerializableGraphData()
      };

      const json = await fetchJSON(
        window.SAVE_URL,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      console.log(
        "[saveGraph success]",
        json
      );

      window.editorRuntime.hasUnsavedChanges =
        false;

      window.editorRuntime.lastRemoteSaveAt =
        json?.savedAt
          ? Date.parse(json.savedAt) ||
            safeNow()
          : safeNow();

      saveDraftToLocal();

      markClean("Saved to GitHub.");
    } catch (err) {
      console.error(
        "[saveGraph]",
        err
      );

      updateUIState(
        "save-error",
        "GitHub save failed.",
        true
      );
    } finally {
      window.editorRuntime.isSavingToGitHub =
        false;
    }
  }

  function clearSelection() {
    console.log("[clearSelection]");

    window.selectedNodeId = null;
    window.selectedEdgeKey = null;

    if (window.refreshAllUI) {
      window.refreshAllUI();
    }

    updateUIState(
      null,
      "Selection cleared."
    );
  }

  function setupSearch() {
    console.log("[setupSearch]");

    const input =
      document.getElementById(
        "searchInput"
      );

    if (!input) {
      console.warn(
        "[setupSearch] missing input"
      );

      return;
    }

    input.addEventListener(
      "input",
      debounce((event) => {
        const value = String(
          event.target.value || ""
        )
          .trim()
          .toLowerCase();

        console.log(
          "[search]",
          value
        );

        window.editorRuntime.currentSearch =
          value;

        if (window.refreshGraph) {
          window.refreshGraph();
        }
      }, 100)
    );
  }

  window.addEventListener(
    "beforeunload",
    (event) => {
      if (
        !window.editorRuntime
          .hasUnsavedChanges
      ) {
        return;
      }

      console.warn(
        "[beforeunload] unsaved changes"
      );

      event.preventDefault();
      event.returnValue = "";
    }
  );

  Object.assign(window, {
    pushUndoState,
    restoreState,
    undoAction,
    redoAction,
    saveDraftToLocal,
    loadDraftFromLocal,
    clearLocalDraft,
    scheduleAutosave,
    scheduleDiffRefresh,
    markDirty,
    markDirtyNoHistory,
    markClean,
    edgeExists,
    addEdge,
    generateNodeId,
    addNode,
    fetchRemoteGraph,
    reloadGraph,
    saveGraph,
    clearSelection,
    setupSearch
  });

  console.log(
    "[editor-actions] ready"
  );
})();
