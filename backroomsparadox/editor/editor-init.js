(function () {
  "use strict";

  function safeCall(name, ...args) {
    const fn = window[name];
    if (typeof fn === "function") {
      try {
        return fn(...args);
      } catch (err) {
        console.error(`[safeCall:${name}]`, err);
      }
    }
  }

  function ensureBaseState() {
    window.graphData = window.graphData || { nodes: [], edges: [] };
    window.selectedNodeId = window.selectedNodeId ?? null;
    window.selectedEdgeKey = window.selectedEdgeKey ?? null;
    window.hasUnsavedChanges = window.hasUnsavedChanges ?? false;

    window.viewportState = window.viewportState || {
      x: 80,
      y: 80,
      scale: 1
    };

    window.undoStack ||= [];
    window.redoStack ||= [];
    window.snapshotCache ||= new Map();
  }

  function hideLoadingForever() {
    const el = document.getElementById("loadingOverlay");
    if (el) el.style.display = "none";
  }

  function showFatalError(msg) {
    const panel = document.getElementById("errorPanel");
    const text = document.getElementById("errorPanelText");

    if (text) text.textContent = msg || "Unknown error";
    if (panel) panel.style.display = "block";

    hideLoadingForever();
  }

  function boot() {
    try {
      ensureBaseState();

      safeCall("showLoading", "Loading editor...");

      // Step 1: UI setup (must never block boot)
      safeCall("restoreMetaFromLocalStorage");
      safeCall("setupSearch");
      safeCall("setupViewportInteractions");

      // Step 2: ALWAYS try to render something first
      safeCall("refreshAllUI");

      // Step 3: Load graph safely
      const load = async () => {
        try {
          if (typeof window.reloadGraph === "function") {
            await window.reloadGraph(true);
          } else {
            console.warn("reloadGraph missing → using fallback graph");
          }

          safeCall("fitToGraph");
          safeCall("refreshChangeSummary");

          safeCall("hideLoading");
        } catch (err) {
          console.error("Graph load failed:", err);
          showFatalError("Graph failed to load. Using empty state.");
          safeCall("refreshAllUI");
        }
      };

      Promise.resolve(load());

    } catch (err) {
      console.error("BOOT FAILED:", err);
      showFatalError("Editor failed to initialize.");
    }
  }

  // 🔥 CRITICAL FIX: NEVER rely on DOMContentLoaded alone
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    queueMicrotask(boot);
  }

  window.initEditor = boot;
})();
