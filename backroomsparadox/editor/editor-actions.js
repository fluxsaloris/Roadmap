// ===============================
// UNDO / REDO
// ===============================

function pushUndoState(label = "Edit") {
  undoStack.push({
    label,
    data: cloneData(graphData),
    selectedNodeId,
    selectedEdgeKey
  });

  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }

  redoStack = [];
  updateStatsBar();
}

function restoreState(snapshot, reason) {
  graphData = normalizeData(snapshot.data);
  selectedNodeId = snapshot.selectedNodeId || null;
  selectedEdgeKey = snapshot.selectedEdgeKey || null;

  refreshAllUI();
  setStatus(reason);
}

function undoAction() {
  if (!undoStack.length) return;

  redoStack.push({
    label: "Redo",
    data: cloneData(graphData),
    selectedNodeId,
    selectedEdgeKey
  });

  const snapshot = undoStack.pop();
  restoreState(snapshot, "Undid last action.");
  markDirtyNoHistory("Undo applied.");
}

function redoAction() {
  if (!redoStack.length) return;

  undoStack.push({
    label: "Undo",
    data: cloneData(graphData),
    selectedNodeId,
    selectedEdgeKey
  });

  const snapshot = redoStack.pop();
  restoreState(snapshot, "Redid last action.");
  markDirtyNoHistory("Redo applied.");
}

// ===============================
// DIRTY STATE
// ===============================

function markDirty(reason = "Unsaved changes") {
  hasUnsavedChanges = true;
  setSaveBadge("save-dirty", "Unsaved changes");

  if (!isMobileLayout()) {
    setStatus(reason);
  }

  saveDraftToLocal();
  scheduleDiffRefresh();
  updateStatsBar();
}

function markDirtyNoHistory(reason = "Unsaved changes") {
  hasUnsavedChanges = true;
  setSaveBadge("save-dirty", "Unsaved changes");

  if (!isMobileLayout()) {
    setStatus(reason);
  }

  saveDraftToLocal();
  scheduleDiffRefresh();
  updateStatsBar();
}

function markClean(message = "All changes saved locally") {
  hasUnsavedChanges = false;
  setSaveBadge("save-clean", message);

  if (!isMobileLayout()) {
    setStatus(message);
  }

  updateStatsBar();
  scheduleDiffRefresh();
}

// ===============================
// NODE ACTIONS
// ===============================

function generateNodeId() {
  const used = new Set(graphData.nodes.map((n) => String(n.id || "")));
  return makeUniqueId("level", used);
}

function addNode() {
  pushUndoState("Add node");

  const nextId = generateNodeId();
  const rect = graphViewportRect();
  const center = scenePointFromClient(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2
  );

  graphData.nodes.push({
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

  selectedNodeId = nextId;
  selectedEdgeKey = null;

  refreshAllUI();

  if (isMobileLayout()) {
    openMobileInspector();
  } else if (isCompactEditorLayout()) {
    openInspector();
  }

  markDirty("Added new node.");
}

function applySelectedNodeChanges() {
  const node = getSelectedNode();
  if (!node) return;

  pushUndoState("Update node");

  const values = getActiveNodeFormValues();

  node.label = values.label.trim() || "Unnamed";
  node.subtitle = values.subtitle.trim();
  node.type = normalizeType(values.type);
  node.status = values.status;
  node.x = Number(values.x || 0);
  node.y = Number(values.y || 0);
  node.tags = values.tags.split(",").map(v => v.trim()).filter(Boolean);
  node.description = values.description;
  node.notes = values.notes;

  refreshAllUI();
  markDirty("Node updated.");
}

function deleteSelectedNode() {
  const node = getSelectedNode();
  if (!node) return;

  const confirmed = confirm(`Delete ${node.label}?`);
  if (!confirmed) return;

  pushUndoState("Delete node");

  graphData.nodes = graphData.nodes.filter((n) => n.id !== node.id);
  graphData.edges = graphData.edges.filter(
    (e) => e.from !== node.id && e.to !== node.id
  );

  selectedNodeId = null;
  selectedEdgeKey = null;

  refreshAllUI();
  closeMobileInspector();

  markDirty("Deleted node.");
}

// ===============================
// EDGE ACTIONS
// ===============================

function edgeExists(from, to, label = "") {
  return graphData.edges.some(
    (e) =>
      e.from === from &&
      e.to === to &&
      (e.label || "") === (label || "")
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

  graphData.edges.push(edge);

  if (!oneWay && !edgeExists(to, from, label)) {
    graphData.edges.push({
      from: to,
      to: from,
      label: label || "",
      oneWay: !!oneWay,
      waypoints: []
    });
  }
}

function addConnectionFromSidebar() {
  const node = getSelectedNode();
  if (!node) return;

  const values = getActiveLinkFormValues();
  if (!values.targetId) return;

  pushUndoState("Add link");

  addEdge(
    node.id,
    values.targetId,
    values.label.trim(),
    values.oneWay
  );

  refreshAllUI();
  markDirty("Added link.");
}

function deleteEdge(from, to, label) {
  pushUndoState("Delete link");

  graphData.edges = graphData.edges.filter(
    (e) =>
      !(
        e.from === from &&
        e.to === to &&
        (e.label || "") === (label || "")
      )
  );

  if (selectedEdgeKey) {
    const exists = graphData.edges.some(
      (e) => edgeKeyOf(e) === selectedEdgeKey
    );
    if (!exists) selectedEdgeKey = null;
  }

  refreshAllUI();
  markDirty("Deleted link.");
}

// ===============================
// WAYPOINTS
// ===============================

function addWaypointToSelectedEdge() {
  const edge = getEdgeByKey(selectedEdgeKey);
  if (!edge) return;

  pushUndoState("Add bend point");

  const pts = buildEdgePoints(edge);
  const mid = getEdgeMidpoint(pts);

  edge.waypoints = normalizeWaypoints(edge.waypoints);
  edge.waypoints.push({
    x: Math.round(mid.x),
    y: Math.round(mid.y)
  });

  refreshAllUI();
  markDirty("Added bend point.");
}

function removeWaypointFromSelectedEdge(index) {
  const edge = getEdgeByKey(selectedEdgeKey);
  if (!edge) return;

  if (!Array.isArray(edge.waypoints) || !edge.waypoints[index]) return;

  pushUndoState("Remove bend point");

  edge.waypoints.splice(index, 1);

  refreshAllUI();
  markDirty("Removed bend point.");
}

function clearWaypointsFromSelectedEdge() {
  const edge = getEdgeByKey(selectedEdgeKey);
  if (!edge) return;

  pushUndoState("Clear bend points");

  edge.waypoints = [];

  refreshAllUI();
  markDirty("Cleared bend points.");
}

// ===============================
// AUTO LAYOUT
// ===============================

function autoLayout() {
  if (!graphData.nodes.length) return;

  pushUndoState("Auto layout");

  const nodeMap = new Map(graphData.nodes.map((n) => [n.id, n]));
  const incomingCount = new Map(graphData.nodes.map((n) => [n.id, 0]));
  const outgoingMap = new Map(graphData.nodes.map((n) => [n.id, []]));

  for (const edge of graphData.edges) {
    if (incomingCount.has(edge.to)) {
      incomingCount.set(edge.to, incomingCount.get(edge.to) + 1);
    }
    if (outgoingMap.has(edge.from)) {
      outgoingMap.get(edge.from).push(edge.to);
    }
  }

  const roots = graphData.nodes.filter(
    (n) => (incomingCount.get(n.id) || 0) === 0
  );

  const startNodes = roots.length ? roots : [graphData.nodes[0]];
  const levels = [];
  const placed = new Set();

  let frontier = startNodes.map((n) => n.id);
  let depth = 0;

  while (frontier.length && depth < 24) {
    levels[depth] = [...new Set(frontier)].filter(
      (id) => !placed.has(id)
    );

    levels[depth].forEach((id) => placed.add(id));

    const next = [];
    for (const id of levels[depth]) {
      for (const child of outgoingMap.get(id) || []) {
        if (!placed.has(child)) next.push(child);
      }
    }

    frontier = next;
    depth++;
  }

  const unplaced = graphData.nodes
    .map((n) => n.id)
    .filter((id) => !placed.has(id));

  if (unplaced.length) levels.push(unplaced);

  const spacingX = isMobileLayout() ? 200 : 280;
  const spacingY = isMobileLayout() ? 150 : 190;

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

  graphData.edges.forEach((edge) => {
    edge.waypoints = [];
  });

  refreshAllUI();
  fitToGraph();
  markDirty("Auto layout applied.");
}
