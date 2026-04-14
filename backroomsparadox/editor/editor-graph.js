(function () {
  function requireEl(id) {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error(`Missing required element: #${id}`);
    }
    return el;
  }

  function graphViewport() {
    return requireEl("graphViewport");
  }

  function graphScene() {
    return requireEl("graphScene");
  }

  function graphSvg() {
    return requireEl("graphSvg");
  }

  function graphNodesEl() {
    return requireEl("graphNodes");
  }

  function graphViewportRect() {
    return graphViewport().getBoundingClientRect();
  }

  function getNodeWidth() {
    return typeof isMobileLayout === "function" && isMobileLayout() ? 118 : 170;
  }

  function getNodeHeightApprox() {
    return typeof isMobileLayout === "function" && isMobileLayout() ? 58 : 74;
  }

  function getGraphBounds(nodes) {
    if (!Array.isArray(nodes) || !nodes.length) {
      return { minX: 0, maxX: 1000, minY: 0, maxY: 600 };
    }

    const allX = [];
    const allY = [];

    for (const node of nodes) {
      if (!node) continue;
      if (typeof node.x === "number") allX.push(node.x);
      if (typeof node.y === "number") allY.push(node.y);
    }

    if (Array.isArray(window.graphData?.edges)) {
      for (const edge of window.graphData.edges) {
        const waypoints = typeof normalizeWaypoints === "function"
          ? normalizeWaypoints(edge?.waypoints)
          : [];
        for (const point of waypoints) {
          if (typeof point.x === "number") allX.push(point.x);
          if (typeof point.y === "number") allY.push(point.y);
        }
      }
    }

    if (!allX.length || !allY.length) {
      return { minX: 0, maxX: 1000, minY: 0, maxY: 600 };
    }

    return {
      minX: Math.min(...allX),
      maxX: Math.max(...allX),
      minY: Math.min(...allY),
      maxY: Math.max(...allY)
    };
  }

  function scenePointFromClient(clientX, clientY) {
    const rect = graphViewportRect();
    return {
      x: (clientX - rect.left - window.viewportState.x) / window.viewportState.scale,
      y: (clientY - rect.top - window.viewportState.y) / window.viewportState.scale
    };
  }

  function applyViewportTransform() {
    graphScene().style.transform =
      `translate(${window.viewportState.x}px, ${window.viewportState.y}px) scale(${window.viewportState.scale})`;
  }

  function syncSvgSize() {
    const svg = graphSvg();
    const bounds = getGraphBounds(window.graphData?.nodes || []);
    const padding = typeof isMobileLayout === "function" && isMobileLayout() ? 240 : 360;

    const minX = bounds.minX - padding;
    const minY = bounds.minY - padding;
    const width = Math.max(1600, (bounds.maxX - bounds.minX) + padding * 2);
    const height = Math.max(1100, (bounds.maxY - bounds.minY) + padding * 2);

    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
  }

  function fitToGraph() {
    const visibleNodeIds = typeof getVisibleNodeIds === "function"
      ? getVisibleNodeIds()
      : new Set((window.graphData?.nodes || []).map(n => n.id));

    const visibleNodes = (window.graphData?.nodes || []).filter(node => visibleNodeIds.has(node.id));
    const nodesToFit = visibleNodes.length ? visibleNodes : (window.graphData?.nodes || []);
    const bounds = getGraphBounds(nodesToFit);

    const mobile = typeof isMobileLayout === "function" && isMobileLayout();
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

    if (typeof setStatus === "function" && !mobile) {
      setStatus("Fitted graph to view.");
    }
  }

  function resetView() {
    window.viewportState = {
      x: typeof isMobileLayout === "function" && isMobileLayout() ? 20 : 80,
      y: typeof isMobileLayout === "function" && isMobileLayout() ? 20 : 80,
      scale: typeof isMobileLayout === "function" && isMobileLayout() ? 0.55 : 1
    };

    applyViewportTransform();

    if (typeof setStatus === "function" && !(typeof isMobileLayout === "function" && isMobileLayout())) {
      setStatus("View reset.");
    }
  }

  function zoomBy(factor, clientX = null, clientY = null) {
    const rect = graphViewportRect();
    const px = clientX ?? (rect.left + rect.width / 2);
    const py = clientY ?? (rect.top + rect.height / 2);

    const before = scenePointFromClient(px, py);

    const mobile = typeof isMobileLayout === "function" && isMobileLayout();
    window.viewportState.scale = Math.max(
      0.22,
      Math.min(mobile ? 1.8 : 2.4, window.viewportState.scale * factor)
    );

    window.viewportState.x = px - rect.left - before.x * window.viewportState.scale;
    window.viewportState.y = py - rect.top - before.y * window.viewportState.scale;

    applyViewportTransform();
  }

  function getNodePortPosition(nodeId, side) {
    const node = typeof getNodeById === "function" ? getNodeById(nodeId) : null;
    if (!node) return null;

    const width = getNodeWidth();

    return {
      x: node.x + (side === "output" ? width / 2 : -width / 2),
      y: node.y
    };
  }

  function buildEdgePoints(edge) {
    const fromPort = getNodePortPosition(edge.from, "output");
    const toPort = getNodePortPosition(edge.to, "input");
    if (!fromPort || !toPort) return null;

    const points = [fromPort];

    const waypoints = typeof normalizeWaypoints === "function"
      ? normalizeWaypoints(edge.waypoints)
      : [];

    for (const point of waypoints) {
      points.push(point);
    }

    points.push(toPort);
    return points;
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
    const fromNode = typeof getNodeById === "function" ? getNodeById(edge.from) : null;
    return typeof getTypeEdgeClass === "function"
      ? getTypeEdgeClass(fromNode?.type || "stable")
      : "edge-stable";
  }

  function bindNodeEvents() {
    graphNodesEl().querySelectorAll(".node").forEach((nodeEl) => {
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

        const node = typeof getNodeById === "function" ? getNodeById(nodeId) : null;
        if (!node) return;

        window.interaction.dragStartNodeX = node.x;
        window.interaction.dragStartNodeY = node.y;
        window.interaction.movedDuringPointer = false;

        window.selectedNodeId = nodeId;
        window.selectedEdgeKey = null;

        if (typeof refreshAllUI === "function") {
          refreshAllUI();
        } else {
          refreshGraph();
        }

        if (typeof isMobileLayout === "function" && isMobileLayout()) {
          if (typeof openMobileInspector === "function") openMobileInspector();
        } else if (typeof isCompactEditorLayout === "function" && isCompactEditorLayout()) {
          if (typeof openInspector === "function") openInspector();
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

        if (typeof refreshAllUI === "function") {
          refreshAllUI();
        } else {
          refreshGraph();
        }
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
        window.selectedEdgeKey = key;

        if (typeof refreshAllUI === "function") {
          refreshAllUI();
        } else {
          refreshGraph();
        }
      });
    });

    graphSvg().querySelectorAll("circle[data-waypoint-index]").forEach((circle) => {
      circle.addEventListener("pointerdown", (event) => {
        event.stopPropagation();

        const edgeKey = circle.getAttribute("data-edge-key");
        const index = Number(circle.getAttribute("data-waypoint-index"));

        if (!edgeKey || Number.isNaN(index)) return;

        window.selectedEdgeKey = edgeKey;
        window.waypointDrag.edgeKey = edgeKey;
        window.waypointDrag.index = index;
        window.waypointDrag.active = true;

        try {
          circle.setPointerCapture(event.pointerId);
        } catch (_) {}

        if (typeof refreshAllUI === "function") {
          refreshAllUI();
        } else {
          refreshGraph();
        }
      });
    });
  }

  function refreshGraph() {
    syncSvgSize();

    const visibleNodeIds = typeof getVisibleNodeIds === "function"
      ? getVisibleNodeIds()
      : new Set((window.graphData?.nodes || []).map(n => n.id));

    const nodesHtml = (window.graphData?.nodes || [])
      .filter(node => visibleNodeIds.has(node.id))
      .map(node => {
        const isSelected = node.id === window.selectedNodeId;
        const typeClass = typeof normalizeType === "function"
          ? normalizeType(node.type)
          : "stable";

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
              <span class="nodeBadge">${escapeHtml(typeof getTypeLabel === "function" ? getTypeLabel(node.type) : node.type)}</span>
              <span class="nodeBadge">${escapeHtml(node.status || "draft")}</span>
            </div>
            <div class="nodePorts">
              <div class="port input"></div>
              <div class="port output"></div>
            </div>
          </div>
        `;
      })
      .join("");

    graphNodesEl().innerHTML = nodesHtml;

    const svgParts = [];
    const visibleEdges = (window.graphData?.edges || []).filter(edge =>
      visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)
    );

    for (const edge of visibleEdges) {
      const points = buildEdgePoints(edge);
      if (!points) continue;

      const path = createEdgePath(points);
      if (!path) continue;

      const edgeClass = getEdgeTypeClass(edge);
      const edgeKey = typeof edgeKeyOf === "function" ? edgeKeyOf(edge) : "";
      const isSelected = window.selectedEdgeKey === edgeKey;
      const isRelatedToSelectedNode =
        !!window.selectedNodeId &&
        (edge.from === window.selectedNodeId || edge.to === window.selectedNodeId);

      const lineClass = isSelected || isRelatedToSelectedNode ? "line-selected" : "line-base";

      svgParts.push(`
        <path
          d="${path}"
          class="${lineClass} ${edgeClass}"
          data-edge-key="${escapeHtml(edgeKey)}"
        ></path>
      `);

      if (edge.label) {
        const mid = getEdgeMidpoint(points);
        svgParts.push(`
          <text
            x="${mid.x}"
            y="${mid.y - ((typeof isMobileLayout === "function" && isMobileLayout()) ? 8 : 10)}"
            text-anchor="middle"
            class="edgeLabel"
          >${escapeHtml(edge.label)}</text>
        `);
      }

      if (Array.isArray(edge.waypoints)) {
        edge.waypoints.forEach((point, index) => {
          svgParts.push(`
            <circle
              cx="${point.x}"
              cy="${point.y}"
              r="${(typeof isMobileLayout === "function" && isMobileLayout()) ? 5 : 6}"
              class="waypoint ${isSelected ? "selected" : ""}"
              data-edge-key="${escapeHtml(edgeKey)}"
              data-waypoint-index="${index}"
            ></circle>
          `);
        });
      }
    }

    if (window.interaction?.connectFromNodeId) {
      const fromPort = getNodePortPosition(window.interaction.connectFromNodeId, "output");
      if (fromPort) {
        const previewPath = createEdgePath([
          fromPort,
          {
            x: window.interaction.connectMouseSceneX,
            y: window.interaction.connectMouseSceneY
          }
        ]);

        svgParts.push(`<path d="${previewPath}" class="line-preview"></path>`);
      }
    }

    graphSvg().innerHTML = svgParts.join("");

    bindNodeEvents();
    bindSvgEvents();

    if (typeof updateStatsBar === "function") updateStatsBar();
    if (typeof updateSidebarForSelection === "function") updateSidebarForSelection();
  }

  function startPan(clientX, clientY) {
    window.interaction.isPanning = true;
    window.interaction.panMouseX = clientX;
    window.interaction.panMouseY = clientY;
    window.interaction.panStartX = window.viewportState.x;
    window.interaction.panStartY = window.viewportState.y;
    window.interaction.movedDuringPointer = false;
    graphViewport().classList.add("panning");
  }

  function movePan(clientX, clientY) {
    if (!window.interaction.isPanning) return;

    window.viewportState.x = window.interaction.panStartX + (clientX - window.interaction.panMouseX);
    window.viewportState.y = window.interaction.panStartY + (clientY - window.interaction.panMouseY);
    window.interaction.movedDuringPointer = true;

    applyViewportTransform();
  }

  function endPan() {
    window.interaction.isPanning = false;
    graphViewport().classList.remove("panning");
  }

  function setupViewportInteractions() {
    const viewport = graphViewport();

    viewport.addEventListener("wheel", (event) => {
      if (typeof isMobileLayout === "function" && isMobileLayout()) return;
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
      if (window.waypointDrag?.active) {
        const edge = typeof getEdgeByKey === "function"
          ? getEdgeByKey(window.waypointDrag.edgeKey)
          : null;

        if (edge && edge.waypoints && edge.waypoints[window.waypointDrag.index]) {
          const pt = scenePointFromClient(event.clientX, event.clientY);
          edge.waypoints[window.waypointDrag.index].x = Math.round(pt.x);
          edge.waypoints[window.waypointDrag.index].y = Math.round(pt.y);

          if (typeof refreshAllUI === "function") {
            refreshAllUI();
          } else {
            refreshGraph();
          }
        }
        return;
      }

      if (window.interaction.dragNodeId) {
        const node = typeof getNodeById === "function"
          ? getNodeById(window.interaction.dragNodeId)
          : null;

        if (!node) return;

        const dx = (event.clientX - window.interaction.dragStartMouseX) / window.viewportState.scale;
        const dy = (event.clientY - window.interaction.dragStartMouseY) / window.viewportState.scale;

        node.x = Math.round(window.interaction.dragStartNodeX + dx);
        node.y = Math.round(window.interaction.dragStartNodeY + dy);
        window.interaction.movedDuringPointer = true;

        if (typeof refreshAllUI === "function") {
          refreshAllUI();
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

      if (window.waypointDrag?.active) {
        window.waypointDrag.active = false;
        if (typeof markDirty === "function") markDirty("Moved bend point.");
        if (typeof scheduleAutosave === "function") scheduleAutosave();
        return;
      }

      if (window.interaction.dragNodeId) {
        if (window.interaction.movedDuringPointer) {
          if (typeof markDirtyNoHistory === "function") markDirtyNoHistory("Moved node.");
          if (typeof scheduleAutosave === "function") scheduleAutosave();
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
          if (typeof pushUndoState === "function") pushUndoState("Connect nodes");
          if (typeof addEdge === "function") addEdge(fromId, targetNodeId, "", true);
          window.selectedNodeId = fromId;

          if (typeof refreshAllUI === "function") {
            refreshAllUI();
          } else {
            refreshGraph();
          }

          if (typeof markDirty === "function") markDirty("Added link by dragging.");
        } else {
          refreshGraph();
        }
      }
    });

    viewport.addEventListener("pointercancel", () => {
      if (window.waypointDrag) window.waypointDrag.active = false;
      if (window.interaction) {
        window.interaction.dragNodeId = null;
        window.interaction.connectFromNodeId = null;
      }
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
        if (typeof closeMobilePanels === "function") closeMobilePanels();
        if (typeof clearSelection === "function") clearSelection();
      }
    });
  }

  window.graphViewport = graphViewport;
  window.graphScene = graphScene;
  window.graphSvg = graphSvg;
  window.graphNodesEl = graphNodesEl;
  window.graphViewportRect = graphViewportRect;
  window.scenePointFromClient = scenePointFromClient;
  window.applyViewportTransform = applyViewportTransform;
  window.getGraphBounds = getGraphBounds;
  window.syncSvgSize = syncSvgSize;
  window.fitToGraph = fitToGraph;
  window.resetView = resetView;
  window.zoomBy = zoomBy;
  window.getNodePortPosition = getNodePortPosition;
  window.buildEdgePoints = buildEdgePoints;
  window.createSegmentPath = createSegmentPath;
  window.createEdgePath = createEdgePath;
  window.getEdgeMidpoint = getEdgeMidpoint;
  window.getEdgeTypeClass = getEdgeTypeClass;
  window.refreshGraph = refreshGraph;
  window.setupViewportInteractions = setupViewportInteractions;
  window.startPan = startPan;
  window.movePan = movePan;
  window.endPan = endPan;
})();
