(function () {
  "use strict";

  const isMac = () =>
    navigator.platform?.toUpperCase().includes("MAC");

  const modKey = (e) => (isMac() ? e.metaKey : e.ctrlKey);

  function safeCall(name, ...args) {
    const fn = window[name];
    if (typeof fn === "function") {
      try {
        return fn(...args);
      } catch (err) {
        console.error(`safeCall("${name}") failed`, err);
      }
    }
    return undefined;
  }

  function setDefault(obj, key, value) {
    if (typeof obj[key] === "undefined") obj[key] = value;
  }

  function ensureBaseState() {
    window.graphData ||= { nodes: [], edges: [] };

    setDefault(window, "selectedNodeId", null);
    setDefault(window, "selectedEdgeKey", null);
    setDefault(window, "currentSearch", "");
    setDefault(window, "hasUnsavedChanges", false);

    setDefault(window, "lastLocalSaveAt", null);
    setDefault(window, "lastRemoteSaveAt", null);
    setDefault(window, "lastVersionId", null);
    setDefault(window, "lastSnapshotPath", null);

    window.viewportState ||= {
      x: window.innerWidth <= 700 ? 20 : 80,
      y: window.innerWidth <= 700 ? 20 : 80,
      scale: window.innerWidth <= 700 ? 0.55 : 1
    };

    window.interaction ||= {
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

    window.waypointDrag ||= {
      edgeKey: null,
      index: -1,
      active: false
    };

    window.undoStack ||= [];
    window.redoStack ||= [];
    window.snapshotCache ||= new Map();

    setDefault(window, "historyIndexCache", null);
    setDefault(window, "autosaveTimer", null);
    setDefault(window, "diffTimer", null);
    setDefault(window, "saveCooldownUntil", 0);
    setDefault(window, "isSavingToGitHub", false);
    setDefault(window, "latestDiffContext", null);
  }

  function bindWindowEvents() {
    window.addEventListener("resize", () => {
      safeCall("closeMobilePanels");
      safeCall("closeMobileInspector");

      const compact = safeCall("isCompactEditorLayout");

      if (!compact) {
        safeCall("closeInspector");
      }

      const nodes = window.graphData?.nodes;
      if (Array.isArray(nodes) && nodes.length) {
        safeCall("fitToGraph");
        safeCall("refreshAllUI");
      }
    });

    window.addEventListener("keydown", (event) => {
      const mod = modKey(event);
      const key = event.key.toLowerCase();

      if (event.key === "Escape") {
        if (window.selectedNodeId || window.selectedEdgeKey) {
          safeCall("clearSelection");
        } else {
          safeCall("closeMobilePanels");
          safeCall("closeMobileInspector");
        }
        return;
      }

      if (mod && !event.shiftKey && key === "z") {
        event.preventDefault();
        safeCall("undoAction");
      }

      if ((mod && event.shiftKey && key === "z") || (mod && key === "y")) {
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
    const draft = safeCall("loadDraftFromLocal");
    if (!draft?.data) return false;

    const normalize = window.normalizeData;

    window.graphData = typeof normalize === "function"
      ? normalize(draft.data)
      : draft.data;

    window.selectedNodeId =
      draft.selectedNodeId || window.graphData?.nodes?.[0]?.id || null;

    window.selectedEdgeKey = draft.selectedEdgeKey || null;
    window.lastLocalSaveAt = draft.savedAt || null;

    if (draft.viewportState) {
      window.viewportState = {
        x: Number(draft.viewportState.x) || 0,
        y: Number(draft.viewportState.y) || 0,
        scale:
          Number(draft.viewportState.scale) ||
          (window.innerWidth <= 700 ? 0.55 : 1)
      };
    }

    safeCall("applyViewportTransform");
    safeCall("refreshAllUI");
    safeCall("hideLoading");
    safeCall("hideErrorPanel");

    window.hasUnsavedChanges = true;

    safeCall("setSaveBadge", "save-dirty", "Recovered local draft");

    safeCall("setStatus", "Recovered unsaved draft.");

    safeCall("refreshChangeSummary");

    return true;
  }

  async function init() {
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
        await window.reloadGraph(true);
        safeCall("refreshChangeSummary");
      } else {
        safeCall("hideLoading");
        safeCall("showErrorPanel", "reloadGraph is missing.");
        safeCall("setStatus", "Editor failed to load.", true);
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
