(function () {
  "use strict";

  window.graphData ||= { nodes: [], edges: [], metadata: {} };

  window.selectedNodeId ??= null;
  window.selectedEdgeKey ??= null;
  window.currentSearch ??= "";

  // ----------------------------
  // EDGE KEY
  // ----------------------------

  function edgeKeyOf(edge) {
    if (!edge) return "";
    return `${edge.from ?? ""}|${edge.to ?? ""}|${edge.label ?? ""}|${edge.oneWay ? 1 : 0}`;
  }

  // ----------------------------
  // WAYPOINTS
  // ----------------------------

  function normalizeWaypoints(points) {
    if (!Array.isArray(points)) return [];

    const out = [];
    for (const p of points) {
      const x = Number(p?.x);
      const y = Number(p?.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        out.push({ x, y });
      }
    }
    return out;
  }

  // ----------------------------
  // ID HELPERS
  // ----------------------------

  function slugify(str) {
    return String(str || "node")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "node";
  }

  function makeUniqueId(base, used) {
    let id = String(base || "node");
    let i = 2;
    while (used.has(id)) id = `${base}-${i++}`;
    used.add(id);
    return id;
  }

  // ----------------------------
  // NORMALIZATION
  // ----------------------------

  function normalizeData(raw) {
    const nodesRaw = Array.isArray(raw?.nodes) ? raw.nodes : [];
    const edgesRaw = Array.isArray(raw?.edges) ? raw.edges : [];

    const used = new Set();
    const nodes = [];
    const idMap = new Map();

    for (const n of nodesRaw) {
      const base = n?.id?.trim() || slugify(n?.label);
      const id = makeUniqueId(base, used);

      const node = {
        id,
        label: String(n?.label || "Unnamed"),
        subtitle: String(n?.subtitle || ""),
        description: String(n?.description || ""),
        notes: String(n?.notes || ""),
        x: Number(n?.x) || 0,
        y: Number(n?.y) || 0,
        type: window.normalizeType?.(n?.type) || "stable",
        status: window.normalizeStatus?.(n?.status) || "draft",
        tags: Array.isArray(n?.tags) ? n.tags.map(String) : [],
        createdAt: Number(n?.createdAt) || Date.now(),
        updatedAt: Number(n?.updatedAt) || Date.now()
      };

      nodes.push(node);
      idMap.set(n?.id, id);
    }

    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = [];
    const seen = new Set();

    for (const e of edgesRaw) {
      const from = idMap.get(e?.from);
      const to = idMap.get(e?.to);
      if (!from || !to || from === to) continue;

      const edge = {
        from,
        to,
        label: String(e?.label || ""),
        oneWay: e?.oneWay !== false,
        waypoints: normalizeWaypoints(e?.waypoints)
      };

      const key = edgeKeyOf(edge);
      if (seen.has(key)) continue;

      seen.add(key);
      edges.push(edge);
    }

    return { nodes, edges };
  }

  // ----------------------------
  // ACCESSORS
  // ----------------------------

  const getNodeById = (id) =>
    window.graphData.nodes.find(n => n.id === String(id)) || null;

  const getEdgeByKey = (key) =>
    window.graphData.edges.find(e => edgeKeyOf(e) === key) || null;

  const getSelectedNode = () =>
    getNodeById(window.selectedNodeId);

  const getSelectedEdge = () =>
    getEdgeByKey(window.selectedEdgeKey);

  const getSerializableGraphData = () =>
    JSON.parse(JSON.stringify(window.graphData));

  // ----------------------------
  // EXPORT
  // ----------------------------

  Object.assign(window, {
    edgeKeyOf,
    normalizeWaypoints,
    normalizeData,
    getNodeById,
    getEdgeByKey,
    getSelectedNode,
    getSelectedEdge,
    getSerializableGraphData
  });
})();
