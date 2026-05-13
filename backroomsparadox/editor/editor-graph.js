(function () {
  "use strict";

  console.log("[editor-graph] booting");

  const isMobile = () => window.innerWidth <= 700;

  const state = {
    interaction:
      window.interaction || {
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

  window.interaction =
    state.interaction;

  const el = {
    viewport: () =>
      document.getElementById(
        "graphViewport"
      ),

    canvas: () =>
      document.getElementById(
        "graphScene"
      ),

    svg: () =>
      document.getElementById(
        "graphSvg"
      ),

    nodes: () =>
      document.getElementById(
        "graphNodes"
      )
  };

  const clamp = (
    v,
    min,
    max
  ) =>
    Math.min(
      Math.max(v, min),
      max
    );

  function getVP() {
    if (!window.viewportState) {
      console.warn(
        "[editor-graph] viewportState missing, creating default"
      );

      window.viewportState = {
        x: 80,
        y: 80,
        scale: 1
      };
    }

    return window.viewportState;
  }

  function rect() {
    const v = el.viewport();

    if (!v) {
      console.warn(
        "[editor-graph] graphViewport missing"
      );

      return {
        left: 0,
        top: 0,
        width: 0,
        height: 0
      };
    }

    return v.getBoundingClientRect();
  }

  function offset() {
    const c = el.canvas();

    return {
      x: Number(
        c?.dataset?.sceneMinX || 0
      ),

      y: Number(
        c?.dataset?.sceneMinY || 0
      )
    };
  }

  function applyTransform() {
    const c = el.canvas();

    if (!c) {
      console.warn(
        "[editor-graph] graphScene missing"
      );

      return;
    }

    const vp = getVP();

    c.style.transform =
      `translate(${vp.x}px, ${vp.y}px) scale(${vp.scale})`;

    c.style.transformOrigin =
      "0 0";

    console.log(
      "[applyTransform]",
      vp
    );
  }

  function sceneFromClient(x, y) {
    const r = rect();
    const o = offset();
    const vp = getVP();

    return {
      x:
        (x -
          r.left -
          vp.x) /
          vp.scale +
        o.x,

      y:
        (y -
          r.top -
          vp.y) /
          vp.scale +
        o.y
    };
  }

  function syncSize() {
    const c = el.canvas();
    const svg = el.svg();
    const nodes = el.nodes();

    if (
      !c ||
      !svg ||
      !nodes
    ) {
      console.warn(
        "[syncSize] missing elements"
      );

      return;
    }

    if (!window.graphData) {
      console.warn(
        "[syncSize] graphData missing"
      );

      return;
    }

    const ns =
      window.graphData.nodes || [];

    let minX = 0;
    let minY = 0;
    let maxX = 1000;
    let maxY = 600;

    if (ns.length) {
      minX = Math.min(
        ...ns.map(
          (n) => n.x || 0
        )
      );

      minY = Math.min(
        ...ns.map(
          (n) => n.y || 0
        )
      );

      maxX = Math.max(
        ...ns.map(
          (n) => n.x || 0
        )
      );

      maxY = Math.max(
        ...ns.map(
          (n) => n.y || 0
        )
      );
    }

    const pad =
      isMobile()
        ? 240
        : 360;

    const w = Math.max(
      1600,
      maxX -
        minX +
        pad * 2
    );

    const h = Math.max(
      1100,
      maxY -
        minY +
        pad * 2
    );

    c.dataset.sceneMinX =
      String(minX - pad);

    c.dataset.sceneMinY =
      String(minY - pad);

    Object.assign(c.style, {
      width: w + "px",
      height: h + "px"
    });

    svg.setAttribute(
      "width",
      w
    );

    svg.setAttribute(
      "height",
      h
    );

    svg.setAttribute(
      "viewBox",
      `0 0 ${w} ${h}`
    );

    nodes.style.width =
      w + "px";

    nodes.style.height =
      h + "px";

    console.log(
      "[syncSize]",
      {
        width: w,
        height: h,
        minX,
        minY,
        maxX,
        maxY
      }
    );
  }

  function zoomBy(
    factor,
    cx,
    cy
  ) {
    const vp = getVP();
    const r = rect();

    const x =
      cx ??
      r.left +
        r.width / 2;

    const y =
      cy ??
      r.top +
        r.height / 2;

    const before =
      sceneFromClient(
        x,
        y
      );

    vp.scale = clamp(
      vp.scale * factor,
      window.MIN_ZOOM || 0.2,
      window.MAX_ZOOM ||
        (isMobile()
          ? 1.8
          : 2.4)
    );

    vp.x =
      x -
      r.left -
      before.x * vp.scale;

    vp.y =
      y -
      r.top -
      before.y * vp.scale;

    console.log(
      "[zoomBy]",
      {
        factor,
        scale: vp.scale
      }
    );

    applyTransform();
  }

  function buildEdge(edge) {
    if (!edge) return null;

    const from =
      window.getNodePortPosition?.(
        edge.from,
        "output"
      );

    const to =
      window.getNodePortPosition?.(
        edge.to,
        "input"
      );

    if (!from || !to) {
      console.warn(
        "[buildEdge] invalid edge",
        edge
      );

      return null;
    }

    const wp =
      window.normalizeWaypoints?.(
        edge.waypoints
      ) || [];

    return [from, ...wp, to];
  }

  function mid(points) {
    if (
      !points ||
      !points.length
    ) {
      return {
        x: 0,
        y: 0
      };
    }

    return points[
      Math.floor(
        points.length / 2
      )
    ];
  }

  function path(points) {
    if (
      !points ||
      !points.length
    ) {
      return "";
    }

    let d =
      `M ${points[0].x} ${points[0].y}`;

    for (
      let i = 1;
      i < points.length;
      i++
    ) {
      const a =
        points[i - 1];

      const b =
        points[i];

      const c = 60;

      d +=
        ` C ${a.x + c} ${a.y}, ` +
        `${b.x - c} ${b.y}, ` +
        `${b.x} ${b.y}`;
    }

    return d;
  }

  function refresh() {
    const nodesEl =
      el.nodes();

    const svg = el.svg();

    if (
      !nodesEl ||
      !svg
    ) {
      console.warn(
        "[refresh] missing graph elements"
      );

      return;
    }

    if (!window.graphData) {
      console.warn(
        "[refresh] graphData missing"
      );

      return;
    }

    console.log(
      "[refreshGraph] rendering"
    );

    syncSize();
    applyTransform();

    const off = offset();

    const nodes =
      window.graphData.nodes || [];

    const edges =
      window.graphData.edges || [];

    nodesEl.innerHTML =
      nodes
        .map((n) => {
          const x =
            (n.x || 0) -
            off.x;

          const y =
            (n.y || 0) -
            off.y;

          return `
          <div
            class="node ${n.type || ""} ${
              n.id ===
              window.selectedNodeId
                ? "selected"
                : ""
            }"

            data-node-id="${n.id}"

            style="
              left:${x}px;
              top:${y}px;
            "
          >
            <div class="nodeTitle">
              ${n.label || "Unnamed"}
            </div>
          </div>
        `;
        })
        .join("");

    const out = [];

    for (const edge of edges) {
      const pts =
        buildEdge(edge);

      if (!pts) continue;

      const d =
        path(pts);

      const m =
        mid(pts);

      const key =
        window.edgeKeyOf?.(
          edge
        ) ||
        `${edge.from}-${edge.to}`;

      const edgeClass =
        window.getTypeMeta?.(
          window.getNodeById?.(
            edge.from
          )?.type
        )?.edgeClass ||
        "edge";

      out.push(`
        <path
          d="${d}"
          class="edge ${edgeClass}"
          fill="none"
        ></path>
      `);

      out.push(`
        <path
          d="${d}"
          data-edge-key="${key}"
          class="edge-hit"
          fill="none"
          stroke="transparent"
          stroke-width="30"
        ></path>
      `);

      if (edge.label) {
        out.push(`
          <text
            x="${m.x}"
            y="${m.y}"
            text-anchor="middle"
            class="edgeLabel"
          >
            ${edge.label}
          </text>
        `);
      }
    }

    svg.innerHTML =
      out.join("");

    bindNodes();
    bindEdges();

    console.log(
      "[refreshGraph] complete",
      {
        nodes: nodes.length,
        edges: edges.length
      }
    );
  }

  function bindNodes() {
    const all =
      el.nodes()?.querySelectorAll(
        ".node"
      ) || [];

    all.forEach((nodeEl) => {
      const id =
        nodeEl.dataset.nodeId;

      nodeEl.onpointerdown =
        (e) => {

          e.stopPropagation();

          console.log(
            "[node:pointerdown]",
            id
          );

          state.interaction.dragNodeId =
            id;

          const node =
            window.getNodeById?.(
              id
            );

          if (!node) {
            console.warn(
              "[bindNodes] node missing",
              id
            );

            return;
          }

          state.interaction.dragStartMouseX =
            e.clientX;

          state.interaction.dragStartMouseY =
            e.clientY;

          state.interaction.dragStartNodeX =
            node.x;

          state.interaction.dragStartNodeY =
            node.y;

          window.selectedNodeId =
            id;

          if (
            window.refreshSidebar
          ) {
            window.refreshSidebar();
          }
        };

      nodeEl.onclick = () => {
        console.log(
          "[node:select]",
          id
        );

        window.selectedNodeId =
          id;

        if (
          window.refreshAllUI
        ) {
          window.refreshAllUI();
        }
      };
    });
  }

  function bindEdges() {
    const edges =
      el.svg()?.querySelectorAll(
        ".edge-hit"
      ) || [];

    edges.forEach((edgeEl) => {
      edgeEl.onclick = () => {
        const key =
          edgeEl.dataset
            .edgeKey;

        console.log(
          "[edge:select]",
          key
        );

        window.selectedEdgeKey =
          key;

        refresh();
      };
    });
  }

  function setup() {
    const v =
      el.viewport();

    if (!v) {
      console.warn(
        "[setup] viewport missing"
      );

      return;
    }

    console.log(
      "[setup] viewport interactions"
    );

    v.onwheel = (e) => {
      e.preventDefault();

      zoomBy(
        e.deltaY < 0
          ? 1.08
          : 1 / 1.08,
        e.clientX,
        e.clientY
      );
    };

    v.onpointerdown =
      (e) => {

        if (
          e.target.closest(
            ".node"
          )
        ) {
          return;
        }

        state.interaction.isPanning =
          true;

        state.interaction.panMouseX =
          e.clientX;

        state.interaction.panMouseY =
          e.clientY;

        const vp =
          getVP();

        state.interaction.panStartX =
          vp.x;

        state.interaction.panStartY =
          vp.y;

        console.log(
          "[pan:start]"
        );
      };

    v.onpointermove =
      (e) => {

        const vp =
          getVP();

        if (
          state.interaction
            .dragNodeId
        ) {
          const node =
            window.getNodeById?.(
              state.interaction
                .dragNodeId
            );

          if (!node) return;

          const dx =
            (e.clientX -
              state.interaction
                .dragStartMouseX) /
            vp.scale;

          const dy =
            (e.clientY -
              state.interaction
                .dragStartMouseY) /
            vp.scale;

          node.x =
            state.interaction
              .dragStartNodeX + dx;

          node.y =
            state.interaction
              .dragStartNodeY + dy;

          node.updatedAt =
            Date.now();

          refresh();

          return;
        }

        if (
          state.interaction
            .isPanning
        ) {
          vp.x =
            state.interaction
              .panStartX +
            (e.clientX -
              state.interaction
                .panMouseX);

          vp.y =
            state.interaction
              .panStartY +
            (e.clientY -
              state.interaction
                .panMouseY);

          applyTransform();
        }
      };

    v.onpointerup = () => {
      console.log(
        "[pointerup]"
      );

      state.interaction.dragNodeId =
        null;

      state.interaction.isPanning =
        false;
    };

    v.onpointercancel =
      v.onpointerup;
  }

  window.zoomBy = zoomBy;

  window.refreshGraph =
    refresh;

  window.setupViewportInteractions =
    setup;

  window.graphViewportRect =
    rect;

  window.scenePointFromClient =
    sceneFromClient;

  window.applyViewportTransform =
    applyTransform;

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      console.log(
        "[editor-graph] DOM ready"
      );

      applyTransform();
      setup();
      refresh();

      console.log(
        "[editor-graph] ready"
      );
    }
  );
})();
