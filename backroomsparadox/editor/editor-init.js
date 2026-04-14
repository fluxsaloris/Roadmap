(function () {
  function init() {
    try {
      if (typeof window.showLoading === "function") {
        window.showLoading("Loading editor...");
      }

      if (typeof window.setupSearch === "function") {
        window.setupSearch();
      }

      if (typeof window.setupViewportInteractions === "function") {
        window.setupViewportInteractions();
      }

      window.addEventListener("resize", () => {
        if (typeof window.closeMobilePanels === "function") window.closeMobilePanels();
        if (typeof window.closeMobileInspector === "function") window.closeMobileInspector();

        if (typeof window.isCompactEditorLayout === "function" && !window.isCompactEditorLayout()) {
          if (typeof window.closeInspector === "function") window.closeInspector();
        }

        if (window.graphData?.nodes?.length) {
          if (typeof window.fitToGraph === "function") window.fitToGraph();
          if (typeof window.refreshAllUI === "function") window.refreshAllUI();
        }
      });

      window.addEventListener("keydown", (event) => {
        const isMac = navigator.platform.toUpperCase().includes("MAC");
        const mod = isMac ? event.metaKey : event.ctrlKey;

        if (event.key === "Escape") {
          if (window.selectedNodeId || window.selectedEdgeKey) {
            if (typeof window.clearSelection === "function") {
              window.clearSelection();
            }
          } else {
            if (typeof window.closeMobilePanels === "function") window.closeMobilePanels();
            if (typeof window.closeMobileInspector === "function") window.closeMobileInspector();
          }
        }

        if (mod && !event.shiftKey && event.key.toLowerCase() === "z") {
          event.preventDefault();
          if (typeof window.undoAction === "function") {
            window.undoAction();
          }
        }

        if (
          (mod && event.shiftKey && event.key.toLowerCase() === "z") ||
          (mod && event.key.toLowerCase() === "y")
        ) {
          event.preventDefault();
          if (typeof window.redoAction === "function") {
            window.redoAction();
          }
        }
      });

      document.addEventListener("visibilitychange", () => {
        if (document.hidden && typeof window.saveDraftToLocal === "function") {
          window.saveDraftToLocal();
        }
      });

      window.addEventListener("beforeunload", (event) => {
        if (!window.hasUnsavedChanges) return;
        if (typeof window.saveDraftToLocal === "function") {
          window.saveDraftToLocal();
        }
        event.preventDefault();
        event.returnValue = "";
      });

      if (typeof window.restoreMetaFromLocalStorage === "function") {
        window.restoreMetaFromLocalStorage();
      }

      const localDraft =
        typeof window.loadDraftFromLocal === "function"
          ? window.loadDraftFromLocal()
          : null;

      if (localDraft?.data) {
        window.graphData =
          typeof window.normalizeData === "function"
            ? window.normalizeData(localDraft.data)
            : localDraft.data;

        window.selectedNodeId =
          localDraft.selectedNodeId || window.graphData.nodes?.[0]?.id || null;
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

        if (typeof window.applyViewportTransform === "function") {
          window.applyViewportTransform();
        }

        if (typeof window.refreshAllUI === "function") {
          window.refreshAllUI();
        }

        if (typeof window.hideLoading === "function") {
          window.hideLoading();
        }

        if (typeof window.hideErrorPanel === "function") {
          window.hideErrorPanel();
        }

        window.hasUnsavedChanges = true;

        if (typeof window.setSaveBadge === "function") {
          window.setSaveBadge("save-dirty", "Recovered local draft");
        }

        if (typeof window.setStatus === "function" && !(typeof window.isMobileLayout === "function" && window.isMobileLayout())) {
          window.setStatus("Recovered unsaved local draft.");
        }

        if (typeof window.refreshChangeSummary === "function") {
          window.refreshChangeSummary();
        }

        return;
      }

      if (typeof window.reloadGraph === "function") {
        Promise.resolve(window.reloadGraph(true))
          .then(() => {
            if (typeof window.refreshChangeSummary === "function") {
              window.refreshChangeSummary();
            }
          })
          .catch((err) => {
            console.error(err);
            if (typeof window.hideLoading === "function") window.hideLoading();
            if (typeof window.showErrorPanel === "function") {
              window.showErrorPanel(err?.message || "Editor failed to load.");
            }
          });
      } else {
        if (typeof window.hideLoading === "function") {
          window.hideLoading();
        }
        if (typeof window.setStatus === "function") {
          window.setStatus("Editor loaded, but reloadGraph is missing.", true);
        }
      }
    } catch (err) {
      console.error(err);
      if (typeof window.hideLoading === "function") {
        window.hideLoading();
      }
      if (typeof window.showErrorPanel === "function") {
        window.showErrorPanel(err?.message || "Editor init failed.");
      }
      if (typeof window.setStatus === "function") {
        window.setStatus("Editor init failed.", true);
      }
    }
  }

  window.initEditor = init;
  document.addEventListener("DOMContentLoaded", init);
})();
