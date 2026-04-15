(function () {
  function graphViewport() {
    return document.getElementById("graphViewport");
  }

  function graphCanvas() {
    return document.getElementById("graphCanvas");
  }

  function edgesLayer() {
    return document.getElementById("edgesLayer");
  }

  function nodesLayer() {
    return document.getElementById("nodesLayer");
  }

  if (!window.viewportState) {
    window.viewportState = {
      x: 80,
      y: 80,
      scale: window.innerWidth <= 700 ? 0.55 : 1
    };
  }

  if (!window.interaction) {
    window.interaction = {
      isPanning: false,
      panMouseX: 0,
      panMouseY: 0,
      panStartX: 0,
      panStartY: 0,
      movedDuringPointer: false,

      dragNodeId: null,
      dragStartMouseX: 0,
      dragStartMouseY: 0,
      dragStartNodeX: 0,
      dragStartNodeY: 0,

      connectFromNodeId: null,
      connectMouseSceneX: 0,
      connectMouseSceneY: 0
    };
  }

  if (!window.graphData) {
    window.graphData = { nodes: [], edges: [] };
  }

  if (typeof window.selectedNodeId === "undefined") {
    window.selectedNodeId = null;
  }

  if (typeof window.selectedEdgeKey === "undefined") {
    window.selectedEdgeKey = null;
  }

  if (typeof window.currentSearch === "undefined") {
    window.currentSearch = "";
  }

  function normalizeType(type) {
    const value = String(type || "").trim().toLowerCase();
    if (value === "stable" || value === "start") return "stable";
    if (value === "dangerous" || value === "progression") return "dangerous";
    if (value === "corrupted" || value === "danger") return "corrupted";
    if (value === "anomalous" || value === "weird") return "anomalous";
    return "stable";
  }

  function getTypeLabel(type) {
    const meta = window.TYPE_META || {};
    return (meta[normalizeType(type)] && meta[normalizeType(type)].label) || "Stable";
  }

  function getTypeEdgeClass(type) {
    const meta = window.TYPE_META || {};
    return (meta[normalizeType(type)] && meta[normalizeType(type)].edgeClass) || "edge-stable";
  }

  function getNodeById(id) {
    return (window.graphData.nodes || []).find((n) => n.id === String(id)) || null;
  }

  function getSelectedNode() {
    return window.selectedNodeId ? getNodeById(window.selectedNodeId) : null;
  }

  function getEdgeByKey(key) {
    return (window.graphData.edges || []).find(
      (edge) => window.edgeKeyOf(edge) === key
    ) || null;
  }

  function getVisibleNodeIds() {
    const search = String(window.currentSearch || "").trim().toLowerCase();

    if (!search) {
      return new Set((window.graphData.nodes || []).map((n) => n.id));
    }

    return new Set(
      (window.graphData.nodes || [])
        .filter((node) => {
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
        })
        .map((n) => n.id)
    );
  }

  function graphViewportRect() {
    const viewport = graphViewport();
    return viewport ? viewport.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
  }

  function scenePointFromClient(clientX, clientY) {
    const rect = graphViewportRect();
    return {
      x: (clientX - rect.left - window.viewportState.x) / window.viewportState.scale,
      y: (clientY - rect.top - window.viewportState.y) / window.viewportState.scale
    };
  }

  function applyViewportTransform() {
    const canvas = graphCanvas();
    if (!canvas) return;

    canvas.style.transform =
      `translate(${window.viewportState.x}px, ${window.viewportState.y}px) scale(${window.viewportState.scale})`;
  }

  function getGraphBounds(nodes) {
    if (!nodes.length) {
      return { minX: 0, maxX: 1000, minY: 0, maxY: 600 };
    }

    const allX = [];
    const allY = [];

    for (const node of nodes) {
      allX.push(node.x);
      allY.push(node.y);
    }

    for (const edge of window.graphData.edges || []) {
      const waypoints = typeof window.normalizeWaypoints === "function"
        ? window.normalizeWaypoints(edge.waypoints)
        : [];

      for (const point of waypoints) {
        allX.push(point.x);
        allY.push(point.y);
      }
    }

    return {
      minX: Math.min(...allX),
      maxX: Math.max(...allX),
      minY: Math.min(...allY),
      maxY: Math.max(...allY)
    };
  }

  function syncSvgSize() {
    const svg = edgesLayer();
    if (!svg) return;

    const bounds = getGraphBounds(window.graphData.nodes || []);
    const padding = window.innerWidth <= 700 ? 240 : 360;

    const minX = bounds.minX - padding;
    const minY = bounds.minY - padding;
    const width = Math.max(1600, (bounds.maxX - bounds.minX) + padding * 2);
    const height = Math.max(1100, (bounds.maxY - bounds.minY) + padding * 2);

    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
  }

  function resetView() {
    window.viewportState = {
      x: window.innerWidth <= 700 ? 20 : 80,
      y: window.innerWidth <= 700 ? 20 : 80,
      scale: window.innerWidth <= 700 ? 0.55 : 1
    };

    applyViewportTransform();
    if (window.setStatus) window.setStatus("View reset.");
  }

  function fitToGraph() {
    const visibleNodeIds = getVisibleNodeIds();
    const visibleNodes = (window.graphData.nodes || []).filter((node) =>
      visibleNodeIds.has(node.id)
    );

    const nodesToFit = visibleNodes.length ? visibleNodes : (window.graphData.nodes || []);
    const bounds = getGraphBounds(nodesToFit);

    const mobile = window.innerWidth <= 700;
    const width = Math.max(mobile ? 340 : 540, bounds.maxX - bounds.minX + (mobile ? 220 : 420));
    const height = Math.max(mobile ? 260 : 360, bounds.maxY - bounds.minY + (mobile ? 220 : 340));

    const rect = graphViewportRect();
    const fitScale = Math.min(
      mobile ? 0.82 : 1.15,
      Math.max(0.2, Math.min(rect.width / width, rect.height / height))
    );

    window.viewportState.scale = fitScale;
    window.viewportState.x = rect.width / 2 - ((bounds.minX + bounds.maxX) / 2) * fitScale;
    window.viewportState.y = rect.height / 2 - ((bounds.minY + bounds.maxY) / 2) * fitScale;

    applyViewportTransform();
    if (window.setStatus) window.setStatus("Fitted graph to view.");
  }

  function zoomBy(factor, clientX = null, clientY = null) {
    const rect = graphViewportRect();
    const px = clientX ?? (rect.left + rect.width / 2);
    const py = clientY ?? (rect.top + rect.height / 2);

    const before = scenePointFromClient(px, py);

    window.viewportState.scale = Math.max(
      0.22,
      Math.min(window.innerWidth <= 700 ? 1.8 : 2.4, window.viewportState.scale * factor)
    );

    window.viewportState.x = px - rect.left - before.x * window.viewportState.scale;
    window.viewportState.y = py - rect.top - before.y * window.viewportState.scale;

    applyViewportTransform();
  }

  function getNodePortPosition(nodeId, side) {
    const node = getNodeById(nodeId);
    if (!node) return null;

    const width = window.innerWidth <= 700 ? 118 : 170;

    return {
      x: node.x + (side === "output" ? width / 2 : -width / 2),
      y: node.y
    };
  }

  function buildEdgePoints(edge) {
    const fromPort = getNodePortPosition(edge.from, "output");
    const toPort = getNodePortPosition(edge.to, "input");
    if (!fromPort || !toPort) return null;

    const waypoints = typeof window.normalizeWaypoints === "function"
      ? window.normalizeWaypoints(edge.waypoints)
      : [];

    return [fromPort, ...waypoints, toPort];
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

  function getEdgeMidpoint(points) {
    if (!points || points.length < 2) return { x: 0, y: 0 };

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

  function refreshGraph() {
    syncSvgSize();

    const visibleNodeIds = getVisibleNodeIds();
    const nodeLayer = nodesLayer();
    const svg = edgesLayer();

    if (!nodeLayer || !svg) return;

    nodeLayer.innerHTML = (window.graphData.nodes || [])
      .filter((node) => visibleNodeIds.has(node.id))
      .map((node) => {
        const isSelected = node.id === window.selectedNodeId;
        const typeClass = normalizeType(node.type);

        return `
          <div
            class="node ${window.escapeHtml ? window.escapeHtml(typeClass) : typeClass} ${isSelected ? "selected" : ""}"
            data-node-id="${window.escapeHtml ? window.escapeHtml(node.id) : node.id}"
            style="left:${node.x}px; top:${node.y}px;"
          >
            <div class="nodeHeader">
              <div class="nodeDot"></div>
              <div class="nodeTitle">${window.escapeHtml ? window.escapeHtml(node.label) : node.label}</div>
            </div>
            ${node.subtitle ? `<div class="nodeSubtitle">${window.escapeHtml ? window.escapeHtml(node.subtitle) : node.subtitle}</div>` : ""}
            <div class="nodeStatusRow">
              <span class="nodeBadge">${window.escapeHtml ? window.escapeHtml(getTypeLabel(node.type)) : getTypeLabel(node.type)}</span>
              <span class="nodeBadge">${window.escapeHtml ? window.escapeHtml(node.status || "draft") : (node.status || "draft")}</span>
            </div>
          </div>
        `;
      })
      .join("");

    const svgParts = [];
    const visibleEdges = (window.graphData.edges || []).filter((edge) =>
      visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)
    );

    for (const edge of visibleEdges) {
      const points = buildEdgePoints(edge);
      if (!points) continue;

      const path = createSegmentPath(points);
      if (!path) continue;

      const edgeClass = getEdgeTypeClass(edge);
      const edgeKey = window.edgeKeyOf(edge);
      const isSelected = window.selectedEdgeKey === edgeKey;
      const isRelatedToSelectedNode =
        window.selectedNodeId &&
        (edge.from === window.selectedNodeId || edge.to === window.selectedNodeId);

      const lineClass = isSelected || isRelatedToSelectedNode ? "line-selected" : "line-base";

      svgParts.push(`
        <path
          d="${path}"
          class="${lineClass} ${edgeClass}"
          data-edge-key="${window.escapeHtml ? window.escapeHtml(edgeKey) : edgeKey}"
        ></path>
      `);

      if (edge.label) {
        const mid = getEdgeMidpoint(points);
        svgParts.push(`
          <text
            x="${mid.x}"
            y="${mid.y - (window.innerWidth <= 700 ? 8 : 10)}"
            text-anchor="middle"
            class="edgeLabel"
          >
            ${window.escapeHtml ? window.escapeHtml(edge.label) : edge.label}
          </text>
        `);
      }

      if (Array.isArray(edge.waypoints)) {
        edge.waypoints.forEach((point, index) => {
          svgParts.push(`
            <circle
              cx="${point.x}"
              cy="${point.y}"
              r="${window.innerWidth <= 700 ? 5 : 6}"
              class="waypoint ${isSelected ? "selected" : ""}"
              data-edge-key="${window.escapeHtml ? window.escapeHtml(edgeKey) : edgeKey}"
              data-waypoint-index="${index}"
            ></circle>
          `);
        });
      }
    }

    if (window.interaction.connectFromNodeId) {
      const fromPort = getNodePortPosition(window.interaction.connectFromNodeId, "output");
      if (fromPort) {
        const previewPath = createSegmentPath([
          fromPort,
          {
            x: window.interaction.connectMouseSceneX,
            y: window.interaction.connectMouseSceneY
          }
        ]);
        svgParts.push(`<path d="${previewPath}" class="line-preview"></path>`);
      }
    }

    svg.innerHTML = svgParts.join("");

    bindNodeEvents();
    bindSvgEvents();
  }

  function bindNodeEvents() {
    const layer = nodesLayer();
    if (!layer) return;

    layer.querySelectorAll(".node").forEach((nodeEl) => {
      const nodeId = nodeEl.dataset.nodeId;

      nodeEl.addEventListener("pointerdown", (event) => {
        event.stopPropagation();

        if (event.shiftKey) {
          window.interaction.connectFromNodeId = nodeId;
          const pt = scenePointFromClient(event.clientX, event.clientY);
          window.interaction.connectMouseSceneX = pt.x;
          window.interaction.connectMouseSceneY = pt.y;
          refreshGraph();
          return;
        }

        window.interaction.dragNodeId = nodeId;
        window.interaction.dragStartMouseX = event.clientX;
        window.interaction.dragStartMouseY = event.clientY;

        const node = getNodeById(nodeId);
        if (!node) return;

        window.interaction.dragStartNodeX = node.x;
        window.interaction.dragStartNodeY = node.y;
        window.interaction.movedDuringPointer = false;

        window.selectedNodeId = nodeId;
        window.selectedEdgeKey = null;

        if (window.refreshAllUI) {
          window.refreshAllUI();
        } else {
          refreshGraph();
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
        window.selectedNodeId = nodeId;
        window.selectedEdgeKey = null;

        if (window.refreshAllUI) {
          window.refreshAllUI();
        } else {
          refreshGraph();
        }
      });
    });
  }

  function bindSvgEvents() {
    const svg = edgesLayer();
    if (!svg) return;

    svg.querySelectorAll("path[data-edge-key]").forEach((pathEl) => {
      pathEl.style.pointerEvents = "auto";
      pathEl.style.cursor = "pointer";

      pathEl.addEventListener("click", (event) => {
        event.stopPropagation();
        window.selectedEdgeKey = pathEl.getAttribute("data-edge-key");

        if (window.refreshAllUI) {
          window.refreshAllUI();
        } else {
          refreshGraph();
        }
      });
    });

    svg.querySelectorAll("circle[data-waypoint-index]").forEach((circle) => {
      circle.addEventListener("pointerdown", (event) => {
        event.stopPropagation();

        const edgeKey = circle.getAttribute("data-edge-key");
        const index = Number(circle.getAttribute("data-waypoint-index"));

        if (!edgeKey || Number.isNaN(index)) return;

        window.selectedEdgeKey = edgeKey;
        window.waypointDrag = window.waypointDrag || { edgeKey: null, index: -1, active: false };
        window.waypointDrag.edgeKey = edgeKey;
        window.waypointDrag.index = index;
        window.waypointDrag.active = true;

        try {
          circle.setPointerCapture(event.pointerId);
        } catch (_) {}

        if (window.refreshAllUI) {
          window.refreshAllUI();
        } else {
          refreshGraph();
        }
      });
    });
  }

  function startPan(clientX, clientY) {
    const viewport = graphViewport();
    if (!viewport) return;

    window.interaction.isPanning = true;
    window.interaction.panMouseX = clientX;
    window.interaction.panMouseY = clientY;
    window.interaction.panStartX = window.viewportState.x;
    window.interaction.panStartY = window.viewportState.y;
    window.interaction.movedDuringPointer = false;
    viewport.classList.add("panning");
  }

  function movePan(clientX, clientY) {
    if (!window.interaction.isPanning) return;

    window.viewportState.x = window.interaction.panStartX + (clientX - window.interaction.panMouseX);
    window.viewportState.y = window.interaction.panStartY + (clientY - window.interaction.panMouseY);
    window.interaction.movedDuringPointer = true;

    applyViewportTransform();
  }

  function endPan() {
    const viewport = graphViewport();
    window.interaction.isPanning = false;
    if (viewport) viewport.classList.remove("panning");
  }

  function setupViewportInteractions() {
    const viewport = graphViewport();
    if (!viewport) return;

    viewport.addEventListener("wheel", (event) => {
      if (window.innerWidth <= 700) return;

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
      window.waypointDrag = window.waypointDrag || { edgeKey: null, index: -1, active: false };

      if (window.waypointDrag.active) {
        const edge = getEdgeByKey(window.waypointDrag.edgeKey);
        if (edge && edge.waypoints && edge.waypoints[window.waypointDrag.index]) {
          const pt = scenePointFromClient(event.clientX, event.clientY);
          edge.waypoints[window.waypointDrag.index].x = Math.round(pt.x);
          edge.waypoints[window.waypointDrag.index].y = Math.round(pt.y);

          if (window.refreshAllUI) {
            window.refreshAllUI();
          } else {
            refreshGraph();
          }
        }
        return;
      }

      if (window.interaction.dragNodeId) {
        const node = getNodeById(window.interaction.dragNodeId);
        if (!node) return;

        const dx = (event.clientX - window.interaction.dragStartMouseX) / window.viewportState.scale;
        const dy = (event.clientY - window.interaction.dragStartMouseY) / window.viewportState.scale;

        node.x = Math.round(window.interaction.dragStartNodeX + dx);
        node.y = Math.round(window.interaction.dragStartNodeY + dy);

        window.interaction.movedDuringPointer = true;

        if (window.refreshAllUI) {
          window.refreshAllUI();
        } else {
          refreshGraph();
        }
        return;
      }

      if (window.interaction.isPanning) {
        movePan(event.clientX, event.clientY);
        return;
      }

      if (window.interaction.connectFromNodeId) {
        const pt = scenePointFromClient(event.clientX, event.clientY);
        window.interaction.connectMouseSceneX = pt.x;
        window.interaction.connectMouseSceneY = pt.y;
        refreshGraph();
      }
    });

    viewport.addEventListener("pointerup", (event) => {
      const targetNodeEl = event.target.closest(".node");
      const targetNodeId = targetNodeEl?.dataset?.nodeId || null;

      window.waypointDrag = window.waypointDrag || { edgeKey: null, index: -1, active: false };

      if (window.waypointDrag.active) {
        window.waypointDrag.active = false;
        if (window.markDirty) window.markDirty("Moved bend point.");
        if (window.scheduleAutosave) window.scheduleAutosave();
        return;
      }

      if (window.interaction.dragNodeId) {
        if (window.interaction.movedDuringPointer) {
          if (window.markDirtyNoHistory) window.markDirtyNoHistory("Moved node.");
          if (window.scheduleAutosave) window.scheduleAutosave();
        }
        window.interaction.dragNodeId = null;
      }

      if (window.interaction.isPanning) {
        endPan();
      }

      if (window.interaction.connectFromNodeId) {
        const fromId = window.interaction.connectFromNodeId;
        window.interaction.connectFromNodeId = null;

        if (targetNodeId && targetNodeId !== fromId) {
          if (window.pushUndoState) window.pushUndoState("Connect nodes");
          if (window.addEdge) window.addEdge(fromId, targetNodeId, "", true);
          window.selectedNodeId = fromId;

          if (window.refreshAllUI) {
            window.refreshAllUI();
          } else {
            refreshGraph();
          }

          if (window.markDirty) window.markDirty("Added link by dragging.");
        } else {
          refreshGraph();
        }
      }
    });

    viewport.addEventListener("pointercancel", () => {
      window.waypointDrag = window.waypointDrag || { edgeKey: null, index: -1, active: false };
      window.waypointDrag.active = false;
      window.interaction.dragNodeId = null;
      window.interaction.connectFromNodeId = null;
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
        if (window.closeMobilePanels) window.closeMobilePanels();
        if (window.clearSelection) window.clearSelection();
      }
    });
  }

  window.graphViewport = graphViewport;
  window.graphCanvas = graphCanvas;
  window.edgesLayer = edgesLayer;
  window.nodesLayer = nodesLayer;

  window.normalizeType = normalizeType;
  window.getTypeLabel = getTypeLabel;
  window.getTypeEdgeClass = getTypeEdgeClass;
  window.getNodeById = getNodeById;
  window.getSelectedNode = getSelectedNode;
  window.getEdgeByKey = getEdgeByKey;
  window.getVisibleNodeIds = getVisibleNodeIds;
  window.graphViewportRect = graphViewportRect;
  window.scenePointFromClient = scenePointFromClient;
  window.applyViewportTransform = applyViewportTransform;
  window.getGraphBounds = getGraphBounds;
  window.syncSvgSize = syncSvgSize;
  window.resetView = resetView;
  window.fitToGraph = fitToGraph;
  window.zoomBy = zoomBy;
  window.getNodePortPosition = getNodePortPosition;
  window.buildEdgePoints = buildEdgePoints;
  window.createSegmentPath = createSegmentPath;
  window.getEdgeMidpoint = getEdgeMidpoint;
  window.getEdgeTypeClass = getEdgeTypeClass;
  window.refreshGraph = refreshGraph;
  window.bindNodeEvents = bindNodeEvents;
  window.bindSvgEvents = bindSvgEvents;
  window.startPan = startPan;
  window.movePan = movePan;
  window.endPan = endPan;
  window.setupViewportInteractions = setupViewportInteractions;
})();
