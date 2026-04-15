(function () {
  function safeCall(name, ...args) {
    const fn = window[name];
    if (typeof fn === "function") {
      return fn(...args);
    }
    return undefined;
  }

  function ensureBaseState() {
    if (!window.graphData) {
      window.graphData = { nodes: [], edges: [] };
    }

    if (typeof window.selectedNodeId === "undefined") {
      window.selectedNodeId = null;
    }

    if (typeof window.selectedEdgeKey === "undefined") {
      window.selectedEdgeKey = null;
    }

    if (typeof window.currentSearch === "undefined") {
      window.currentSearch = "";
    }

    if (typeof window.hasUnsavedChanges === "undefined") {
      window.hasUnsavedChanges = false;
    }

    if (typeof window.lastLocalSaveAt === "undefined") {
      window.lastLocalSaveAt = null;
    }

    if (typeof window.lastRemoteSaveAt === "undefined") {
      window.lastRemoteSaveAt = null;
    }

    if (typeof window.lastVersionId === "undefined") {
      window.lastVersionId = null;
    }

    if (typeof window.lastSnapshotPath === "undefined") {
      window.lastSnapshotPath = null;
    }

    if (!window.viewportState) {
      window.viewportState = {
        x: window.innerWidth <= 700 ? 20 : 80,
        y: window.innerWidth <= 700 ? 20 : 80,
        scale: window.innerWidth <= 700 ? 0.55 : 1
      };
    }

    if (!window.interaction) {
      window.interaction = {
        isPanning: false,
        panMouseX: 0,
        panMouseY: 0,
        panStartX: 0,
        panStartY: 0,
        movedDuringPointer: false,
        dragNodeId: null,
        dragStartMouseX: 0,
        dragStartMouseY: 0,
        dragStartNodeX: 0,
        dragStartNodeY: 0,
        connectFromNodeId: null,
        connectMouseSceneX: 0,
        connectMouseSceneY: 0
      };
    }

    if (!window.waypointDrag) {
      window.waypointDrag = {
        edgeKey: null,
        index: -1,
        active: false
      };
    }

    if (!window.undoStack) {
      window.undoStack = [];
    }

    if (!window.redoStack) {
      window.redoStack = [];
    }

    if (!window.snapshotCache) {
      window.snapshotCache = new Map();
    }

    if (typeof window.historyIndexCache === "undefined") {
      window.historyIndexCache = null;
    }

    if (typeof window.autosaveTimer === "undefined") {
      window.autosaveTimer = null;
    }

    if (typeof window.diffTimer === "undefined") {
      window.diffTimer = null;
    }

    if (typeof window.saveCooldownUntil === "undefined") {
      window.saveCooldownUntil = 0;
    }

    if (typeof window.isSavingToGitHub === "undefined") {
      window.isSavingToGitHub = false;
    }

    if (typeof window.latestDiffContext === "undefined") {
      window.latestDiffContext = null;
    }
  }

  function bindWindowEvents() {
    window.addEventListener("resize", () => {
      safeCall("closeMobilePanels");
      safeCall("closeMobileInspector");

      if (typeof window.isCompactEditorLayout === "function" && !window.isCompactEditorLayout()) {
        safeCall("closeInspector");
      }

      if (window.graphData && Array.isArray(window.graphData.nodes) && window.graphData.nodes.length) {
        safeCall("fitToGraph");
        safeCall("refreshAllUI");
      }
    });

    window.addEventListener("keydown", (event) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const mod = isMac ? event.metaKey : event.ctrlKey;

      if (event.key === "Escape") {
        if (window.selectedNodeId || window.selectedEdgeKey) {
          safeCall("clearSelection");
        } else {
          safeCall("closeMobilePanels");
          safeCall("closeMobileInspector");
        }
      }

      if (mod && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        safeCall("undoAction");
      }

      if (
        (mod && event.shiftKey && event.key.toLowerCase() === "z") ||
        (mod && event.key.toLowerCase() === "y")
      ) {
        event.preventDefault();
        safeCall("redoAction");
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        safeCall("saveDraftToLocal");
      }
    });

    window.addEventListener("beforeunload", (event) => {
      if (!window.hasUnsavedChanges) return;
      safeCall("saveDraftToLocal");
      event.preventDefault();
      event.returnValue = "";
    });
  }

  function restoreLocalDraftIfPresent() {
    const localDraft = safeCall("loadDraftFromLocal");
    if (!localDraft || !localDraft.data) return false;

    window.graphData =
      typeof window.normalizeData === "function"
        ? window.normalizeData(localDraft.data)
        : localDraft.data;

    window.selectedNodeId =
      localDraft.selectedNodeId || window.graphData?.nodes?.[0]?.id || null;

    window.selectedEdgeKey = localDraft.selectedEdgeKey || null;
    window.lastLocalSaveAt = localDraft.savedAt || null;

    if (localDraft.viewportState) {
      window.viewportState = {
        x: typeof localDraft.viewportState.x === "number" ? localDraft.viewportState.x : 0,
        y: typeof localDraft.viewportState.y === "number" ? localDraft.viewportState.y : 0,
        scale:
          typeof localDraft.viewportState.scale === "number"
            ? localDraft.viewportState.scale
            : ((typeof window.isMobileLayout === "function" && window.isMobileLayout()) ? 0.55 : 1)
      };
    }

    safeCall("applyViewportTransform");
    safeCall("refreshAllUI");
    safeCall("hideLoading");
    safeCall("hideErrorPanel");

    window.hasUnsavedChanges = true;
    safeCall("setSaveBadge", "save-dirty", "Recovered local draft");

    if (!(typeof window.isMobileLayout === "function" && window.isMobileLayout())) {
      safeCall("setStatus", "Recovered unsaved local draft.");
    }

    safeCall("refreshChangeSummary");
    return true;
  }

  function init() {
    try {
      ensureBaseState();

      safeCall("showLoading", "Loading editor...");
      safeCall("restoreMetaFromLocalStorage");
      safeCall("setupSearch");
      safeCall("setupViewportInteractions");

      bindWindowEvents();

      if (restoreLocalDraftIfPresent()) {
        return;
      }

      if (typeof window.reloadGraph === "function") {
        Promise.resolve(window.reloadGraph(true))
          .then(() => {
            safeCall("refreshChangeSummary");
          })
          .catch((err) => {
            console.error(err);
            safeCall("hideLoading");
            safeCall("showErrorPanel", err?.message || "Editor failed to load.");
            safeCall("setStatus", "Editor failed to load.", true);
          });
      } else {
        safeCall("hideLoading");
        safeCall("showErrorPanel", "reloadGraph is missing.");
        safeCall("setStatus", "Editor loaded, but reloadGraph is missing.", true);
      }
    } catch (err) {
      console.error(err);
      safeCall("hideLoading");
      safeCall("showErrorPanel", err?.message || "Editor init failed.");
      safeCall("setStatus", "Editor init failed.", true);
    }
  }

  window.initEditor = init;
  document.addEventListener("DOMContentLoaded", init);
})();
