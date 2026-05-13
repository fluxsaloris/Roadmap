(function () {
  "use strict";

  const isMobile = () => window.innerWidth <= 700;

  const state = {
    interaction: window.interaction || {
      isPanning: false,
      panMouseX: 0,
      panMouseY: 0,
      panStartX: 0,
      panStartY: 0,
      dragNodeId: null,
      dragStartMouseX: 0,
      dragStartMouseY: 0,
      dragStartNodeX: 0,
      dragStartNodeY: 0
    }
  };

  const el = {
    viewport: () => document.getElementById("graphViewport"),
    canvas: () => document.getElementById("graphScene"),
    svg: () => document.getElementById("graphSvg"),
    nodes: () => document.getElementById("graphNodes")
  };

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  function graphViewportRect() {
    const v = el.viewport();
    return v
      ? v.getBoundingClientRect()
      : { left: 0, top: 0, width: 0, height: 0 };
  }

  function getSceneOffset() {
    const canvas = el.canvas();
    return {
      x: Number(canvas?.dataset?.sceneMinX || 0),
      y: Number(canvas?.dataset?.sceneMinY || 0)
    };
  }

  function scenePointFromClient(clientX, clientY) {
    const rect = graphViewportRect();
    const offset = getSceneOffset();
    const scale = window.viewportState?.scale || 1;

    return {
      x: (clientX - rect.left - window.viewportState.x) / scale + offset.x,
      y: (clientY - rect.top - window.viewportState.y) / scale + offset.y
    };
  }

  function applyViewportTransform() {
    const canvas = el.canvas();
    if (!canvas || !window.viewportState) return;

    const { x, y, scale } = window.viewportState;

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
      const pts = window.normalizeWaypoints?.(e.waypoints) || [];
      for (const p of pts) push(p.x, p.y);
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

    Object.assign(nodes.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: `${width}px`,
      height: `${height}px`,
      pointerEvents: "none"
    });
  }

  function zoomBy(factor, clientX, clientY) {
    const rect = graphViewportRect();

    const cx = clientX ?? rect.left + rect.width / 2;
    const cy = clientY ?? rect.top + rect.height / 2;

    const before = scenePointFromClient(cx, cy);

    window.viewportState.scale = clamp(
      window.viewportState.scale * factor,
      0.22,
      isMobile() ? 1.8 : 2.4
    );

    window.viewportState.x =
      cx - rect.left - before.x * window.viewportState.scale;

    window.viewportState.y =
      cy - rect.top - before.y * window.viewportState.scale;

    applyViewportTransform();
  }

  function buildEdgePoints(edge) {
    const from = window.getNodePortPosition?.(edge.from, "output");
    const to = window.getNodePortPosition?.(edge.to, "input");
    if (!from || !to) return null;

    const waypoints = window.normalizeWaypoints?.(edge.waypoints) || [];
    return [from, ...waypoints, to];
  }

  function getEdgeMidpoint(points) {
    if (!points?.length) return { x: 0, y: 0 };

    let total = 0;
    const lens = [];

    for (let i = 0; i < points.length - 1; i++) {
      const len = Math.hypot(
        points[i + 1].x - points[i].x,
        points[i + 1].y - points[i].y
      );
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

    return points[0];
  }

  function createEdgePath(points) {
    if (!points || points.length < 2) return "";

    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const curve = 60;

      d += ` C ${a.x + curve} ${a.y}, ${b.x - curve} ${b.y}, ${b.x} ${b.y}`;
    }

    return d;
  }

  function refreshGraph() {
    const nodesEl = el.nodes();
    const svg = el.svg();
    if (!nodesEl || !svg || !window.graphData) return;

    syncCanvasSize();
    applyViewportTransform();

    const nodes = window.graphData.nodes || [];
    const edges = window.graphData.edges || [];

    const offset = getSceneOffset();
    const scale = window.viewportState?.scale || 1;

    nodesEl.innerHTML = nodes.map(n => {
      const selected = n.id === window.selectedNodeId;
      const typeClass = window.getTypeClass?.(n.type) || "stable";

      const x = ((Number(n.x) || 0) - offset.x) * scale;
      const y = ((Number(n.y) || 0) - offset.y) * scale;

      return `
        <div class="node ${typeClass} ${selected ? "selected" : ""}"
             data-node-id="${n.id}"
             style="left:${x}px; top:${y}px;">
          <div class="nodeTitle">${n.label || "Unnamed"}</div>
        </div>
      `;
    }).join("");

    const svgParts = [];

    for (const e of edges) {
      const pts = buildEdgePoints(e);
      if (!pts) continue;

      const d = createEdgePath(pts);
      const mid = getEdgeMidpoint(pts);
      const key = window.edgeKeyOf?.(e);

      svgParts.push(`<path d="${d}" class="edge"></path>`);

      svgParts.push(`
        <path d="${d}"
              data-edge-key="${key}"
              class="edge-hit"
              stroke="transparent"
              stroke-width="30"></path>
      `);

      if (e.label) {
        svgParts.push(`
          <text x="${mid.x}" y="${mid.y}" text-anchor="middle">
            ${e.label}
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

    layer.querySelectorAll(".node").forEach(nodeEl => {
      const id = nodeEl.dataset.nodeId;

      nodeEl.onpointerdown = (e) => {
        state.interaction.dragNodeId = id;

        const node = window.getNodeById?.(id);
        if (!node) return;

        state.interaction.dragStartMouseX = e.clientX;
        state.interaction.dragStartMouseY = e.clientY;

        state.interaction.dragStartNodeX = node.x;
        state.interaction.dragStartNodeY = node.y;

        window.selectedNodeId = id;
        refreshGraph();
      };
    });
  }

  function bindSvgEvents() {
    const svg = el.svg();
    if (!svg) return;

    svg.querySelectorAll(".edge-hit").forEach(elHit => {
      elHit.onclick = () => {
        window.selectedEdgeKey = elHit.dataset.edgeKey;
        refreshGraph();
      };
    });
  }

  function setupViewportInteractions() {
    const v = el.viewport();
    if (!v) return;

    v.onwheel = (e) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.08 : 1 / 1.08, e.clientX, e.clientY);
    };

    v.onpointerdown = (e) => {
      if (e.target.closest(".node")) return;
      state.interaction.isPanning = true;
      state.interaction.panMouseX = e.clientX;
      state.interaction.panMouseY = e.clientY;
      state.interaction.panStartX = window.viewportState.x;
      state.interaction.panStartY = window.viewportState.y;
    };

    v.onpointermove = (e) => {
      if (state.interaction.dragNodeId) {
        const node = window.getNodeById?.(state.interaction.dragNodeId);
        if (!node) return;

        const dx =
          (e.clientX - state.interaction.dragStartMouseX) /
          window.viewportState.scale;

        const dy =
          (e.clientY - state.interaction.dragStartMouseY) /
          window.viewportState.scale;

        node.x = state.interaction.dragStartNodeX + dx;
        node.y = state.interaction.dragStartNodeY + dy;

        refreshGraph();
        return;
      }

      if (state.interaction.isPanning) {
        window.viewportState.x =
          state.interaction.panStartX +
          (e.clientX - state.interaction.panMouseX);

        window.viewportState.y =
          state.interaction.panStartY +
          (e.clientY - state.interaction.panMouseY);

        applyViewportTransform();
      }
    };

    v.onpointerup = () => {
      state.interaction.dragNodeId = null;
      state.interaction.isPanning = false;
    };
  }

  // 🔥 IMPORTANT BOOT FIX
  function boot() {
    applyViewportTransform();

    if (window.graphData?.nodes?.length) {
      refreshGraph();
    }

    window.setTimeout(() => {
      refreshGraph();
    }, 50);
  }

  Object.assign(window, {
    refreshGraph,
    zoomBy,
    fitToGraph: () => {},
    resetView: () => {},
    setupViewportInteractions
  });

  window.addEventListener("DOMContentLoaded", boot);
})();```
