function setupSearch() {
  const desktopSearch = document.getElementById("searchInput");
  const mobileSearch = mobileSearchInput();

  if (desktopSearch) {
    desktopSearch.addEventListener("input", (event) => {
      setSearch(event.target.value || "");
    });
  }

  if (mobileSearch) {
    mobileSearch.addEventListener("input", (event) => {
      setSearch(event.target.value || "");
    });
  }
}

function setupViewportInteractions() {
  const viewport = graphViewport();

  if (!viewport) return;

  viewport.addEventListener("wheel", (event) => {
    if (isMobileLayout()) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    zoomBy(factor, event.clientX, event.clientY);
  }, { passive: false });

  viewport.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".node")) return;
    if (event.target.closest(".waypoint")) return;

    startPan(event.clientX, event.clientY);

    try {
      viewport.setPointerCapture(event.pointerId);
    } catch (_) {}
  });

  viewport.addEventListener("pointermove", (event) => {
    if (waypointDrag.active) {
      const edge = getEdgeByKey(waypointDrag.edgeKey);
      if (edge && edge.waypoints && edge.waypoints[waypointDrag.index]) {
        const pt = scenePointFromClient(event.clientX, event.clientY);
        edge.waypoints[waypointDrag.index].x = Math.round(pt.x);
        edge.waypoints[waypointDrag.index].y = Math.round(pt.y);
        refreshAllUI();
      }
      return;
    }

    if (interaction.dragNodeId) {
      const node = getNodeById(interaction.dragNodeId);
      if (!node) return;

      const dx = (event.clientX - interaction.dragStartMouseX) / viewportState.scale;
      const dy = (event.clientY - interaction.dragStartMouseY) / viewportState.scale;

      node.x = Math.round(interaction.dragStartNodeX + dx);
      node.y = Math.round(interaction.dragStartNodeY + dy);

      interaction.movedDuringPointer = true;
      refreshAllUI();
      return;
    }

    if (interaction.isPanning) {
      movePan(event.clientX, event.clientY);
      return;
    }

    if (interaction.connectFromNodeId) {
      const pt = scenePointFromClient(event.clientX, event.clientY);
      interaction.connectMouseSceneX = pt.x;
      interaction.connectMouseSceneY = pt.y;
      refreshGraph();
    }
  });

  viewport.addEventListener("pointerup", (event) => {
    const targetNodeEl = event.target.closest(".node");
    const targetNodeId = targetNodeEl?.dataset?.nodeId || null;

    if (waypointDrag.active) {
      waypointDrag.active = false;
      markDirty("Moved bend point.");
      scheduleAutosave();
      return;
    }

    if (interaction.dragNodeId) {
      if (interaction.movedDuringPointer) {
        markDirtyNoHistory("Moved node.");
        scheduleAutosave();
      }
      interaction.dragNodeId = null;
    }

    if (interaction.isPanning) {
      endPan();
    }

    if (interaction.connectFromNodeId) {
      const fromId = interaction.connectFromNodeId;
      interaction.connectFromNodeId = null;

      if (targetNodeId && targetNodeId !== fromId) {
        pushUndoState("Connect nodes");
        addEdge(fromId, targetNodeId, "", true);
        selectedNodeId = fromId;
        refreshAllUI();
        markDirty("Added link by dragging.");
      } else {
        refreshGraph();
      }
    }
  });

  viewport.addEventListener("pointercancel", () => {
    waypointDrag.active = false;
    interaction.dragNodeId = null;
    interaction.connectFromNodeId = null;
    endPan();
    refreshGraph();
  });

  viewport.addEventListener("click", (event) => {
    if (
      !event.target.closest(".node") &&
      !event.target.closest(".mobilePanel") &&
      !event.target.closest(".mobileFab") &&
      !event.target.closest(".mobileInspector") &&
      !event.target.closest("path[data-edge-key]") &&
      !event.target.closest(".waypoint")
    ) {
      closeMobilePanels();
      clearSelection();
    }
  });
}

function setupGlobalShortcuts() {
  window.addEventListener("keydown", (event) => {
    const isMac = navigator.platform.toUpperCase().includes("MAC");
    const mod = isMac ? event.metaKey : event.ctrlKey;

    if (event.key === "Escape") {
      if (selectedNodeId || selectedEdgeKey) {
        clearSelection();
      } else {
        closeMobilePanels();
        closeMobileInspector();
      }
    }

    if (mod && !event.shiftKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoAction();
    }

    if (
      (mod && event.shiftKey && event.key.toLowerCase() === "z") ||
      (mod && event.key.toLowerCase() === "y")
    ) {
      event.preventDefault();
      redoAction();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveDraftToLocal();
  });

  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedChanges) return;
    saveDraftToLocal();
    event.preventDefault();
    event.returnValue = "";
  });
}

function setupResizeHandling() {
  window.addEventListener("resize", () => {
    closeMobilePanels();
    closeMobileInspector();

    if (!isCompactEditorLayout()) {
      closeInspector();
    }

    if (graphData.nodes.length) {
      fitToGraph();
      refreshAllUI();
    }
  });
}

function hydrateFromLocalDraft() {
  const localDraft = loadDraftFromLocal();
  if (!localDraft?.data) return false;

  graphData = normalizeData(localDraft.data);
  selectedNodeId = localDraft.selectedNodeId || graphData.nodes[0]?.id || null;
  selectedEdgeKey = localDraft.selectedEdgeKey || null;
  lastLocalSaveAt = localDraft.savedAt || null;

  if (localDraft.viewportState) {
    viewportState = {
      x: typeof localDraft.viewportState.x === "number" ? localDraft.viewportState.x : 0,
      y: typeof localDraft.viewportState.y === "number" ? localDraft.viewportState.y : 0,
      scale: typeof localDraft.viewportState.scale === "number"
        ? localDraft.viewportState.scale
        : (isMobileLayout() ? 0.55 : 1)
    };
  }

  applyViewportTransform();
  refreshAllUI();
  hideLoading();
  hideErrorPanel();

  hasUnsavedChanges = true;
  setSaveBadge("save-dirty", "Recovered local draft");

  if (!isMobileLayout()) {
    setStatus("Recovered unsaved local draft.");
  }

  scheduleDiffRefresh();
  return true;
}

async function initEditor() {
  try {
    restoreMetaFromLocalStorage();
    setupSearch();
    setupViewportInteractions();
    setupGlobalShortcuts();
    setupResizeHandling();

    if (hydrateFromLocalDraft()) return;

    await reloadGraph(true);
  } catch (error) {
    console.error(error);
    hideLoading();
    showErrorPanel(error?.message || "Failed to initialize editor.");
    setStatus("Editor failed to initialize.", true);
  }
}

window.zoomBy = zoomBy;
window.resetView = resetView;
window.fitToGraph = fitToGraph;
window.autoLayout = autoLayout;
window.undoAction = undoAction;
window.redoAction = redoAction;
window.addNode = addNode;
window.applySelectedNodeChanges = applySelectedNodeChanges;
window.deleteSelectedNode = deleteSelectedNode;
window.addConnectionFromSidebar = addConnectionFromSidebar;
window.deleteEdge = deleteEdge;
window.selectEdgeByKey = selectEdgeByKey;
window.addWaypointToSelectedEdge = addWaypointToSelectedEdge;
window.removeWaypointFromSelectedEdge = removeWaypointFromSelectedEdge;
window.clearWaypointsFromSelectedEdge = clearWaypointsFromSelectedEdge;
window.saveGraph = saveGraph;
window.discardLocalDraft = discardLocalDraft;
window.refreshChangeSummary = refreshChangeSummary;
window.copyChangeSummary = copyChangeSummary;
window.copyDiscordLog = copyDiscordLog;
window.toggleMobileSearch = toggleMobileSearch;
window.toggleMobileControls = toggleMobileControls;
window.toggleMobileInspector = toggleMobileInspector;
window.closeMobileInspector = closeMobileInspector;
window.openInspector = openInspector;
window.closeInspector = closeInspector;
window.clearSelection = clearSelection;

document.addEventListener("DOMContentLoaded", initEditor);
