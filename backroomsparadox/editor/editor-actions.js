(function () {
  function pushUndoState(label = "Edit") {
    window.undoStack.push({
      label,
      data: cloneData(window.graphData),
      selectedNodeId: window.selectedNodeId,
      selectedEdgeKey: window.selectedEdgeKey
    });

    if (window.undoStack.length > MAX_HISTORY) {
      window.undoStack.shift();
    }

    window.redoStack = [];

    if (typeof updateStatsBar === "function") {
      updateStatsBar();
    }
  }

  function restoreState(snapshot, reason) {
    window.graphData = normalizeData(snapshot.data);
    window.selectedNodeId = snapshot.selectedNodeId || null;
    window.selectedEdgeKey = snapshot.selectedEdgeKey || null;

    if (typeof refreshAllUI === "function") {
      refreshAllUI();
    } else if (typeof refreshGraph === "function") {
      refreshGraph();
    }

    if (typeof setStatus === "function") {
      setStatus(reason);
    }
  }

  function undoAction() {
    if (!window.undoStack.length) return;

    window.redoStack.push({
      label: "Redo",
      data: cloneData(window.graphData),
      selectedNodeId: window.selectedNodeId,
      selectedEdgeKey: window.selectedEdgeKey
    });

    const snapshot = window.undoStack.pop();
    restoreState(snapshot, "Undid last action.");

    if (typeof markDirtyNoHistory === "function") {
      markDirtyNoHistory("Undo applied.");
    }
  }

  function redoAction() {
    if (!window.redoStack.length) return;

    window.undoStack.push({
      label: "Undo",
      data: cloneData(window.graphData),
      selectedNodeId: window.selectedNodeId,
      selectedEdgeKey: window.selectedEdgeKey
    });

    const snapshot = window.redoStack.pop();
    restoreState(snapshot, "Redid last action.");

    if (typeof markDirtyNoHistory === "function") {
      markDirtyNoHistory("Redo applied.");
    }
  }

  function edgeExists(from, to, label = "") {
    return (window.graphData?.edges || []).some(
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
    const used = new Set((window.graphData?.nodes || []).map(n => String(n.id || "")));
    return makeUniqueId("level", used);
  }

  function addNode() {
    pushUndoState("Add node");

    const nextId = generateNodeId();
    const rect = graphViewportRect();
    const center = scenePointFromClient(rect.left + rect.width / 2, rect.top + rect.height / 2);

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

    if (typeof refreshAllUI === "function") {
      refreshAllUI();
    } else if (typeof refreshGraph === "function") {
      refreshGraph();
    }

    if (typeof isMobileLayout === "function" && isMobileLayout()) {
      if (typeof openMobileInspector === "function") openMobileInspector();
    } else if (typeof isCompactEditorLayout === "function" && isCompactEditorLayout()) {
      if (typeof openInspector === "function") openInspector();
    }

    if (typeof markDirty === "function") {
      markDirty("Added new node.");
    }
  }

  function getActiveNodeFormValues() {
    if (typeof isMobileLayout === "function" && isMobileLayout()) {
      return {
        label: document.getElementById("mobileNodeLabel")?.value || "",
        subtitle: document.getElementById("mobileNodeSubtitle")?.value || "",
        type: document.getElementById("mobileNodeType")?.value || "stable",
        status: document.getElementById("mobileNodeStatus")?.value || "draft",
        x: document.getElementById("mobileNodeX")?.value || 0,
        y: document.getElementById("mobileNodeY")?.value || 0,
        tags: document.getElementById("mobileNodeTags")?.value || "",
        description: document.getElementById("mobileNodeDescription")?.value || "",
        notes: document.getElementById("mobileNodeNotes")?.value || ""
      };
    }

    return {
      label: document.getElementById("nodeLabel")?.value || "",
      subtitle: document.getElementById("nodeSubtitle")?.value || "",
      type: document.getElementById("nodeType")?.value || "stable",
      status: document.getElementById("nodeStatus")?.value || "draft",
      x: document.getElementById("nodeX")?.value || 0,
      y: document.getElementById("nodeY")?.value || 0,
      tags: document.getElementById("nodeTags")?.value || "",
      description: document.getElementById("nodeDescription")?.value || "",
      notes: document.getElementById("nodeNotes")?.value || ""
    };
  }

  function getActiveLinkFormValues() {
    if (typeof isMobileLayout === "function" && isMobileLayout()) {
      return {
        targetId: document.getElementById("mobileLinkTarget")?.value || "",
        label: document.getElementById("mobileLinkLabel")?.value || "",
        oneWay: (document.getElementById("mobileLinkOneWay")?.value || "yes") === "yes"
      };
    }

    return {
      targetId: document.getElementById("linkTarget")?.value || "",
      label: document.getElementById("linkLabel")?.value || "",
      oneWay: (document.getElementById("linkOneWay")?.value || "yes") === "yes"
    };
  }

  function applySelectedNodeChanges() {
    const node = typeof getSelectedNode === "function" ? getSelectedNode() : null;
    if (!node) return;

    pushUndoState("Update node");

    const values = getActiveNodeFormValues();

    node.label = values.label.trim() || "Unnamed";
    node.subtitle = values.subtitle.trim();
    node.type = typeof normalizeType === "function" ? normalizeType(values.type) : values.type;
    node.status = values.status;
    node.x = Number(values.x || 0);
    node.y = Number(values.y || 0);
    node.tags = String(values.tags || "").split(",").map(v => v.trim()).filter(Boolean);
    node.description = values.description;
    node.notes = values.notes;

    if (typeof refreshAllUI === "function") {
      refreshAllUI();
    } else if (typeof refreshGraph === "function") {
      refreshGraph();
    }

    if (typeof markDirty === "function") {
      markDirty("Node updated.");
    }
  }

  function deleteSelectedNode() {
    const node = typeof getSelectedNode === "function" ? getSelectedNode() : null;
    if (!node) return;

    const confirmed = confirm(`Delete ${node.label}?`);
    if (!confirmed) return;

    pushUndoState("Delete node");

    window.graphData.nodes = window.graphData.nodes.filter(n => n.id !== node.id);
    window.graphData.edges = window.graphData.edges.filter(e => e.from !== node.id && e.to !== node.id);

    window.selectedNodeId = null;
    window.selectedEdgeKey = null;

    if (typeof refreshAllUI === "function") {
      refreshAllUI();
    } else if (typeof refreshGraph === "function") {
      refreshGraph();
    }

    if (typeof closeMobileInspector === "function") closeMobileInspector();
    if (typeof markDirty === "function") markDirty("Deleted node.");
  }

  function addConnectionFromSidebar() {
    const node = typeof getSelectedNode === "function" ? getSelectedNode() : null;
    if (!node) return;

    const values = getActiveLinkFormValues();
    if (!values.targetId) return;

    pushUndoState("Add link");
    addEdge(node.id, values.targetId, values.label.trim(), values.oneWay);

    if (typeof refreshAllUI === "function") {
      refreshAllUI();
    } else if (typeof refreshGraph === "function") {
      refreshGraph();
    }

    if (typeof markDirty === "function") {
      markDirty("Added link.");
    }
  }

  function deleteEdge(from, to, label) {
    pushUndoState("Delete link");

    window.graphData.edges = window.graphData.edges.filter(
      e => !(e.from === from && e.to === to && (e.label || "") === (label || ""))
    );

    if (window.selectedEdgeKey) {
      const exists = window.graphData.edges.some(e => edgeKeyOf(e) === window.selectedEdgeKey);
      if (!exists) window.selectedEdgeKey = null;
    }

    if (typeof refreshAllUI === "function") {
      refreshAllUI();
    } else if (typeof refreshGraph === "function") {
      refreshGraph();
    }

    if (typeof markDirty === "function") {
      markDirty("Deleted link.");
    }
  }

  function selectEdgeByKey(key) {
    const edge = typeof getEdgeByKey === "function" ? getEdgeByKey(key) : null;
    window.selectedEdgeKey = edge ? key : null;

    if (typeof refreshAllUI === "function") {
      refreshAllUI();
    } else if (typeof refreshGraph === "function") {
      refreshGraph();
    }
  }

  function addWaypointToSelectedEdge() {
    const edge = typeof getEdgeByKey === "function" ? getEdgeByKey(window.selectedEdgeKey) : null;
    if (!edge) return;

    pushUndoState("Add bend point");

    const pts = typeof buildEdgePoints === "function" ? buildEdgePoints(edge) : null;
    const mid = typeof getEdgeMidpoint === "function" ? getEdgeMidpoint(pts) : { x: 0, y: 0 };

    edge.waypoints = typeof normalizeWaypoints === "function"
      ? normalizeWaypoints(edge.waypoints)
      : [];

    edge.waypoints.push({
      x: Math.round(mid.x),
      y: Math.round(mid.y)
    });

    if (typeof refreshAllUI === "function") {
      refreshAllUI();
    } else if (typeof refreshGraph === "function") {
      refreshGraph();
    }

    if (typeof markDirty === "function") {
      markDirty("Added bend point.");
    }
  }

  function removeWaypointFromSelectedEdge(index) {
    const edge = typeof getEdgeByKey === "function" ? getEdgeByKey(window.selectedEdgeKey) : null;
    if (!edge) return;
    if (!Array.isArray(edge.waypoints) || !edge.waypoints[index]) return;

    pushUndoState("Remove bend point");
    edge.waypoints.splice(index, 1);

    if (typeof refreshAllUI === "function") {
      refreshAllUI();
    } else if (typeof refreshGraph === "function") {
      refreshGraph();
    }

    if (typeof markDirty === "function") {
      markDirty("Removed bend point.");
    }
  }

  function clearWaypointsFromSelectedEdge() {
    const edge = typeof getEdgeByKey === "function" ? getEdgeByKey(window.selectedEdgeKey) : null;
    if (!edge) return;

    pushUndoState("Clear bend points");
    edge.waypoints = [];

    if (typeof refreshAllUI === "function") {
      refreshAllUI();
    } else if (typeof refreshGraph === "function") {
      refreshGraph();
    }

    if (typeof markDirty === "function") {
      markDirty("Cleared bend points.");
    }
  }

  function autoLayout() {
    if (!window.graphData?.nodes?.length) return;

    pushUndoState("Auto layout");

    const nodeMap = new Map(window.graphData.nodes.map(n => [n.id, n]));
    const incomingCount = new Map(window.graphData.nodes.map(n => [n.id, 0]));
    const outgoingMap = new Map(window.graphData.nodes.map(n => [n.id, []]));

    for (const edge of window.graphData.edges) {
      if (incomingCount.has(edge.to)) {
        incomingCount.set(edge.to, incomingCount.get(edge.to) + 1);
      }
      if (outgoingMap.has(edge.from)) {
        outgoingMap.get(edge.from).push(edge.to);
      }
    }

    const roots = window.graphData.nodes.filter(n => (incomingCount.get(n.id) || 0) === 0);
    const startNodes = roots.length ? roots : [window.graphData.nodes[0]];
    const levels = [];
    const placed = new Set();
    let frontier = startNodes.map(n => n.id);

    let depth = 0;
    while (frontier.length && depth < 24) {
      levels[depth] = [...new Set(frontier)].filter(id => !placed.has(id));
      levels[depth].forEach(id => placed.add(id));

      const next = [];
      for (const id of levels[depth]) {
        for (const child of outgoingMap.get(id) || []) {
          if (!placed.has(child)) next.push(child);
        }
      }

      frontier = next;
      depth++;
    }

    const unplaced = window.graphData.nodes.map(n => n.id).filter(id => !placed.has(id));
    if (unplaced.length) levels.push(unplaced);

    const spacingX = typeof isMobileLayout === "function" && isMobileLayout() ? 200 : 280;
    const spacingY = typeof isMobileLayout === "function" && isMobileLayout() ? 150 : 190;
    const startX = 180;
    const startY = 160;

    levels.forEach((row, rowIndex) => {
      row.forEach((id, colIndex) => {
        const node = nodeMap.get(id);
        if (!node) return;
        node.x = startX + colIndex * spacingX;
        node.y = startY + rowIndex * spacingY;
      });
    });

    for (const edge of window.graphData.edges) {
      edge.waypoints = [];
    }

    if (typeof refreshAllUI === "function") {
      refreshAllUI();
    } else if (typeof refreshGraph === "function") {
      refreshGraph();
    }

    if (typeof fitToGraph === "function") fitToGraph();
    if (typeof markDirty === "function") markDirty("Auto layout applied.");
  }

  async function saveGraph(isAuto = false) {
    try {
      if (window.isSavingToGitHub) return;

      const now = Date.now();
      if (now < window.saveCooldownUntil && !isAuto) {
        if (typeof setStatus === "function") {
          setStatus(`Please wait ${Math.ceil((window.saveCooldownUntil - now) / 1000)}s before saving again.`, true);
        }
        return;
      }

      if (!window.__EDITOR_SECURITY__?.hostOk) {
        throw new Error("Blocked from saving on this host.");
      }

      window.isSavingToGitHub = true;

      if (typeof setSaveBadge === "function") {
        setSaveBadge("save-saving", isAuto ? "Auto-saving..." : "Saving to GitHub...");
      }

      if (typeof setStatus === "function" && !(typeof isMobileLayout === "function" && isMobileLayout())) {
        setStatus(isAuto ? "Auto-saving graph..." : "Saving graph...");
      }

      const payload = getSerializableGraphData();

      if (typeof refreshAllUI === "function") {
        refreshAllUI();
      }

      const res = await fetch(SAVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: PROJECT,
          data: payload
        })
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.error || "Save failed");
      }

      window.hasUnsavedChanges = false;
      window.lastRemoteSaveAt = json?.savedAt ? (Date.parse(json.savedAt) || Date.now()) : Date.now();
      window.lastVersionId = json?.version || null;
      window.lastSnapshotPath = json?.snapshotPath || null;
      window.saveCooldownUntil = Date.now() + SAVE_COOLDOWN_MS;

      if (typeof persistMetaToLocalStorage === "function") persistMetaToLocalStorage();
      if (typeof updateMetaBadges === "function") updateMetaBadges();

      if (typeof setSaveBadge === "function") {
        setSaveBadge("save-clean", "Saved to GitHub");
      }

      if (typeof setStatus === "function" && !(typeof isMobileLayout === "function" && isMobileLayout())) {
        setStatus(window.lastVersionId ? `Saved. Snapshot ${window.lastVersionId} created.` : "Saved to GitHub.");
      }

      if (typeof saveDraftToLocal === "function") saveDraftToLocal();

      window.historyIndexCache = null;
      window.snapshotCache = new Map();

      if (typeof scheduleDiffRefresh === "function") scheduleDiffRefresh();
    } catch (err) {
      console.error(err);

      if (typeof setSaveBadge === "function") {
        setSaveBadge("save-error", "GitHub save failed");
      }

      if (typeof setStatus === "function" && !(typeof isMobileLayout === "function" && isMobileLayout())) {
        setStatus("Save failed.", true);
      }

      if (typeof showErrorPanel === "function") {
        showErrorPanel(err.message || "Save failed.");
      }
    } finally {
      window.isSavingToGitHub = false;
    }
  }

  function discardLocalDraft() {
    const ok = confirm("Discard your local draft and reload from GitHub?");
    if (!ok) return;

    if (typeof clearLocalDraft === "function") clearLocalDraft();
    window.hasUnsavedChanges = false;

    if (typeof reloadGraph === "function") {
      reloadGraph(true);
    }
  }

  async function previewLatestSnapshot() {
    try {
      const url = `${SAVE_URL}?project=${encodeURIComponent(PROJECT)}&action=latestSnapshot`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      if (typeof showErrorPanel === "function") {
        showErrorPanel("Could not open latest snapshot preview.");
      }
    }
  }

  window.pushUndoState = pushUndoState;
  window.restoreState = restoreState;
  window.undoAction = undoAction;
  window.redoAction = redoAction;
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
  window.autoLayout = autoLayout;
  window.saveGraph = saveGraph;
  window.discardLocalDraft = discardLocalDraft;
  window.previewLatestSnapshot = previewLatestSnapshot;
})();
