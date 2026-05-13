(function () {
  "use strict";

  const isMobile = () => window.innerWidth <= 700;

  const state = {
    interaction: {
      isPanning: false,
      dragNodeId: null,
      dragStartMouseX: 0,
      dragStartMouseY: 0,
      dragStartNodeX: 0,
      dragStartNodeY: 0,
      panMouseX: 0,
      panMouseY: 0,
      panStartX: 0,
      panStartY: 0,
      dragStarted: false
    }
  };

  const el = {
    viewport: () => document.getElementById("graphViewport"),
    canvas: () => document.getElementById("graphScene"),
    svg: () => document.getElementById("graphSvg"),
    nodes: () => document.getElementById("graphNodes")
  };

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  const getVP = () =>
    window.viewportState || (window.viewportState = { x: 0, y: 0, zoom: 1 });

  function rect() {
    return el.viewport()?.getBoundingClientRect() || { left: 0, top: 0, width: 0, height: 0 };
  }

  function applyTransform() {
    const c = el.canvas();
    if (!c) return;

    const vp = getVP();
    c.style.transform = `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`;
    c.style.transformOrigin = "0 0";
  }

  function sceneFromClient(x, y) {
    const r = rect();
    const vp = getVP();

    return {
      x: (x - r.left - vp.x) / vp.zoom,
      y: (y - r.top - vp.y) / vp.zoom
    };
  }

  function zoomBy(factor, cx, cy) {
    const vp = getVP();
    const r = rect();

    const x = cx ?? r.left + r.width / 2;
    const y = cy ?? r.top + r.height / 2;

    const before = sceneFromClient(x, y);

    vp.zoom = clamp(vp.zoom * factor, 0.2, isMobile() ? 1.8 : 2.4);

    vp.x = x - r.left - before.x * vp.zoom;
    vp.y = y - r.top - before.y * vp.zoom;

    applyTransform();
  }

  function refresh() {
    const nodesEl = el.nodes();
    const svg = el.svg();
    if (!nodesEl || !svg || !window.graphData) return;

    const nodes = window.graphData.nodes;
    const edges = window.graphData.edges;

    nodesEl.innerHTML = nodes.map(n => `
      <div class="node ${n.id === window.selectedNodeId ? "selected" : ""}"
           data-node-id="${n.id}"
           style="left:${n.x}px; top:${n.y}px;">
        <div class="nodeTitle">${n.label}</div>
      </div>
    `).join("");

    const out = [];

    for (const e of edges) {
      const from = window.getNodePortPosition?.(e.from, "output");
      const to = window.getNodePortPosition?.(e.to, "input");
      if (!from || !to) continue;

      const d = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;

      const key = window.edgeKeyOf(e);

      out.push(`<path d="${d}" class="edge"></path>`);
      out.push(`<path d="${d}" data-edge-key="${key}" class="edge-hit" stroke="transparent" stroke-width="30"></path>`);
    }

    svg.innerHTML = out.join("");

    bind();
  }

  function bind() {
    el.nodes()?.querySelectorAll(".node").forEach(nodeEl => {
      nodeEl.onpointerdown = (e) => {
        const id = nodeEl.dataset.nodeId;
        const n = window.getNodeById?.(id);
        if (!n) return;

        // ✅ FIX: snapshot ONCE at drag start
        if (!state.interaction.dragStarted && window.pushUndoState) {
          window.pushUndoState("Move node");
          state.interaction.dragStarted = true;
        }

        state.interaction.dragNodeId = id;

        state.interaction.dragStartMouseX = e.clientX;
        state.interaction.dragStartMouseY = e.clientY;

        state.interaction.dragStartNodeX = n.x;
        state.interaction.dragStartNodeY = n.y;

        window.selectedNodeId = id;
      };
    });

    el.svg()?.querySelectorAll(".edge-hit").forEach(e => {
      e.onclick = () => {
        window.selectedEdgeKey = e.dataset.edgeKey;
        refresh();
      };
    });
  }

  function setup() {
    const v = el.viewport();
    if (!v) return;

    v.onwheel = (e) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.08 : 1 / 1.08, e.clientX, e.clientY);
    };

    v.onpointermove = (e) => {
      const vp = getVP();

      if (state.interaction.dragNodeId) {
        const n = window.getNodeById?.(state.interaction.dragNodeId);
        if (!n) return;

        const dx = (e.clientX - state.interaction.dragStartMouseX) / vp.zoom;
        const dy = (e.clientY - state.interaction.dragStartMouseY) / vp.zoom;

        n.x = state.interaction.dragStartNodeX + dx;
        n.y = state.interaction.dragStartNodeY + dy;

        refresh();
      }
    };

    v.onpointerup = () => {
      state.interaction.dragNodeId = null;
      state.interaction.dragStarted = false;
      state.interaction.isPanning = false;
    };
  }

  window.zoomBy = zoomBy;
  window.refreshGraph = refresh;
  window.setupViewportInteractions = setup;

  window.addEventListener("DOMContentLoaded", () => {
    applyTransform();
    setup();
    refresh();
  });
})();
