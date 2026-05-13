(function () {
  "use strict";

  window.graphData ??= { nodes: [], edges: [] };

  window.selectedNodeId ??= null;
  window.selectedEdgeKey ??= null;
  window.currentSearch ??= "";

  function normalizeType(type) {
    const v = String(type || "").toLowerCase().trim();

    if (["stable", "start"].includes(v)) return "stable";
    if (["dangerous", "progression"].includes(v)) return "dangerous";
    if (["corrupted", "danger"].includes(v)) return "corrupted";
    if (["anomalous", "weird"].includes(v)) return "anomalous";

    return "stable";
  }

  function getTypeClass(type) {
    return normalizeType(type);
  }

  function edgeKeyOf(edge) {
    return `${edge.from ?? ""}|${edge.to ?? ""}|${edge.label ?? ""}|${edge.oneWay ? 1 : 0}`;
  }

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

  function slugify(str) {
    return String(str || "node")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "node";
  }

  function makeUniqueId(base, used) {
    let id = String(base || "node");
    let i = 2;

    while (used.has(id)) {
      id = `${base}-${i++}`;
    }

    used.add(id);
    return id;
  }

  function normalizeData(raw) {
    const nodesRaw = Array.isArray(raw?.nodes) ? raw.nodes : [];
    const edgesRaw = Array.isArray(raw?.edges) ? raw.edges : [];

    const usedIds = new Set();
    const idMap = new Map();

    const nodes = [];

    // ---------------- NODES ----------------
    for (const n of nodesRaw) {
      const baseId =
        (typeof n?.id === "string" && n.id.trim()) ||
        slugify(n?.label);

      const id = makeUniqueId(baseId, usedIds);

      const node = {
        id,
        label: String(n?.label || "Unnamed"),
        subtitle: String(n?.subtitle || ""),
        description: String(n?.description || ""),
        notes: String(n?.notes || ""),
        x: Number(n?.x) || 0,
        y: Number(n?.y) || 0,
        type: normalizeType(n?.type),
        status: String(n?.status || "draft"),
        tags: Array.isArray(n?.tags) ? n.tags.map(String) : []
      };

      nodes.push(node);

      // 🔥 IMPORTANT: multiple mappings for robustness
      if (n?.id) idMap.set(String(n.id), id);
      if (n?.label) idMap.set(String(n.label), id);
      idMap.set(baseId, id);
    }

    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = [];
    const seen = new Set();

    // ---------------- EDGES ----------------
    for (const e of edgesRaw) {
      const from = idMap.get(String(e?.from));
      const to = idMap.get(String(e?.to));

      if (!from || !to) continue;
      if (!nodeIds.has(from) || !nodeIds.has(to)) continue;
      if (from === to) continue;

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

  function getNodeById(id) {
    return window.graphData.nodes.find(n => n.id === String(id)) || null;
  }

  function getEdgeByKey(key) {
    return window.graphData.edges.find(e => edgeKeyOf(e) === key) || null;
  }

  window.normalizeType = normalizeType;
  window.getTypeClass = getTypeClass;
  window.edgeKeyOf = edgeKeyOf;
  window.normalizeWaypoints = normalizeWaypoints;
  window.normalizeData = normalizeData;
  window.getNodeById = getNodeById;
  window.getEdgeByKey = getEdgeByKey;
})();
