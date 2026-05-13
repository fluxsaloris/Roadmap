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

  const getVP = () =>
    window.viewportState || (window.viewportState = { x: 80, y: 80, scale: 1 });

  function rect() {
    const v = el.viewport();
    return v?.getBoundingClientRect() || { left: 0, top: 0, width: 0, height: 0 };
  }

  function offset() {
    const c = el.canvas();
    return {
      x: Number(c?.dataset?.sceneMinX || 0),
      y: Number(c?.dataset?.sceneMinY || 0)
    };
  }

  function applyTransform() {
    const c = el.canvas();
    if (!c) return;

    const vp = getVP();
    c.style.transform = `translate(${vp.x}px, ${vp.y}px) scale(${vp.scale})`;
    c.style.transformOrigin = "0 0";
  }

  function sceneFromClient(x, y) {
    const r = rect();
    const o = offset();
    const vp = getVP();

    return {
      x: (x - r.left - vp.x) / vp.scale + o.x,
      y: (y - r.top - vp.y) / vp.scale + o.y
    };
  }

  function syncSize() {
    const c = el.canvas();
    const svg = el.svg();
    const nodes = el.nodes();
    if (!c || !svg || !nodes || !window.graphData) return;

    const ns = window.graphData.nodes || [];

    let minX = 0, minY = 0, maxX = 1000, maxY = 600;

    if (ns.length) {
      minX = Math.min(...ns.map(n => n.x || 0));
      minY = Math.min(...ns.map(n => n.y || 0));
      maxX = Math.max(...ns.map(n => n.x || 0));
      maxY = Math.max(...ns.map(n => n.y || 0));
    }

    const pad = isMobile() ? 240 : 360;

    const w = Math.max(1600, maxX - minX + pad * 2);
    const h = Math.max(1100, maxY - minY + pad * 2);

    c.dataset.sceneMinX = String(minX - pad);
    c.dataset.sceneMinY = String(minY - pad);

    Object.assign(c.style, { width: w + "px", height: h + "px" });
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    nodes.style.width = w + "px";
    nodes.style.height = h + "px";
  }

  function zoomBy(factor, cx, cy) {
    const vp = getVP();
    const r = rect();

    const x = cx ?? r.left + r.width / 2;
    const y = cy ?? r.top + r.height / 2;

    const before = sceneFromClient(x, y);

    vp.scale = clamp(vp.scale * factor, 0.22, isMobile() ? 1.8 : 2.4);

    vp.x = x - r.left - before.x * vp.scale;
    vp.y = y - r.top - before.y * vp.scale;

    applyTransform();
  }

  function buildEdge(e) {
    const from = window.getNodePortPosition?.(e.from, "output");
    const to = window.getNodePortPosition?.(e.to, "input");
    if (!from || !to) return null;

    const wp = window.normalizeWaypoints?.(e.waypoints) || [];
    return [from, ...wp, to];
  }

  function mid(points) {
    if (!points?.length) return { x: 0, y: 0 };
    return points[Math.floor(points.length / 2)];
  }

  function path(points) {
    if (!points?.length) return "";
    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const c = 60;
      d += ` C ${a.x + c} ${a.y}, ${b.x - c} ${b.y}, ${b.x} ${b.y}`;
    }
    return d;
  }

  function refresh() {
    const nodesEl = el.nodes();
    const svg = el.svg();
    if (!nodesEl || !svg || !window.graphData) return;

    syncSize();
    applyTransform();

    const vp = getVP();
    const off = offset();

    const nodes = window.graphData.nodes || [];
    const edges = window.graphData.edges || [];

    nodesEl.innerHTML = nodes.map(n => {
      const x = (n.x || 0) - off.x;
      const y = (n.y || 0) - off.y;

      return `
        <div class="node ${n.id === window.selectedNodeId ? "selected" : ""}"
             data-node-id="${n.id}"
             style="left:${x}px; top:${y}px;">
          <div class="nodeTitle">${n.label || "Unnamed"}</div>
        </div>
      `;
    }).join("");

    const out = [];

    for (const e of edges) {
      const pts = buildEdge(e);
      if (!pts) continue;

      const d = path(pts);
      const m = mid(pts);
      const key = window.edgeKeyOf?.(e) || `${e.from}-${e.to}`;

      out.push(`<path d="${d}" class="edge"></path>`);
      out.push(`
        <path d="${d}" data-edge-key="${key}" class="edge-hit"
              stroke="transparent" stroke-width="30"></path>
      `);

      if (e.label) {
        out.push(`<text x="${m.x}" y="${m.y}" text-anchor="middle">${e.label}</text>`);
      }
    }

    svg.innerHTML = out.join("");

    bindNodes();
    bindEdges();
  }

  function bindNodes() {
    el.nodes()?.querySelectorAll(".node").forEach(nodeEl => {
      const id = nodeEl.dataset.nodeId;

      nodeEl.onpointerdown = (e) => {
        state.interaction.dragNodeId = id;

        const n = window.getNodeById?.(id);
        if (!n) return;

        state.interaction.dragStartMouseX = e.clientX;
        state.interaction.dragStartMouseY = e.clientY;
        state.interaction.dragStartNodeX = n.x;
        state.interaction.dragStartNodeY = n.y;

        window.selectedNodeId = id;
      };
    });
  }

  function bindEdges() {
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

    v.onpointerdown = (e) => {
      if (e.target.closest(".node")) return;

      state.interaction.isPanning = true;
      state.interaction.panMouseX = e.clientX;
      state.interaction.panMouseY = e.clientY;

      const vp = getVP();
      state.interaction.panStartX = vp.x;
      state.interaction.panStartY = vp.y;
    };

    v.onpointermove = (e) => {
      const vp = getVP();

      if (state.interaction.dragNodeId) {
        const n = window.getNodeById?.(state.interaction.dragNodeId);
        if (!n) return;

        const dx = (e.clientX - state.interaction.dragStartMouseX) / vp.scale;
        const dy = (e.clientY - state.interaction.dragStartMouseY) / vp.scale;

        n.x = state.interaction.dragStartNodeX + dx;
        n.y = state.interaction.dragStartNodeY + dy;

        refresh();
        return;
      }

      if (state.interaction.isPanning) {
        vp.x = state.interaction.panStartX + (e.clientX - state.interaction.panMouseX);
        vp.y = state.interaction.panStartY + (e.clientY - state.interaction.panMouseY);
        applyTransform();
      }
    };

    v.onpointerup = () => {
      state.interaction.dragNodeId = null;
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
