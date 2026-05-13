(function () {
  "use strict";

  console.log("[editor-init] booting");

  function safeCall(name, ...args) {
    const fn = window[name];

    if (typeof fn !== "function") {
      console.warn(`[safeCall] missing: ${name}`);
      return;
    }

    try {
      return fn(...args);
    } catch (err) {
      console.error(`[safeCall:${name}]`, err);
    }
  }

  function ensureRuntime() {
    window.editorRuntime ??= {
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
  }

  function ensureGraph() {
    window.graphData ??= { nodes: [], edges: [] };
    window.selectedNodeId ??= null;
    window.selectedEdgeKey ??= null;

    window.viewportState ??= {
      x: 80,
      y: 80,
      scale: 1
    };
  }

  function hideLoadingSafe() {
    const el = document.getElementById("loadingOverlay");
    if (el) el.style.display = "none";
  }

  function showFatal(msg) {
    console.error("[fatal]", msg);

    const panel = document.getElementById("errorPanel");
    const text = document.getElementById("errorPanelText");

    if (text) text.textContent = msg || "Unknown error";
    if (panel) panel.style.display = "block";

    hideLoadingSafe();
  }

  function validateCore() {
    const required = [
      "refreshAllUI",
      "refreshGraph",
      "setupViewportInteractions",
      "reloadGraph"
    ];

    const missing = required.filter(fn => typeof window[fn] !== "function");

    if (missing.length) {
      console.warn("[init] missing functions:", missing);
      return false;
    }

    return true;
  }

  async function boot() {
    console.log("[editor-init] boot start");

    try {
      ensureRuntime();
      ensureGraph();

      validateCore();

      safeCall("showLoading", "Loading editor...");

      // Phase 1: safe UI setup
      safeCall("restoreMetaFromLocalStorage");
      safeCall("setupSearch");
      safeCall("setupViewportInteractions");

      // Phase 2: initial render (must always succeed)
      safeCall("refreshAllUI");

      // Phase 3: graph load
      await loadGraph();

      console.log("[editor-init] boot complete");
    } catch (err) {
      console.error("[editor-init] BOOT FAILED", err);
      showFatal("Editor failed to initialize.");
    }
  }

  async function loadGraph() {
    console.log("[editor-init] loading graph");

    try {
      if (typeof window.reloadGraph === "function") {
        await window.reloadGraph(true);
      }

      safeCall("fitToGraph");
      safeCall("refreshChangeSummary");

      if (typeof window.hideLoading === "function") {
        window.hideLoading();
      }

    } catch (err) {
      console.error("[loadGraph]", err);
      showFatal("Graph failed to load.");
      safeCall("refreshAllUI");
    }
  }

  // DOM bootstrap safety
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    queueMicrotask(boot);
  }

  window.initEditor = boot;

  console.log("[editor-init] ready");
})();
