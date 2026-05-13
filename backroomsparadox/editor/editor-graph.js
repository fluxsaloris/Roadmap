(function () {
  "use strict";

  const isMobile = () => window.innerWidth <= 700;

  const el = {
    viewport: () => document.getElementById("graphViewport"),
    canvas: () => document.getElementById("graphScene"),
    svg: () => document.getElementById("graphSvg"),
    nodes: () => document.getElementById("graphNodes")
  };

  const getVP = () =>
    window.viewportState || (window.viewportState = { x: 80, y: 80, scale: 1 });

  function rect() {
    return el.viewport()?.getBoundingClientRect() || { left: 0, top: 0, width: 0, height: 0 };
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

  // REQUIRED EXPORTS FOR OTHER MODULES
  window.graphViewportRect = rect;
  window.scenePointFromClient = sceneFromClient;

  let raf = false;
  function requestRefresh() {
    if (raf) return;
    raf = true;
    requestAnimationFrame(() => {
      raf = false;
      refresh();
    });
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

  function refresh() {
    const nodesEl = el.nodes();
    const svg = el.svg();
    if (!nodesEl || !svg || !window.graphData) return;

    syncSize();
    applyTransform();

    const off = offset();
    const nodes = window.graphData.nodes || [];
    const edges = window.graphData.edges || [];

    nodesEl.innerHTML = nodes.map(n => `
      <div class="node ${n.id === window.selectedNodeId ? "selected" : ""}"
           data-node-id="${n.id}"
           style="left:${(n.x || 0) - off.x}px; top:${(n.y || 0) - off.y}px;">
        <div class="nodeTitle">${n.label || "Unnamed"}</div>
      </div>
    `).join("");

    const out = [];

    for (const e of edges) {
      const from = window.getNodePortPosition?.(e.from, "output");
      const to = window.getNodePortPosition?.(e.to, "input");
      if (!from || !to) continue;

      const d = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;

      out.push(`<path d="${d}" class="edge"></path>`);
      out.push(`<path d="${d}" data-edge-key="${window.edgeKeyOf(e)}" class="edge-hit" stroke="transparent" stroke-width="30"></path>`);
    }

    svg.innerHTML = out.join("");

    bindNodes();
    bindEdges();
  }

  function bindNodes() {
    el.nodes()?.querySelectorAll(".node").forEach(nodeEl => {
      const id = nodeEl.dataset.nodeId;

      nodeEl.onpointerdown = (e) => {
        const n = window.getNodeById?.(id);
        if (!n) return;

        window._drag = {
          id,
          startX: e.clientX,
          startY: e.clientY,
          nodeX: n.x,
          nodeY: n.y
        };

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

    v.onpointermove = (e) => {
      const vp = getVP();

      if (window._drag) {
        const n = window.getNodeById?.(window._drag.id);
        if (!n) return;

        const dx = (e.clientX - window._drag.startX) / vp.scale;
        const dy = (e.clientY - window._drag.startY) / vp.scale;

        n.x = window._drag.nodeX + dx;
        n.y = window._drag.nodeY + dy;

        requestRefresh();
      }
    };

    v.onpointerup = () => {
      window._drag = null;
    };
  }

  window.refreshGraph = refresh;
  window.setupViewportInteractions = setup;

  window.addEventListener("DOMContentLoaded", () => {
    applyTransform();
    setup();
    refresh();
  });
})();
