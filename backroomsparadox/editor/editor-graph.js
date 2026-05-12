(function () {
  "use strict";

  const state = {
    viewportState: window.viewportState || {
      x: 80,
      y: 80,
      scale: window.innerWidth <= 700 ? 0.55 : 1
    },

    interaction: window.interaction || {
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
    },

    waypointDrag: window.waypointDrag || {
      edgeKey: null,
      index: -1,
      active: false,
      pointerId: null
    }
  };

  const el = {
    viewport: () => document.getElementById("graphViewport"),
    canvas: () => document.getElementById("graphScene"),
    svg: () => document.getElementById("graphSvg"),
    nodes: () => document.getElementById("graphNodes")
  };

  const isMobile = () => window.innerWidth <= 700;

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  function getSceneOffset() {
    const canvas = el.canvas();
    return {
      x: Number(canvas?.dataset?.sceneMinX || 0),
      y: Number(canvas?.dataset?.sceneMinY || 0)
    };
  }

  function graphViewportRect() {
    const v = el.viewport();
    return v ? v.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
  }

  function scenePointFromClient(clientX, clientY) {
    const rect = graphViewportRect();
    const offset = getSceneOffset();
    const scale = state.viewportState.scale || 1;

    return {
      x: (clientX - rect.left - state.viewportState.x) / scale + offset.x,
      y: (clientY - rect.top - state.viewportState.y) / scale + offset.y
    };
  }

  function applyViewportTransform() {
    const canvas = el.canvas();
    if (!canvas) return;

    const { x, y, scale } = state.viewportState;

    canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    canvas.style.transformOrigin = "0 0";
  }

  function getGraphBounds(nodes = []) {
    if (!nodes.length) {
      return { minX: 0, maxX: 1000, minY: 0, maxY: 600 };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    const push = (x, y) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };

    for (const n of nodes) {
      push(Number(n.x) || 0, Number(n.y) || 0);
    }

    for (const e of window.graphData?.edges || []) {
      const waypoints = typeof window.normalizeWaypoints === "function"
        ? window.normalizeWaypoints(e.waypoints)
        : [];

      for (const p of waypoints) {
        push(Number(p.x) || 0, Number(p.y) || 0);
      }
    }

    return { minX, maxX, minY, maxY };
  }

  function syncCanvasSize() {
    const canvas = el.canvas();
    const svg = el.svg();
    const nodes = el.nodes();
    if (!canvas || !svg || !nodes) return;

    const bounds = getGraphBounds(window.graphData?.nodes || []);
    const padding = isMobile() ? 240 : 360;

    const minX = Math.floor(bounds.minX - padding);
    const minY = Math.floor(bounds.minY - padding);
    const maxX = Math.ceil(bounds.maxX + padding);
    const maxY = Math.ceil(bounds.maxY + padding);

    const width = Math.max(1600, maxX - minX);
    const height = Math.max(1100, maxY - minY);

    canvas.dataset.sceneMinX = String(minX);
    canvas.dataset.sceneMinY = String(minY);

    Object.assign(canvas.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: `${width}px`,
      height: `${height}px`
    });

    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);

    Object.assign(svg.style, {
      position: "absolute",
      left: "0",
      top: "0",
      overflow: "visible"
    });

    Object.assign(nodes.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: `${width}px`,
      height: `${height}px`,
      overflow: "visible",
      pointerEvents: "none"
    });
  }

  function resetView() {
    state.viewportState = {
      x: isMobile() ? 20 : 80,
      y: isMobile() ? 20 : 80,
      scale: isMobile() ? 0.55 : 1
    };

    applyViewportTransform();
    window.setStatus?.("View reset.");
  }

  function fitToGraph() {
    const nodes = window.graphData?.nodes || [];
    const bounds = getGraphBounds(nodes);

    const rect = graphViewportRect();
    const mobile = isMobile();

    const width = Math.max(500, bounds.maxX - bounds.minX + (mobile ? 220 : 420));
    const height = Math.max(400, bounds.maxY - bounds.minY + (mobile ? 220 : 340));

    const scale = clamp(
      Math.min(rect.width / width, rect.height / height),
      0.2,
      mobile ? 1.8 : 2.4
    );

    state.viewportState.scale = scale;

    state.viewportState.x =
      rect.width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale;

    state.viewportState.y =
      rect.height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale;

    applyViewportTransform();
    window.setStatus?.("Fitted graph to view.");
  }

  function zoomBy(factor, clientX, clientY) {
    const rect = graphViewportRect();

    const cx = clientX ?? rect.left + rect.width / 2;
    const cy = clientY ?? rect.top + rect.height / 2;

    const before = scenePointFromClient(cx, cy);
    const offset = getSceneOffset();

    state.viewportState.scale = clamp(
      state.viewportState.scale * factor,
      0.22,
      isMobile() ? 1.8 : 2.4
    );

    const localX = before.x - offset.x;
    const localY = before.y - offset.y;

    state.viewportState.x = cx - rect.left - localX * state.viewportState.scale;
    state.viewportState.y = cy - rect.top - localY * state.viewportState.scale;

    applyViewportTransform();
  }

  function getNodePortPosition(nodeId, side) {
    const node = window.getNodeById?.(nodeId);
    if (!node) return null;

    const w = isMobile() ? 118 : 170;

    return {
      x: (Number(node.x) || 0) + (side === "output" ? w / 2 : -w / 2),
      y: Number(node.y) || 0
    };
  }

  function buildEdgePoints(edge) {
    const from = getNodePortPosition(edge.from, "output");
    const to = getNodePortPosition(edge.to, "input");
    if (!from || !to) return null;

    const waypoints = window.normalizeWaypoints?.(edge.waypoints) || [];
    return [from, ...waypoints, to];
  }

  function createEdgePath(points) {
    if (!points || points.length < 2) return "";

    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];

      const curve = Math.max(30, Math.min(120, Math.abs(b.x - a.x) * 0.35));

      d += ` C ${a.x + curve} ${a.y}, ${b.x - curve} ${b.y}, ${b.x} ${b.y}`;
    }

    return d;
  }

  function getEdgeMidpoint(points) {
    if (!points?.length) return { x: 0, y: 0 };

    let total = 0;
    const lens = [];

    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      const len = Math.hypot(dx, dy);
      lens.push(len);
      total += len;
    }

    let t = total / 2;

    for (let i = 0; i < lens.length; i++) {
      if (t <= lens[i]) {
        const r = lens[i] ? t / lens[i] : 0;
        return {
          x: points[i].x + (points[i + 1].x - points[i].x) * r,
          y: points[i].y + (points[i + 1].y - points[i].y) * r
        };
      }
      t -= lens[i];
    }

    return points[Math.floor(points.length / 2)];
  }

  function refreshGraph() {
    const nodeLayer = el.nodes();
    const svg = el.svg();
    const offset = getSceneOffset();

    if (!nodeLayer || !svg || !window.graphData) return;

    syncCanvasSize();
    applyViewportTransform();

    const nodes = window.graphData.nodes || [];
    const edges = window.graphData.edges || [];

    nodeLayer.innerHTML = nodes.map((node) => {
      const selected = node.id === window.selectedNodeId;
      const typeClass = window.getTypeClass?.(node.type) || "stable";

      const x = (Number(node.x) || 0) - offset.x;
      const y = (Number(node.y) || 0) - offset.y;

      return `
        <div class="node ${typeClass} ${selected ? "selected" : ""}"
             data-node-id="${node.id}"
             style="left:${x}px; top:${y}px;">
          <div class="nodeHeader">
            <div class="nodeDot"></div>
            <div class="nodeTitle">${node.label || "Unnamed"}</div>
          </div>
        </div>
      `;
    }).join("");

    const svgParts = [];

    for (const edge of edges) {
      const pts = buildEdgePoints(edge);
      if (!pts) continue;

      const d = createEdgePath(pts);
      const key = window.edgeKeyOf?.(edge) || `${edge.from}|${edge.to}`;

      svgParts.push(`<path d="${d}" class="edge" pointer-events="none"></path>`);

      svgParts.push(`
        <path d="${d}"
              data-edge-key="${key}"
              data-edge-hit="1"
              class="edge-hit"
              fill="none"
              stroke="transparent"
              stroke-width="34"
              style="cursor:pointer;"></path>
      `);

      const mid = getEdgeMidpoint(pts);

      if (edge.label) {
        svgParts.push(`
          <text x="${mid.x}" y="${mid.y}" text-anchor="middle">
            ${edge.label}
          </text>
        `);
      }
    }

    svg.innerHTML = svgParts.join("");

    bindNodeEvents();
    bindSvgEvents();
  }

  function bindNodeEvents() {
    const layer = el.nodes();
    if (!layer) return;

    layer.querySelectorAll(".node").forEach((nodeEl) => {
      const id = nodeEl.dataset.nodeId;

      nodeEl.onpointerdown = (e) => {
        e.stopPropagation();

        state.interaction.dragNodeId = id;
        state.interaction.dragStartMouseX = e.clientX;
        state.interaction.dragStartMouseY = e.clientY;

        const node = window.getNodeById?.(id);
        if (!node) return;

        state.interaction.dragStartNodeX = node.x || 0;
        state.interaction.dragStartNodeY = node.y || 0;

        window.selectedNodeId = id;

        nodeEl.setPointerCapture?.(e.pointerId);
      };
    });
  }

  function bindSvgEvents() {
    const svg = el.svg();
    if (!svg) return;

    svg.querySelectorAll('[data-edge-hit="1"]').forEach((elHit) => {
      elHit.onclick = () => {
        window.selectedEdgeKey = elHit.dataset.edgeKey;
        refreshGraph();
      };
    });
  }

  function startPan(x, y) {
    const v = el.viewport();
    state.interaction.isPanning = true;
    state.interaction.panMouseX = x;
    state.interaction.panMouseY = y;
    state.interaction.panStartX = state.viewportState.x;
    state.interaction.panStartY = state.viewportState.y;

    v?.classList.add("panning");
  }

  function movePan(x, y) {
    if (!state.interaction.isPanning) return;

    state.viewportState.x =
      state.interaction.panStartX + (x - state.interaction.panMouseX);

    state.viewportState.y =
      state.interaction.panStartY + (y - state.interaction.panMouseY);

    applyViewportTransform();
  }

  function endPan() {
    state.interaction.isPanning = false;
    el.viewport()?.classList.remove("panning");
  }

  function setupViewportInteractions() {
    const v = el.viewport();
    if (!v) return;

    v.onwheel = (e) => {
      if (isMobile()) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.08 : 1 / 1.08, e.clientX, e.clientY);
    };

    v.onpointerdown = (e) => {
      if (e.target.closest(".node")) return;
      startPan(e.clientX, e.clientY);
    };

    v.onpointermove = (e) => {
      if (state.interaction.dragNodeId) {
        const node = window.getNodeById?.(state.interaction.dragNodeId);
        if (!node) return;

        const dx =
          (e.clientX - state.interaction.dragStartMouseX) /
          state.viewportState.scale;

        const dy =
          (e.clientY - state.interaction.dragStartMouseY) /
          state.viewportState.scale;

        node.x = state.interaction.dragStartNodeX + dx;
        node.y = state.interaction.dragStartNodeY + dy;

        refreshGraph();
        return;
      }

      if (state.interaction.isPanning) {
        movePan(e.clientX, e.clientY);
      }
    };

    v.onpointerup = () => {
      state.interaction.dragNodeId = null;
      endPan();
    };
  }

  Object.assign(window, {
    graphViewport: el.viewport,
    graphCanvas: el.canvas,
    edgesLayer: el.svg,
    nodesLayer: el.nodes,

    graphViewportRect,
    scenePointFromClient,
    applyViewportTransform,

    getGraphBounds,
    syncCanvasSize,

    resetView,
    fitToGraph,
    zoomBy,

    getNodePortPosition,
    buildEdgePoints,
    createEdgePath,
    getEdgeMidpoint,

    refreshGraph,
    bindNodeEvents,
    bindSvgEvents,

    startPan,
    movePan,
    endPan,
    setupViewportInteractions,

    _viewportState: state.viewportState
  });

  applyViewportTransform();
})();
