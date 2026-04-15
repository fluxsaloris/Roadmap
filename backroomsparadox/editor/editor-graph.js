(function () {
  function graphViewport() {
    return document.getElementById("graphViewport");
  }

  function graphCanvas() {
    return document.getElementById("graphScene");
  }

  function edgesLayer() {
    return document.getElementById("graphSvg");
  }

  function nodesLayer() {
    return document.getElementById("graphNodes");
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

  if (!window.waypointDrag) {
    window.waypointDrag = {
      edgeKey: null,
      index: -1,
      active: false,
      pointerId: null
    };
  }

  function isMobile() {
    return window.innerWidth <= 700;
  }

  function graphViewportRect() {
    const viewport = graphViewport();
    if (!viewport) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }
    return viewport.getBoundingClientRect();
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
    canvas.style.transformOrigin = "0 0";
  }

  function getGraphBounds(nodes) {
    if (!nodes || !nodes.length) {
      return { minX: 0, maxX: 1000, minY: 0, maxY: 600 };
    }

    const allX = [];
    const allY = [];

    for (const node of nodes) {
      allX.push(Number(node.x) || 0);
      allY.push(Number(node.y) || 0);
    }

    for (const edge of window.graphData?.edges || []) {
      const waypoints = typeof window.normalizeWaypoints === "function"
        ? window.normalizeWaypoints(edge.waypoints)
        : [];

      for (const point of waypoints) {
        allX.push(Number(point.x) || 0);
        allY.push(Number(point.y) || 0);
      }
    }

    return {
      minX: Math.min(...allX),
      maxX: Math.max(...allX),
      minY: Math.min(...allY),
      maxY: Math.max(...allY)
    };
  }

  function syncCanvasSize() {
    const canvas = graphCanvas();
    const svg = edgesLayer();
    const nodes = nodesLayer();
    if (!canvas || !svg || !nodes) return;

    const bounds = getGraphBounds(window.graphData?.nodes || []);
    const padding = isMobile() ? 240 : 360;

    const width = Math.max(1600, Math.ceil(bounds.maxX + padding));
    const height = Math.max(1100, Math.ceil(bounds.maxY + padding));

    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.overflow = "visible";
    svg.style.pointerEvents = "none";

    nodes.style.position = "absolute";
    nodes.style.left = "0";
    nodes.style.top = "0";
    nodes.style.width = `${width}px`;
    nodes.style.height = `${height}px`;
    nodes.style.overflow = "visible";
  }

  function resetView() {
    window.viewportState = {
      x: isMobile() ? 20 : 80,
      y: isMobile() ? 20 : 80,
      scale: isMobile() ? 0.55 : 1
    };

    applyViewportTransform();
    if (window.setStatus) window.setStatus("View reset.");
  }

  function fitToGraph() {
    const visibleNodeIds = typeof window.getVisibleNodeIds === "function"
      ? window.getVisibleNodeIds()
      : new Set((window.graphData?.nodes || []).map((n) => n.id));

    const visibleNodes = (window.graphData?.nodes || []).filter((node) =>
      visibleNodeIds.has(node.id)
    );

    const nodesToFit = visibleNodes.length ? visibleNodes : (window.graphData?.nodes || []);
    const bounds = getGraphBounds(nodesToFit);

    const mobile = isMobile();
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
      Math.min(isMobile() ? 1.8 : 2.4, window.viewportState.scale * factor)
    );

    window.viewportState.x = px - rect.left - before.x * window.viewportState.scale;
    window.viewportState.y = py - rect.top - before.y * window.viewportState.scale;

    applyViewportTransform();
  }

  function getNodePortPosition(nodeId, side) {
    const node = typeof window.getNodeById === "function"
      ? window.getNodeById(nodeId)
      : null;

    if (!node) return null;

    const width = isMobile() ? 118 : 170;

    return {
      x: (Number(node.x) || 0) + (side === "output" ? width / 2 : -width / 2),
      y: Number(node.y) || 0
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
    const fromNode = typeof window.getNodeById === "function"
      ? window.getNodeById(edge.from)
      : null;

    return typeof window.getTypeEdgeClass === "function"
      ? window.getTypeEdgeClass(fromNode?.type || "stable")
      : "edge-stable";
  }

  function addWaypointAtScenePosition(edgeKey, x, y) {
    if (typeof window.getEdgeByKey !== "function") return;
    const edge = window.getEdgeByKey(edgeKey);
    if (!edge) return;

    if (typeof window.pushUndoState === "function") {
      window.pushUndoState("Add bend point");
    }

    if (!Array.isArray(edge.waypoints)) {
      edge.waypoints = [];
    }

    edge.waypoints = typeof window.normalizeWaypoints === "function"
      ? window.normalizeWaypoints(edge.waypoints)
      : edge.waypoints;

    edge.waypoints.push({
      x: Math.round(x),
      y: Math.round(y)
    });

    window.selectedEdgeKey = edgeKey;

    if (window.refreshAllUI) {
      window.refreshAllUI();
    } else {
      refreshGraph();
    }

    if (window.markDirty) {
      window.markDirty("Added bend point.");
    }
  }

  function refreshGraph() {
    const nodeLayer = nodesLayer();
    const svg = edgesLayer();

    if (!nodeLayer || !svg || !window.graphData) return;

    syncCanvasSize();
    applyViewportTransform();

    const visibleNodeIds = typeof window.getVisibleNodeIds === "function"
      ? window.getVisibleNodeIds()
      : new Set((window.graphData.nodes || []).map((n) => n.id));

    nodeLayer.innerHTML = (window.graphData.nodes || [])
      .filter((node) => visibleNodeIds.has(node.id))
      .map((node) => {
        const isSelected = node.id === window.selectedNodeId;
        const typeClass = typeof window.getTypeClass === "function"
          ? window.getTypeClass(node.type)
          : "stable";

        const safeId = window.escapeHtml ? window.escapeHtml(node.id) : node.id;
        const safeLabel = window.escapeHtml ? window.escapeHtml(node.label || "Unnamed") : (node.label || "Unnamed");
        const safeSubtitle = window.escapeHtml ? window.escapeHtml(node.subtitle || "") : (node.subtitle || "");
        const safeType = window.escapeHtml && window.getTypeLabel
          ? window.escapeHtml(window.getTypeLabel(node.type))
          : (window.getTypeLabel ? window.getTypeLabel(node.type) : "Stable");
        const safeStatus = window.escapeHtml ? window.escapeHtml(node.status || "draft") : (node.status || "draft");

        return `
          <div
            class="node ${typeClass} ${isSelected ? "selected" : ""}"
            data-node-id="${safeId}"
            style="left:${Number(node.x) || 0}px; top:${Number(node.y) || 0}px;"
          >
            <div class="nodeHeader">
              <div class="nodeDot"></div>
              <div class="nodeTitle">${safeLabel}</div>
            </div>
            ${safeSubtitle ? `<div class="nodeSubtitle">${safeSubtitle}</div>` : ""}
            <div class="nodeStatusRow">
              <span class="nodeBadge">${safeType}</span>
              <span class="nodeBadge">${safeStatus}</span>
            </div>
            <div class="nodePorts">
              <div class="port input"></div>
              <div class="port output"></div>
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
      if (!points || points.length < 2) continue;

      const path = createEdgePath(points);
      if (!path) continue;

      const edgeKey = typeof window.edgeKeyOf === "function"
        ? window.edgeKeyOf(edge)
        : `${edge.from}|${edge.to}`;

      const edgeClass = getEdgeTypeClass(edge);
      const isSelected = window.selectedEdgeKey === edgeKey;
      const isRelatedToSelectedNode =
        window.selectedNodeId &&
        (edge.from === window.selectedNodeId || edge.to === window.selectedNodeId);

      const lineClass = isSelected || isRelatedToSelectedNode ? "line-selected" : "line-base";
      const safeEdgeKey = window.escapeHtml ? window.escapeHtml(edgeKey) : edgeKey;

      svgParts.push(`
        <path
          d="${path}"
          class="${lineClass} ${edgeClass}"
          pointer-events="none"
        ></path>
      `);

      svgParts.push(`
        <path
          d="${path}"
          data-edge-key="${safeEdgeKey}"
          class="edge-hit-area"
          fill="none"
          stroke="rgba(0,0,0,0)"
          stroke-width="22"
          stroke-linecap="round"
          stroke-linejoin="round"
          style="pointer-events:auto;cursor:pointer;"
        ></path>
      `);

      if (edge.label) {
        const mid = getEdgeMidpoint(points);
        const safeLabel = window.escapeHtml ? window.escapeHtml(edge.label) : edge.label;

        svgParts.push(`
          <text
            x="${mid.x}"
            y="${mid.y - (isMobile() ? 8 : 10)}"
            text-anchor="middle"
            class="edgeLabel"
            pointer-events="none"
          >
            ${safeLabel}
          </text>
        `);
      }

      const waypoints = typeof window.normalizeWaypoints === "function"
        ? window.normalizeWaypoints(edge.waypoints)
        : [];

      waypoints.forEach((point, index) => {
        svgParts.push(`
          <circle
            cx="${point.x}"
            cy="${point.y}"
            r="${isMobile() ? 7 : 8}"
            class="waypoint ${isSelected ? "selected" : ""}"
            data-edge-key="${safeEdgeKey}"
            data-waypoint-index="${index}"
            style="pointer-events:auto;cursor:move;"
          ></circle>
        `);
      });
    }

    if (window.interaction.connectFromNodeId) {
      const fromPort = getNodePortPosition(window.interaction.connectFromNodeId, "output");
      if (fromPort) {
        const previewPath = createEdgePath([
          fromPort,
          {
            x: window.interaction.connectMouseSceneX,
            y: window.interaction.connectMouseSceneY
          }
        ]);

        if (previewPath) {
          svgParts.push(`<path d="${previewPath}" class="line-preview" pointer-events="none"></path>`);
        }
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

      nodeEl.onpointerdown = (event) => {
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

        const node = typeof window.getNodeById === "function"
          ? window.getNodeById(nodeId)
          : null;

        if (!node) return;

        window.interaction.dragStartNodeX = Number(node.x) || 0;
        window.interaction.dragStartNodeY = Number(node.y) || 0;
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
      };

      nodeEl.onpointerup = () => {
        nodeEl.classList.remove("dragging");
      };

      nodeEl.onclick = (event) => {
        event.stopPropagation();
        window.selectedNodeId = nodeId;
        window.selectedEdgeKey = null;

        if (window.refreshAllUI) {
          window.refreshAllUI();
        } else {
          refreshGraph();
        }
      };
    });
  }

  function bindSvgEvents() {
    const svg = edgesLayer();
    if (!svg) return;

    svg.querySelectorAll("path[data-edge-key]").forEach((pathEl) => {
      pathEl.onclick = (event) => {
        event.stopPropagation();
        window.selectedEdgeKey = pathEl.getAttribute("data-edge-key");

        if (window.refreshAllUI) {
          window.refreshAllUI();
        } else {
          refreshGraph();
        }
      };

      pathEl.ondblclick = (event) => {
        event.preventDefault();
        event.stopPropagation();

        const edgeKey = pathEl.getAttribute("data-edge-key");
        if (!edgeKey) return;

        const pt = scenePointFromClient(event.clientX, event.clientY);
        addWaypointAtScenePosition(edgeKey, pt.x, pt.y);
      };
    });

    svg.querySelectorAll("circle[data-waypoint-index]").forEach((circle) => {
      circle.onpointerdown = (event) => {
        event.preventDefault();
        event.stopPropagation();

        const edgeKey = circle.getAttribute("data-edge-key");
        const index = Number(circle.getAttribute("data-waypoint-index"));

        if (!edgeKey || Number.isNaN(index)) return;

        window.selectedEdgeKey = edgeKey;
        window.waypointDrag.edgeKey = edgeKey;
        window.waypointDrag.index = index;
        window.waypointDrag.active = true;
        window.waypointDrag.pointerId = event.pointerId;

        try {
          circle.setPointerCapture(event.pointerId);
        } catch (_) {}

        if (window.refreshAllUI) {
          window.refreshAllUI();
        } else {
          refreshGraph();
        }
      };
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

    window.viewportState.x =
      window.interaction.panStartX + (clientX - window.interaction.panMouseX);
    window.viewportState.y =
      window.interaction.panStartY + (clientY - window.interaction.panMouseY);

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

    viewport.onwheel = (event) => {
      if (isMobile()) return;

      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.08 : (1 / 1.08);
      zoomBy(factor, event.clientX, event.clientY);
    };

    viewport.onpointerdown = (event) => {
      if (event.target.closest(".node")) return;
      if (event.target.closest(".waypoint")) return;
      if (event.target.closest("path[data-edge-key]")) return;

      startPan(event.clientX, event.clientY);
      try {
        viewport.setPointerCapture(event.pointerId);
      } catch (_) {}
    };

    viewport.onpointermove = (event) => {
      if (window.waypointDrag.active) {
        const edge = typeof window.getEdgeByKey === "function"
          ? window.getEdgeByKey(window.waypointDrag.edgeKey)
          : null;

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
        const node = typeof window.getNodeById === "function"
          ? window.getNodeById(window.interaction.dragNodeId)
          : null;

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
    };

    viewport.onpointerup = (event) => {
      const targetNodeEl = event.target.closest(".node");
      const targetNodeId = targetNodeEl?.dataset?.nodeId || null;

      if (window.waypointDrag.active) {
        window.waypointDrag.active = false;
        window.waypointDrag.pointerId = null;
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
    };

    viewport.onpointercancel = () => {
      window.waypointDrag.active = false;
      window.waypointDrag.pointerId = null;
      window.interaction.dragNodeId = null;
      window.interaction.connectFromNodeId = null;
      endPan();
      refreshGraph();
    };

    viewport.onclick = (event) => {
      if (
        !event.target.closest(".node") &&
        !event.target.closest("path[data-edge-key]") &&
        !event.target.closest(".waypoint")
      ) {
        if (window.clearSelection) window.clearSelection();
      }
    };
  }

  window.graphViewport = graphViewport;
  window.graphCanvas = graphCanvas;
  window.edgesLayer = edgesLayer;
  window.nodesLayer = nodesLayer;
  window.graphViewportRect = graphViewportRect;
  window.scenePointFromClient = scenePointFromClient;
  window.applyViewportTransform = applyViewportTransform;
  window.getGraphBounds = getGraphBounds;
  window.syncCanvasSize = syncCanvasSize;
  window.resetView = resetView;
  window.fitToGraph = fitToGraph;
  window.zoomBy = zoomBy;
  window.getNodePortPosition = getNodePortPosition;
  window.buildEdgePoints = buildEdgePoints;
  window.createSegmentPath = createSegmentPath;
  window.createEdgePath = createEdgePath;
  window.getEdgeMidpoint = getEdgeMidpoint;
  window.getEdgeTypeClass = getEdgeTypeClass;
  window.addWaypointAtScenePosition = addWaypointAtScenePosition;
  window.refreshGraph = refreshGraph;
  window.bindNodeEvents = bindNodeEvents;
  window.bindSvgEvents = bindSvgEvents;
  window.startPan = startPan;
  window.movePan = movePan;
  window.endPan = endPan;
  window.setupViewportInteractions = setupViewportInteractions;
})();
