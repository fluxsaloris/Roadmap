(function () {
  function safeCall(name, ...args) {
    const fn = window[name];
    if (typeof fn === "function") {
      try {
        return fn(...args);
      } catch (err) {
        console.error(`safeCall error in ${name}:`, err);
      }
    }
  }

  function ensureBaseState() {
    window.graphData = window.graphData || { nodes: [], edges: [] };

    window.selectedNodeId ??= null;
    window.selectedEdgeKey ??= null;
    window.currentSearch ??= "";

    window.viewportState ??= {
      x: 80,
      y: 80,
      scale: window.innerWidth <= 700 ? 0.55 : 1
    };

    window.interaction ??= {
      isPanning: false,
      panMouseX: 0,
      panMouseY: 0,
      panStartX: 0,
      panStartY: 0,
      dragNodeId: null,
      dragStartMouseX: 0,
      dragStartMouseY: 0,
      dragStartNodeX: 0,
      dragStartNodeY: 0
    };
  }

  function bindWindowEvents() {
    window.addEventListener("resize", () => {
      safeCall("refreshGraph");
      safeCall("fitToGraph");
    });
  }

  function init() {
    ensureBaseState();

    safeCall("showLoading", "Loading graph...");

    // UI + input
    safeCall("setupSearch");

    // viewport (safe guarded)
    if (typeof window.setupViewportInteractions === "function") {
      window.setupViewportInteractions();
    }

    bindWindowEvents();

    // 🚨 CRITICAL: always ensure graph exists BEFORE rendering
    if (!window.graphData) {
      window.graphData = { nodes: [], edges: [] };
    }

    // 🚨 CRITICAL: force render immediately
    queueMicrotask(() => {
      if (typeof window.refreshGraph === "function") {
        window.refreshGraph();
      }

      if (typeof window.fitToGraph === "function") {
        window.fitToGraph();
      }

      safeCall("hideLoading");
      safeCall("setStatus", "Editor ready.");
    });
  }

  window.initEditor = init;
  document.addEventListener("DOMContentLoaded", init);
})();
