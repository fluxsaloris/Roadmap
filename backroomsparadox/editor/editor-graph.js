// ===============================
// GRAPH GEOMETRY
// ===============================

function getNodePortPosition(nodeId, side) {
  const node = getNodeById(nodeId);
  if (!node) return null;

  const width = isMobileLayout() ? 118 : 170;

  return {
    x: node.x + (side === "output" ? width / 2 : -width / 2),
    y: node.y
  };
}

function buildEdgePoints(edge) {
  const fromPort = getNodePortPosition(edge.from, "output");
  const toPort = getNodePortPosition(edge.to, "input");

  if (!fromPort || !toPort) return null;

  return [fromPort, ...normalizeWaypoints(edge.waypoints), toPort];
}

function createSegmentPath(points) {
  if (!points || points.length < 2) return "";

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = Math.abs(b.x - a.x);
    const curve = Math.max(30, Math.min(120, dx * 0.35));

    path += ` C ${a.x + curve} ${a.y}, ${b.x - curve} ${b.y}, ${b.x} ${b.y}`;
  }

  return path;
}

function createEdgePath(points) {
  return createSegmentPath(points);
}

function getEdgeMidpoint(points) {
  if (!points || points.length < 2) {
    return { x: 0, y: 0 };
  }

  let total = 0;
  const lengths = [];

  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.hypot(dx, dy);
    lengths.push(len);
    total += len;
  }

  let target = total / 2;

  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i]) {
      const ratio = lengths[i] === 0 ? 0 : target / lengths[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * ratio,
        y: points[i].y + (points[i + 1].y - points[i].y) * ratio
      };
    }

    target -= lengths[i];
  }

  return points[Math.floor(points.length / 2)];
}

function getEdgeTypeClass(edge) {
  const fromNode = getNodeById(edge.from);
  return getTypeEdgeClass(fromNode?.type || "stable");
}

// ===============================
// SEARCH HELPERS
// ===============================

function nodeMatchesSearch(node, search) {
  if (!search) return true;

  const hay = [
    node.id,
    node.label,
    node.subtitle,
    node.description,
    node.notes,
    getTypeLabel(node.type),
    ...(Array.isArray(node.tags) ? node.tags : [])
  ].join(" ").toLowerCase();

  return hay.includes(search);
}

function getVisibleNodeIds() {
  const search = currentSearch.trim().toLowerCase();

  if (!search) {
    return new Set(graphData.nodes.map((n) => n.id));
  }

  return new Set(
    graphData.nodes
      .filter((n) => nodeMatchesSearch(n, search))
      .map((n) => n.id)
  );
}

function buildSearchString(value) {
  return String(value || "").trim().toLowerCase();
}

// ===============================
// SELECTION HELPERS
// ===============================

function clearSelection() {
  selectedNodeId = null;
  selectedEdgeKey = null;
  refreshAllUI();
  closeMobileInspector();

  if (!isMobileLayout()) {
    setStatus("Selection cleared.");
  }
}

function selectNode(nodeId) {
  const node = getNodeById(nodeId);
  if (!node) return;

  selectedNodeId = node.id;
  selectedEdgeKey = null;
  refreshAllUI();

  if (isMobileLayout()) {
    openMobileInspector();
  } else if (isCompactEditorLayout()) {
    openInspector();
  }
}

function selectEdgeByKey(key) {
  const edge = getEdgeByKey(key);
  selectedEdgeKey = edge ? key : null;
  refreshAllUI();
}

// ===============================
// GRAPH RENDER
// ===============================

function refreshGraph() {
  syncSvgSize();

  const visibleNodeIds = getVisibleNodeIds();

  graphNodesEl().innerHTML = graphData.nodes
    .filter((node) => visibleNodeIds.has(node.id))
    .map((node) => {
      const isSelected = node.id === selectedNodeId;
      const typeClass = normalizeType(node.type);

      return `
        <div
          class="node ${escapeHtml(typeClass)} ${isSelected ? "selected" : ""}"
          data-node-id="${escapeHtml(node.id)}"
          style="left:${node.x}px; top:${node.y}px;"
        >
          <div class="nodeHeader">
            <div class="nodeDot"></div>
            <div class="nodeTitle">${escapeHtml(node.label)}</div>
          </div>
          ${node.subtitle ? `<div class="nodeSubtitle">${escapeHtml(node.subtitle)}</div>` : ""}
          <div class="nodeStatusRow">
            <span class="nodeBadge">${escapeHtml(getTypeLabel(node.type))}</span>
            <span class="nodeBadge">${escapeHtml(node.status || "draft")}</span>
          </div>
          <div class="nodePorts">
            <div class="port input"></div>
            <div class="port output"></div>
          </div>
        </div>
      `;
    }).join("");

  const svgParts = [];

  const visibleEdges = graphData.edges.filter(
    (edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)
  );

  for (const edge of visibleEdges) {
    const points = buildEdgePoints(edge);
    if (!points) continue;

    const path = createEdgePath(points);
    if (!path) continue;

    const edgeClass = getEdgeTypeClass(edge);
    const isSelected = selectedEdgeKey === edgeKeyOf(edge);
    const isRelatedToSelectedNode =
      selectedNodeId && (edge.from === selectedNodeId || edge.to === selectedNodeId);

    let lineClass = "line-base";
    if (isSelected || isRelatedToSelectedNode) {
      lineClass = "line-selected";
    } else if (selectedNodeId) {
      lineClass = "line-dimmed";
    }

    svgParts.push(`
      <path
        d="${path}"
        class="${lineClass} ${edgeClass}"
        data-edge-key="${escapeHtml(edgeKeyOf(edge))}"
      ></path>
    `);

    if (edge.label) {
      const mid = getEdgeMidpoint(points);
      svgParts.push(`
        <text
          x="${mid.x}"
          y="${mid.y - (isMobileLayout() ? 8 : 10)}"
          text-anchor="middle"
          class="edgeLabel"
        >
          ${escapeHtml(edge.label)}
        </text>
      `);
    }

    if (Array.isArray(edge.waypoints)) {
      edge.waypoints.forEach((point, index) => {
        svgParts.push(`
          <circle
            cx="${point.x}"
            cy="${point.y}"
            r="${isMobileLayout() ? 5 : 6}"
            class="waypoint ${isSelected ? "selected" : ""}"
            data-edge-key="${escapeHtml(edgeKeyOf(edge))}"
            data-waypoint-index="${index}"
          ></circle>
        `);
      });
    }
  }

  if (interaction.connectFromNodeId) {
    const fromPort = getNodePortPosition(interaction.connectFromNodeId, "output");
    if (fromPort) {
      const previewPath = createEdgePath([
        fromPort,
        { x: interaction.connectMouseSceneX, y: interaction.connectMouseSceneY }
      ]);

      svgParts.push(`<path d="${previewPath}" class="line-preview"></path>`);
    }
  }

  graphSvg().innerHTML = svgParts.join("");

  bindNodeEvents();
  bindSvgEvents();
  updateStatsBar();
  updateSidebarForSelection();
}

// ===============================
// NODE / SVG BINDING
// ===============================

function bindNodeEvents() {
  graphNodesEl().querySelectorAll(".node").forEach((nodeEl) => {
    const nodeId = nodeEl.dataset.nodeId;

    nodeEl.addEventListener("pointerdown", (event) => {
      event.stopPropagation();

      if (event.shiftKey) {
        interaction.connectFromNodeId = nodeId;
        const pt = scenePointFromClient(event.clientX, event.clientY);
        interaction.connectMouseSceneX = pt.x;
        interaction.connectMouseSceneY = pt.y;
        refreshGraph();
        return;
      }

      interaction.dragNodeId = nodeId;
      interaction.dragStartMouseX = event.clientX;
      interaction.dragStartMouseY = event.clientY;

      const node = getNodeById(nodeId);
      if (!node) return;

      interaction.dragStartNodeX = node.x;
      interaction.dragStartNodeY = node.y;
      interaction.movedDuringPointer = false;

      selectedNodeId = nodeId;
      selectedEdgeKey = null;
      refreshAllUI();

      if (isMobileLayout()) {
        openMobileInspector();
      } else if (isCompactEditorLayout()) {
        openInspector();
      }

      nodeEl.classList.add("dragging");

      try {
        nodeEl.setPointerCapture(event.pointerId);
      } catch (_) {}
    });

    nodeEl.addEventListener("pointerup", () => {
      nodeEl.classList.remove("dragging");
    });

    nodeEl.addEventListener("click", (event) => {
      event.stopPropagation();
      selectNode(nodeId);
    });
  });
}

function bindSvgEvents() {
  graphSvg().querySelectorAll("path[data-edge-key]").forEach((pathEl) => {
    pathEl.style.pointerEvents = "auto";
    pathEl.style.cursor = "pointer";

    pathEl.addEventListener("click", (event) => {
      event.stopPropagation();
      const key = pathEl.getAttribute("data-edge-key");
      selectEdgeByKey(key);
    });
  });

  graphSvg().querySelectorAll("circle[data-waypoint-index]").forEach((circle) => {
    circle.addEventListener("pointerdown", (event) => {
      event.stopPropagation();

      const edgeKey = circle.getAttribute("data-edge-key");
      const index = Number(circle.getAttribute("data-waypoint-index"));

      if (!edgeKey || Number.isNaN(index)) return;

      selectedEdgeKey = edgeKey;
      waypointDrag.edgeKey = edgeKey;
      waypointDrag.index = index;
      waypointDrag.active = true;

      try {
        circle.setPointerCapture(event.pointerId);
      } catch (_) {}

      refreshAllUI();
    });
  });
}

// ===============================
// PAN / DRAG / CONNECT
// ===============================

function startPan(clientX, clientY) {
  interaction.isPanning = true;
  interaction.panMouseX = clientX;
  interaction.panMouseY = clientY;
  interaction.panStartX = viewportState.x;
  interaction.panStartY = viewportState.y;
  interaction.movedDuringPointer = false;
  graphViewport().classList.add("panning");
}

function movePan(clientX, clientY) {
  if (!interaction.isPanning) return;

  viewportState.x = interaction.panStartX + (clientX - interaction.panMouseX);
  viewportState.y = interaction.panStartY + (clientY - interaction.panMouseY);
  interaction.movedDuringPointer = true;

  applyViewportTransform();
}

function endPan() {
  interaction.isPanning = false;
  graphViewport().classList.remove("panning");
}

function setupViewportInteractions() {
  const viewport = graphViewport();

  viewport.addEventListener("wheel", (event) => {
    if (isMobileLayout()) return;

    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : (1 / 1.08);
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

// ===============================
// SEARCH + INIT HOOKS
// ===============================

function setupSearch() {
  const desktopSearch = document.getElementById("searchInput");
  if (desktopSearch) {
    desktopSearch.addEventListener("input", (event) => {
      setSearch(event.target.value || "");
    });
  }

  const mobileSearch = mobileSearchInput();
  if (mobileSearch) {
    mobileSearch.addEventListener("input", (event) => {
      setSearch(event.target.value || "");
    });
  }
}
