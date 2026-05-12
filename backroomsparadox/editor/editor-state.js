(function () {
  "use strict";

  // ✅ HARD SAFE DEFAULT (never allow undefined graph)
  window.graphData = window.graphData ?? { nodes: [], edges: [] };

  window.selectedNodeId ??= null;
  window.selectedEdgeKey ??= null;
  window.currentSearch ??= "";

  // ----------------------------
  // TYPE SYSTEM (safe + stable)
  // ----------------------------

  function normalizeType(type) {
    const v = String(type || "").toLowerCase().trim();

    switch (v) {
      case "stable":
      case "start":
        return "stable";

      case "dangerous":
      case "progression":
        return "dangerous";

      case "corrupted":
      case "danger":
        return "corrupted";

      case "anomalous":
      case "weird":
        return "anomalous";

      default:
        return "stable";
    }
  }

  function getTypeClass(type) {
    const t = normalizeType(type);

    const map = {
      stable: "stable",
      dangerous: "dangerous",
      corrupted: "corrupted",
      anomalous: "anomalous"
    };

    return map[t] || "stable";
  }

  // ----------------------------
  // EDGE + NODE HELPERS
  // ----------------------------

  function edgeKeyOf(edge) {
    if (!edge) return "";

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

  // ----------------------------
  // CORE NORMALIZATION (FIXED)
  // ----------------------------

  function normalizeData(raw) {
    const nodesRaw = Array.isArray(raw?.nodes) ? raw.nodes : [];
    const edgesRaw = Array.isArray(raw?.edges) ? raw.edges : [];

    const usedIds = new Set();
    const idMap = new Map();

    const nodes = [];

    // ---- NODES (stable mapping, no double remap bugs)
    for (const n of nodesRaw) {
      const baseId =
        n?.id && String(n.id).trim()
          ? String(n.id).trim()
          : slugify(n?.label);

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

      idMap.set(n?.id, id);
      idMap.set(node.label, id);
      idMap.set(baseId, id);
    }

    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = [];
    const seen = new Set();

    // ---- EDGES (strict validation, no silent corruption)
    for (const e of edgesRaw) {
      const from = idMap.get(e?.from);
      const to = idMap.get(e?.to);

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

  // ----------------------------
  // SAFE ACCESSORS
  // ----------------------------

  const getNodeById = (id) =>
    window.graphData.nodes.find(n => n.id === String(id)) || null;

  const getEdgeByKey = (key) =>
    window.graphData.edges.find(e => edgeKeyOf(e) === key) || null;

  // ----------------------------
  // EXPORTS
  // ----------------------------

  window.graphData ??= { nodes: [], edges: [] };

  window.normalizeType = normalizeType;
  window.getTypeClass = getTypeClass;

  window.edgeKeyOf = edgeKeyOf;
  window.normalizeWaypoints = normalizeWaypoints;

  window.normalizeData = normalizeData;

  window.getNodeById = getNodeById;
  window.getEdgeByKey = getEdgeByKey;
})();
