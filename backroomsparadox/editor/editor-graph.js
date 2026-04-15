(function () {
  function graphViewport() {
    return document.getElementById("graphViewport");
  }

  function graphScene() {
    return document.getElementById("graphScene");
  }

  function graphSvg() {
    return document.getElementById("graphSvg");
  }

  function graphNodes() {
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
      active: false
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
    const scene = graphScene();
    if (!scene) return;

    scene.style.transform =
      `translate(${window.viewportState.x}px, ${window.viewportState.y}px) scale(${window.viewportState.scale})`;
    scene.style.transformOrigin = "0 0";
  }

  function normalizeType(type) {
    if (typeof window.normalizeType === "function" && window.normalizeType !== normalizeType) {
      return window.normalizeType(type);
    }

    const value = String(type || "").trim().toLowerCase();
    if (value === "stable" || value === "start") return "stable";
    if (value === "dangerous" || value === "progression") return "dangerous";
    if (value === "corrupted" || value === "danger") return "corrupted";
    if (value === "anomalous" || value === "weird") return "anomalous";
    return "stable";
  }

  function getTypeLabel(type) {
    if (typeof window.getTypeLabel === "function" && window.getTypeLabel !== getTypeLabel) {
      return window.getTypeLabel(type);
    }

    const meta = window.TYPE_META || {};
    return (meta[normalizeType(type)] && meta[normalizeType(type)].label) || "Stable";
  }

  function getTypeClass(type) {
    if (typeof window.getTypeClass === "function" && window.getTypeClass !== getTypeClass) {
      return window.getTypeClass(type);
    }

    const meta = window.TYPE_META || {};
    return (meta[normalizeType(type)] && meta[normalizeType(type)].className) || "stable";
  }

  function getTypeEdgeClass(type) {
    if (typeof window.getTypeEdgeClass === "function" && window.getTypeEdgeClass !== getTypeEdgeClass) {
      return window.getTypeEdgeClass(type);
    }

    const meta = window.TYPE_META || {};
    return (meta[normalizeType(type)] && meta[normalizeType(type)].edgeClass) || "edge-stable";
  }

  function getNodeById(id) {
    return (window.graphData?.nodes || []).find((n) => n.id === String(id)) || null;
  }

  function getVisibleNodeIds() {
    const search = String(window.currentSearch || "").trim().toLowerCase();

    if (!search) {
      return new Set((window.graphData?.nodes || []).map((n) => n.id));
    }

    return new Set(
      (window.graphData?.nodes || [])
        .filter((node) => {
          const hay = [
            node.id,
            node.label,
            node.subtitle,
            node.description,
            node.notes,
            getTypeLabel(node.type),
            ...(Array.isArray(node.tags) ? node.tags : [])
          ]
            .join(" ")
            .toLowerCase();

          return hay.includes(search);
        })
        .map((n) => n.id)
    );
  }

  function normalizeWaypoints(value) {
    if (typeof window.normalizeWaypoints === "function" && window.normalizeWaypoints !== normalizeWaypoints) {
      return window.normalizeWaypoints(value);
    }

    if (!Array.isArray(value)) return [];
    return value
      .map((item) => ({
        x: typeof item?.x === "number" ? item.x : null,
        y: typeof item?.y === "number" ? item.y : null
      }))
      .filter((item) => typeof item.x === "number" && typeof item.y === "number");
  }

  function edgeKeyOf(edge) {
    if (typeof window.edgeKeyOf === "function" && window.edgeKeyOf !== edgeKeyOf) {
      return window.edgeKeyOf(edge);
    }

    return `${edge.from}|${edge.to}|${edge.label || ""}|${edge.oneWay === false ? "0" : "1"}`;
  }

  function getNodePortPosition(nodeId, side) {
    const node = getNodeById(nodeId);
    if (!node) return null;

    const width = isMobile() ? 118 : 170;

    return {
      x: Number(node.x || 0) + (side === "output" ? width / 2 : -width / 2),
      y: Number(node.y || 0)
    };
  }

  function buildEdgePoints(edge) {
    const fromPort = getNodePortPosition(edge.from, "output");
    const toPort = getNodePortPosition(edge.to, "input");

    if (!fromPort || !toPort) return null;

    return [fromPort, ...normalizeWaypoints(edge.waypoints), toPort];
  }

  function createEdgePath(points) {
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
      const waypoints = normalizeWaypoints(edge.waypoints);
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
    const scene = graphScene();
    const svg = graphSvg();
    const nodes = graphNodes();
    if (!scene || !svg || !nodes) return;

    const bounds = getGraphBounds(window.graphData?.nodes || []);
    const padding = isMobile() ? 240 : 360;

    const minX = bounds.minX - padding;
    const minY = bounds.minY - padding;
    const width = Math.max(1600, (bounds.maxX - bounds.minX) + padding * 2);
    const height = Math.max(1100, (bounds.maxY - bounds.minY) + padding * 2);

    scene.style.position = "absolute";
    scene.style.left = "0";
    scene.style.top = "0";
    scene.style.width = `${width}px`;
    scene.style.height = `${height}px`;

    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.overflow = "visible";

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
    const visibleNodeIds = getVisibleNodeIds();
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

  function refreshGraph() {
    const nodeLayer = graphNodes();
    const svg = graphSvg();

    if (!nodeLayer || !svg || !window.graphData) return;

    syncCanvasSize();
    applyViewportTransform();

    const visibleNodeIds = getVisibleNodeIds();

    nodeLayer.innerHTML = (window.graphData.nodes || [])
      .filter((node) => visibleNodeIds.has(node.id))
      .map((node) => {
        const isSelected = node.id === window.selectedNodeId;
        const typeClass = getTypeClass(node.type);

        const safeId = window.escapeHtml ? window.escapeHtml(node.id) : node.id;
        const safeLabel = window.escapeHtml ? window.escapeHtml(node.label || "Unnamed") : (node.label || "Unnamed");
        const safeSubtitle = window.escapeHtml ? window.escapeHtml(node.subtitle || "") : (node.subtitle || "");
        const safeType = window.escapeHtml ? window.escapeHtml(getTypeLabel(node.type)) : getTypeLabel(node.type);
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

      const edgeKey = edgeKeyOf(edge);
      const edgeClass = getTypeEdgeClass(getNodeById(edge.from)?.type || "stable");

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
          data-edge-key="${safeEdgeKey}"
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
          >
            ${safeLabel}
          </text>
        `);
      }

      const waypoints = normalizeWaypoints(edge.waypoints);

      waypoints.forEach((point, index) => {
        svgParts.push(`
          <circle
            cx="${point.x}"
            cy="${point.y}"
            r="${isMobile() ? 5 : 6}"
            class="waypoint ${isSelected ? "selected" : ""}"
            data-edge-key="${safeEdgeKey}"
            data-waypoint-index="${index}"
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
          svgParts.push(`<path d="${previewPath}" class="line-preview"></path>`);
        }
      }
    }

    svg.innerHTML = svgParts.join("");
    bindNodeEvents();
    bindSvgEvents();
  }

  function bindNodeEvents() {
    const layer = graphNodes();
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

        const node = getNodeById(nodeId);
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
    const svg = graphSvg();
    if (!svg) return;

    svg.querySelectorAll("path[data-edge-key]").forEach((pathEl) => {
      pathEl.style.pointerEvents = "auto";
      pathEl.style.cursor = "pointer";

      pathEl.onclick = (event) => {
        event.stopPropagation();
        window.selectedEdgeKey = pathEl.getAttribute("data-edge-key");

        if (window.refreshAllUI) {
          window.refreshAllUI();
        } else {
          refreshGraph();
        }
      };
    });

    svg.querySelectorAll("circle[data-waypoint-index]").forEach((circle) => {
      circle.onpointerdown = (event) => {
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
    };

    viewport.onpointerup = (event) => {
      const targetNodeEl = event.target.closest(".node");
      const targetNodeId = targetNodeEl?.dataset?.nodeId || null;

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
    };

    viewport.onpointercancel = () => {
      window.waypointDrag.active = false;
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
  window.graphScene = graphScene;
  window.graphSvg = graphSvg;
  window.graphNodes = graphNodes;
  window.graphViewportRect = graphViewportRect;
  window.scenePointFromClient = scenePointFromClient;
  window.applyViewportTransform = applyViewportTransform;
  window.getGraphBounds = getGraphBounds;
  window.syncCanvasSize = syncCanvasSize;
  window.resetView = resetView;
  window.fitToGraph = fitToGraph;
  window.zoomBy = zoomBy;
  window.refreshGraph = refreshGraph;
  window.bindNodeEvents = bindNodeEvents;
  window.bindSvgEvents = bindSvgEvents;
  window.startPan = startPan;
  window.movePan = movePan;
  window.endPan = endPan;
  window.setupViewportInteractions = setupViewportInteractions;
})();
