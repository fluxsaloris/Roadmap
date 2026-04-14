// ===============================
// BASIC UI HELPERS
// ===============================

function showLoading(text = "Loading graph...") {
  const textEl = document.getElementById("loadingText");
  const overlay = document.getElementById("loadingOverlay");
  if (textEl) textEl.textContent = text;
  if (overlay) overlay.style.display = "flex";
}

function hideLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = "none";
}

function setStatus(text, isError = false) {
  const el = document.getElementById("statusLine");
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? "#ff9a9a" : "#a7a7b5";
}

function showErrorPanel(message) {
  const textEl = document.getElementById("errorPanelText");
  const panel = document.getElementById("errorPanel");
  if (textEl) textEl.textContent = message;
  if (panel) panel.classList.add("show");
}

function hideErrorPanel() {
  const panel = document.getElementById("errorPanel");
  if (panel) panel.classList.remove("show");
}

function setSaveBadge(mode, text) {
  const el = document.getElementById("saveStateBadge");
  if (!el) return;
  el.className = `saveBadge ${mode}`;
  el.textContent = text;
}

function formatTimestamp(ts) {
  if (!ts) return "never";

  try {
    return new Date(ts).toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return "unknown";
  }
}

function updateMetaBadges() {
  const remoteEl = document.getElementById("lastRemoteSaveBadge");
  const snapshotEl = document.getElementById("lastSnapshotBadge");

  if (remoteEl) {
    remoteEl.textContent = lastRemoteSaveAt
      ? `GitHub: ${formatTimestamp(lastRemoteSaveAt)}`
      : "GitHub: not saved yet";
  }

  if (snapshotEl) {
    snapshotEl.textContent = lastVersionId
      ? `Snapshot: ${lastVersionId}`
      : "No snapshot yet";
  }
}

function updateStatsBar() {
  const statNodes = document.getElementById("statNodes");
  const statEdges = document.getElementById("statEdges");
  const statSelected = document.getElementById("statSelected");
  const statLocalSave = document.getElementById("statLocalSave");
  const statUndo = document.getElementById("statUndo");
  const statRedo = document.getElementById("statRedo");

  if (statNodes) statNodes.textContent = `${graphData.nodes.length} nodes`;
  if (statEdges) statEdges.textContent = `${graphData.edges.length} links`;

  const selected = getSelectedNode();
  if (statSelected) {
    statSelected.textContent = selected
      ? `Selected: ${selected.label || selected.id}`
      : "No level selected";
  }

  if (statLocalSave) {
    statLocalSave.textContent = `Local draft: ${formatTimestamp(lastLocalSaveAt)}`;
  }

  if (statUndo) statUndo.textContent = `Undo: ${undoStack.length}`;
  if (statRedo) statRedo.textContent = `Redo: ${redoStack.length}`;
}

// ===============================
// ESCAPING
// ===============================

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeJs(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'");
}

// ===============================
// DOM SHORTCUTS
// ===============================

function graphViewport() {
  return document.getElementById("graphViewport");
}

function graphScene() {
  return document.getElementById("graphScene");
}

function graphSvg() {
  return document.getElementById("graphSvg");
}

function graphNodesEl() {
  return document.getElementById("graphNodes");
}

function mobileSearchInput() {
  return document.getElementById("mobileSearchInput");
}

function mobileSearchPanel() {
  return document.getElementById("mobileSearchPanel");
}

function mobileControlsPanel() {
  return document.getElementById("mobileControlsPanel");
}

function mobileInspector() {
  return document.getElementById("mobileInspector");
}

function mobileInspectorOverlay() {
  return document.getElementById("mobileInspectorOverlay");
}

function graphViewportRect() {
  return graphViewport().getBoundingClientRect();
}

// ===============================
// LAYOUT HELPERS
// ===============================

function isMobileLayout() {
  return window.innerWidth <= 700;
}

function isCompactEditorLayout() {
  return window.innerWidth <= 1180 && window.innerWidth > 700;
}

function scenePointFromClient(clientX, clientY) {
  const rect = graphViewportRect();
  return {
    x: (clientX - rect.left - viewportState.x) / viewportState.scale,
    y: (clientY - rect.top - viewportState.y) / viewportState.scale
  };
}

function applyViewportTransform() {
  const scene = graphScene();
  if (!scene) return;

  scene.style.transform =
    `translate(${viewportState.x}px, ${viewportState.y}px) scale(${viewportState.scale})`;
}

function syncSvgSize() {
  const svg = graphSvg();
  if (!svg) return;

  const bounds = getGraphBounds(graphData.nodes);
  const padding = isMobileLayout() ? 240 : 360;

  const minX = bounds.minX - padding;
  const minY = bounds.minY - padding;
  const width = Math.max(1600, (bounds.maxX - bounds.minX) + padding * 2);
  const height = Math.max(1100, (bounds.maxY - bounds.minY) + padding * 2);

  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
}

function fitToGraph() {
  const visibleNodeIds = getVisibleNodeIds();
  const visibleNodes = graphData.nodes.filter((node) => visibleNodeIds.has(node.id));
  const nodesToFit = visibleNodes.length ? visibleNodes : graphData.nodes;
  const bounds = getGraphBounds(nodesToFit);

  const mobile = isMobileLayout();
  const width = Math.max(
    mobile ? 340 : 540,
    bounds.maxX - bounds.minX + (mobile ? 220 : 420)
  );
  const height = Math.max(
    mobile ? 260 : 360,
    bounds.maxY - bounds.minY + (mobile ? 220 : 340)
  );

  const rect = graphViewportRect();
  const fitScale = Math.min(
    mobile ? 0.82 : 1.15,
    Math.max(0.2, Math.min(rect.width / width, rect.height / height))
  );

  viewportState.scale = fitScale;
  viewportState.x = rect.width / 2 - ((bounds.minX + bounds.maxX) / 2) * fitScale;
  viewportState.y = rect.height / 2 - ((bounds.minY + bounds.maxY) / 2) * fitScale;

  applyViewportTransform();

  if (!mobile) {
    setStatus("Fitted graph to view.");
  }
}

function resetView() {
  viewportState = {
    x: isMobileLayout() ? 20 : 80,
    y: isMobileLayout() ? 20 : 80,
    scale: isMobileLayout() ? 0.55 : 1
  };

  applyViewportTransform();

  if (!isMobileLayout()) {
    setStatus("View reset.");
  }
}

function zoomBy(factor, clientX = null, clientY = null) {
  const rect = graphViewportRect();
  const px = clientX ?? (rect.left + rect.width / 2);
  const py = clientY ?? (rect.top + rect.height / 2);

  const before = scenePointFromClient(px, py);

  viewportState.scale = Math.max(
    0.22,
    Math.min(isMobileLayout() ? 1.8 : 2.4, viewportState.scale * factor)
  );

  viewportState.x = px - rect.left - before.x * viewportState.scale;
  viewportState.y = py - rect.top - before.y * viewportState.scale;

  applyViewportTransform();
}

// ===============================
// SEARCH / MOBILE PANELS
// ===============================

function syncSearchInputs(value) {
  const desktop = document.getElementById("searchInput");
  const mobile = mobileSearchInput();

  if (desktop && desktop.value !== value) desktop.value = value;
  if (mobile && mobile.value !== value) mobile.value = value;
}

function setSearch(value) {
  currentSearch = buildSearchString(value);
  syncSearchInputs(value || "");
  refreshGraph();
}

function closeMobilePanels() {
  const searchPanel = mobileSearchPanel();
  const controlsPanel = mobileControlsPanel();

  if (searchPanel) searchPanel.classList.remove("show");
  if (controlsPanel) controlsPanel.classList.remove("show");
}

function toggleMobileSearch() {
  if (!isMobileLayout()) return;

  const panel = mobileSearchPanel();
  if (!panel) return;

  const willShow = !panel.classList.contains("show");
  closeMobilePanels();

  if (willShow) {
    panel.classList.add("show");
    setTimeout(() => {
      const input = mobileSearchInput();
      if (input) input.focus();
    }, 30);
  }
}

function toggleMobileControls() {
  if (!isMobileLayout()) return;

  const panel = mobileControlsPanel();
  if (!panel) return;

  const willShow = !panel.classList.contains("show");
  closeMobilePanels();

  if (willShow) {
    panel.classList.add("show");
  }
}

// ===============================
// INSPECTOR CONTROLS
// ===============================

function openInspector() {
  if (!isCompactEditorLayout()) return;

  const col = document.getElementById("desktopInspector");
  const headerCard = document.getElementById("inspectorHeaderCard");

  if (col) col.classList.add("open");
  if (headerCard) headerCard.style.display = "block";
}

function closeInspector() {
  const col = document.getElementById("desktopInspector");
  const headerCard = document.getElementById("inspectorHeaderCard");

  if (col) col.classList.remove("open");
  if (headerCard) headerCard.style.display = "none";
}

function openMobileInspector() {
  if (!isMobileLayout()) return;

  const inspector = mobileInspector();
  const overlay = mobileInspectorOverlay();

  if (inspector) inspector.classList.add("show");
  if (overlay) overlay.classList.add("show");
}

function closeMobileInspector() {
  const inspector = mobileInspector();
  const overlay = mobileInspectorOverlay();

  if (inspector) inspector.classList.remove("show");
  if (overlay) overlay.classList.remove("show");
}

function toggleMobileInspector() {
  if (!isMobileLayout()) return;

  const inspector = mobileInspector();
  if (!inspector) return;

  if (inspector.classList.contains("show")) {
    closeMobileInspector();
  } else {
    openMobileInspector();
  }
}

// ===============================
// SIDEBAR / LINK LISTS
// ===============================

function updateWaypointList() {
  const container = document.getElementById("waypointList");
  const hint = document.getElementById("selectedEdgeHint");
  const edge = getEdgeByKey(selectedEdgeKey);

  if (!container || !hint) return;

  if (!edge) {
    container.innerHTML = `<div class="changeEmpty">No link selected.</div>`;
    hint.textContent = "Select a link from the outgoing list or click a line.";
    return;
  }

  const fromNode = getNodeById(edge.from);
  const toNode = getNodeById(edge.to);

  hint.textContent =
    `${fromNode?.label || edge.from} → ${toNode?.label || edge.to}` +
    `${edge.label ? ` (${edge.label})` : ""}`;

  const waypoints = normalizeWaypoints(edge.waypoints);

  if (!waypoints.length) {
    container.innerHTML = `<div class="changeEmpty">This link has no bend points yet.</div>`;
    return;
  }

  container.innerHTML = waypoints.map((point, index) => `
    <div class="waypointItem">
      <div class="waypointMeta">
        <div>Bend Point ${index + 1}</div>
        <div class="waypointMetaSmall">X: ${Math.round(point.x)} • Y: ${Math.round(point.y)}</div>
      </div>
      <div class="actionRow" style="margin-top:0;">
        <button onclick="removeWaypointFromSelectedEdge(${index})" class="dangerBtn">Remove</button>
      </div>
    </div>
  `).join("");
}

function renderLinkList(direction, nodeId, targetId) {
  const listEl = document.getElementById(targetId);
  if (!listEl) return;

  if (!nodeId) {
    listEl.innerHTML = "<li>No level selected.</li>";
    return;
  }

  const edges = direction === "outgoing"
    ? graphData.edges.filter((e) => e.from === nodeId)
    : graphData.edges.filter((e) => e.to === nodeId);

  listEl.innerHTML = edges.length
    ? edges.map((edge) => {
        const otherId = direction === "outgoing" ? edge.to : edge.from;
        const other = getNodeById(otherId);
        const key = edgeKeyOf(edge);
        const isSelected = selectedEdgeKey === key;
        const clickAttr = `onclick="selectEdgeByKey('${escapeJs(key)}')"`;

        if (direction === "outgoing" && targetId === "outgoingList") {
          return `
            <li>
              <button ${clickAttr} style="margin-right:6px;${isSelected ? "border-color:rgba(190,26,72,0.5);" : ""}">
                Select
              </button>
              ${escapeHtml(other?.label || otherId)}
              ${edge.label ? ` — ${escapeHtml(edge.label)}` : ""}
              ${Array.isArray(edge.waypoints) && edge.waypoints.length ? ` <span style="color:#a7a7b5;">(${edge.waypoints.length} bend)</span>` : ""}
              <button onclick="deleteEdge('${escapeJs(edge.from)}','${escapeJs(edge.to)}','${escapeJs(edge.label || "")}')" style="margin-left:6px;">Remove</button>
            </li>
          `;
        }

        return `
          <li>
            <button ${clickAttr} style="margin-right:6px;${isSelected ? "border-color:rgba(190,26,72,0.5);" : ""}">
              Select
            </button>
            ${escapeHtml(other?.label || otherId)}
            ${edge.label ? ` — ${escapeHtml(edge.label)}` : ""}
            ${Array.isArray(edge.waypoints) && edge.waypoints.length ? ` <span style="color:#a7a7b5;">(${edge.waypoints.length} bend)</span>` : ""}
          </li>
        `;
      }).join("")
    : `<li>No ${direction} links.</li>`;
}

function updateDesktopSidebar(node) {
  const selectedHint = document.getElementById("selectedHint");
  if (selectedHint) {
    selectedHint.textContent = node
      ? `Editing ${node.label || node.id}`
      : "Click a node in the graph to edit it.";
  }

  const nodeLabel = document.getElementById("nodeLabel");
  const nodeSubtitle = document.getElementById("nodeSubtitle");
  const nodeType = document.getElementById("nodeType");
  const nodeStatus = document.getElementById("nodeStatus");
  const nodeX = document.getElementById("nodeX");
  const nodeY = document.getElementById("nodeY");
  const nodeTags = document.getElementById("nodeTags");
  const nodeDescription = document.getElementById("nodeDescription");
  const nodeNotes = document.getElementById("nodeNotes");

  if (nodeLabel) nodeLabel.value = node?.label || "";
  if (nodeSubtitle) nodeSubtitle.value = node?.subtitle || "";
  if (nodeType) nodeType.value = node?.type || "stable";
  if (nodeStatus) nodeStatus.value = node?.status || "draft";
  if (nodeX) nodeX.value = node ? Math.round(node.x) : "";
  if (nodeY) nodeY.value = node ? Math.round(node.y) : "";
  if (nodeTags) nodeTags.value = node?.tags?.join(", ") || "";
  if (nodeDescription) nodeDescription.value = node?.description || "";
  if (nodeNotes) nodeNotes.value = node?.notes || "";

  const targetSelect = document.getElementById("linkTarget");
  if (targetSelect) {
    const currentTarget = targetSelect.value;

    targetSelect.innerHTML = graphData.nodes
      .filter((n) => !node || n.id !== node.id)
      .map((n) => `<option value="${escapeHtml(n.id)}">${escapeHtml(n.label)}</option>`)
      .join("");

    if ([...targetSelect.options].some((opt) => opt.value === currentTarget)) {
      targetSelect.value = currentTarget;
    }
  }

  renderLinkList("outgoing", node?.id || null, "outgoingList");
  renderLinkList("incoming", node?.id || null, "incomingList");
  updateWaypointList();
}

function updateMobileSidebar(node) {
  const title = document.getElementById("mobileInspectorTitle");
  if (title) {
    title.textContent = node ? (node.label || node.id) : "No level selected";
  }

  const nodeLabel = document.getElementById("mobileNodeLabel");
  const nodeSubtitle = document.getElementById("mobileNodeSubtitle");
  const nodeType = document.getElementById("mobileNodeType");
  const nodeStatus = document.getElementById("mobileNodeStatus");
  const nodeX = document.getElementById("mobileNodeX");
  const nodeY = document.getElementById("mobileNodeY");
  const nodeTags = document.getElementById("mobileNodeTags");
  const nodeDescription = document.getElementById("mobileNodeDescription");
  const nodeNotes = document.getElementById("mobileNodeNotes");

  if (nodeLabel) nodeLabel.value = node?.label || "";
  if (nodeSubtitle) nodeSubtitle.value = node?.subtitle || "";
  if (nodeType) nodeType.value = node?.type || "stable";
  if (nodeStatus) nodeStatus.value = node?.status || "draft";
  if (nodeX) nodeX.value = node ? Math.round(node.x) : "";
  if (nodeY) nodeY.value = node ? Math.round(node.y) : "";
  if (nodeTags) nodeTags.value = node?.tags?.join(", ") || "";
  if (nodeDescription) nodeDescription.value = node?.description || "";
  if (nodeNotes) nodeNotes.value = node?.notes || "";

  const targetSelect = document.getElementById("mobileLinkTarget");
  if (targetSelect) {
    const currentTarget = targetSelect.value;

    targetSelect.innerHTML = graphData.nodes
      .filter((n) => !node || n.id !== node.id)
      .map((n) => `<option value="${escapeHtml(n.id)}">${escapeHtml(n.label)}</option>`)
      .join("");

    if ([...targetSelect.options].some((opt) => opt.value === currentTarget)) {
      targetSelect.value = currentTarget;
    }
  }

  renderLinkList("outgoing", node?.id || null, "mobileOutgoingList");
  renderLinkList("incoming", node?.id || null, "mobileIncomingList");
}

function updateSidebarForSelection() {
  const node = getSelectedNode();
  updateDesktopSidebar(node);
  updateMobileSidebar(node);
}

function refreshAllUI() {
  updateMetaBadges();
  updateStatsBar();
  updateSidebarForSelection();
  refreshGraph();
}
