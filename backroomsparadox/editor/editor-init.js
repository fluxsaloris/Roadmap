(function () {
  "use strict";

  console.log("[editor-init] booting");

  function safeCall(name, ...args) {
    const fn = window[name];

    if (typeof fn !== "function") {
      console.warn(
        `[safeCall] missing function: ${name}`
      );

      return;
    }

    try {
      console.log(
        `[safeCall] ${name}`,
        args
      );

      return fn(...args);

    } catch (err) {
      console.error(
        `[safeCall:${name}]`,
        err
      );
    }
  }

  function ensureBaseState() {

    console.log(
      "[ensureBaseState] checking globals"
    );

    if (!window.graphData) {
      console.warn(
        "[ensureBaseState] graphData missing → creating"
      );

      window.graphData = {
        nodes: [],
        edges: []
      };
    }

    if (
      typeof window.selectedNodeId ===
      "undefined"
    ) {
      window.selectedNodeId = null;
    }

    if (
      typeof window.selectedEdgeKey ===
      "undefined"
    ) {
      window.selectedEdgeKey = null;
    }

    if (
      typeof window.hasUnsavedChanges ===
      "undefined"
    ) {
      window.hasUnsavedChanges = false;
    }

    if (!window.viewportState) {
      console.warn(
        "[ensureBaseState] viewportState missing → creating"
      );

      window.viewportState = {
        x: 80,
        y: 80,
        scale: 1
      };
    }

    if (!Array.isArray(window.undoStack)) {
      console.warn(
        "[ensureBaseState] undoStack missing → creating"
      );

      window.undoStack = [];
    }

    if (!Array.isArray(window.redoStack)) {
      console.warn(
        "[ensureBaseState] redoStack missing → creating"
      );

      window.redoStack = [];
    }

    if (!(window.snapshotCache instanceof Map)) {
      console.warn(
        "[ensureBaseState] snapshotCache missing → creating"
      );

      window.snapshotCache = new Map();
    }

    console.log(
      "[ensureBaseState] complete",
      {
        nodes:
          window.graphData.nodes
            ?.length || 0,

        edges:
          window.graphData.edges
            ?.length || 0
      }
    );
  }

  function hideLoadingForever() {

    const overlay =
      document.getElementById(
        "loadingOverlay"
      );

    if (!overlay) {
      console.warn(
        "[hideLoadingForever] loadingOverlay missing"
      );

      return;
    }

    overlay.style.display = "none";

    console.log(
      "[hideLoadingForever] hidden"
    );
  }

  function showFatalError(message) {

    console.error(
      "[showFatalError]",
      message
    );

    const panel =
      document.getElementById(
        "errorPanel"
      );

    const text =
      document.getElementById(
        "errorPanelText"
      );

    if (text) {
      text.textContent =
        message ||
        "Unknown error";
    }

    if (panel) {
      panel.style.display =
        "block";
    }

    hideLoadingForever();
  }

  async function loadInitialGraph() {

    console.log(
      "[loadInitialGraph] starting"
    );

    try {

      if (
        typeof window.reloadGraph ===
        "function"
      ) {

        console.log(
          "[loadInitialGraph] reloadGraph found"
        );

        await window.reloadGraph(true);

      } else {

        console.warn(
          "[loadInitialGraph] reloadGraph missing → fallback state"
        );
      }

      safeCall("fitToGraph");

      safeCall(
        "refreshChangeSummary"
      );

      safeCall("hideLoading");

      console.log(
        "[loadInitialGraph] complete"
      );

    } catch (err) {

      console.error(
        "[loadInitialGraph] failed",
        err
      );

      showFatalError(
        "Graph failed to load. Using empty state."
      );

      safeCall("refreshAllUI");
    }
  }

  function validateDependencies() {

    console.log(
      "[validateDependencies]"
    );

    const required = [
      "refreshGraph",
      "setupViewportInteractions",
      "reloadGraph"
    ];

    const missing =
      required.filter(
        (name) =>
          typeof window[name] !==
          "function"
      );

    if (missing.length) {

      console.warn(
        "[validateDependencies] missing",
        missing
      );

      return false;
    }

    console.log(
      "[validateDependencies] ok"
    );

    return true;
  }

  async function boot() {

    console.log(
      "[editor-init] boot start"
    );

    try {

      ensureBaseState();

      validateDependencies();

      safeCall(
        "showLoading",
        "Loading editor..."
      );

      console.log(
        "[boot] phase 1 → setup"
      );

      safeCall(
        "restoreMetaFromLocalStorage"
      );

      safeCall("setupSearch");

      safeCall(
        "setupViewportInteractions"
      );

      console.log(
        "[boot] phase 2 → initial render"
      );

      safeCall("refreshAllUI");

      console.log(
        "[boot] phase 3 → graph load"
      );

      await loadInitialGraph();

      console.log(
        "[editor-init] boot complete"
      );

    } catch (err) {

      console.error(
        "[editor-init] BOOT FAILED",
        err
      );

      showFatalError(
        "Editor failed to initialize."
      );
    }
  }

  /*
    CRITICAL:
    Never rely solely on DOMContentLoaded.
    Scripts may load after DOM ready.
  */

  if (
    document.readyState ===
    "loading"
  ) {

    console.log(
      "[editor-init] waiting for DOMContentLoaded"
    );

    document.addEventListener(
      "DOMContentLoaded",
      () => {

        console.log(
          "[editor-init] DOMContentLoaded fired"
        );

        boot();
      }
    );

  } else {

    console.log(
      "[editor-init] DOM already ready"
    );

    queueMicrotask(() => {

      console.log(
        "[editor-init] microtask boot"
      );

      boot();
    });
  }

  window.initEditor = boot;

  console.log(
    "[editor-init] ready"
  );
})();
