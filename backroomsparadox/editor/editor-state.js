(function () {
  "use strict";

  // ✅ HARD GUARANTEE: always exists BEFORE anything else runs
  window.graphData = window.graphData || { nodes: [], edges: [] };

  const setDefault = (obj, key, value) => {
    if (typeof obj[key] === "undefined") obj[key] = value;
  };

  setDefault(window, "selectedNodeId", null);
  setDefault(window, "selectedEdgeKey", null);
  setDefault(window, "currentSearch", "");

  function normalizeType(type) {
    const v = String(type || "").trim().toLowerCase();

    if (v === "stable" || v === "start") return "stable";
    if (v === "dangerous" || v === "progression") return "dangerous";
    if (v === "corrupted" || v === "danger") return "corrupted";
    if (v === "anomalous" || v === "weird") return "anomalous";

    return "stable";
  }

  function getTypeLabel(type) {
    const key = normalizeType(type);
    return window.TYPE_META?.[key]?.label ?? "Stable";
  }

  function getTypeClass(type) {
    const key = normalizeType(type);
    return window.TYPE_META?.[key]?.className ?? "stable";
  }

  function getTypeEdgeClass(type) {
    const key = normalizeType(type);
    return window.TYPE_META?.[key]?.edgeClass ?? "edge-stable";
  }

  function cloneData(data) {
    try {
      return structuredClone ? structuredClone(data) : JSON.parse(JSON.stringify(data));
    } catch {
      return JSON.parse(JSON.stringify(data));
    }
  }

  const normalizeEdgeLabel = (label) =>
    typeof label === "string" ? label : "";

  const slugifyLabel = (label) =>
    String(label || "node")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "node";

  function makeUniqueId(base, used) {
    const root = String(base || "node").trim() || "node";

    let id = root;
    let i = 2;

    while (used.has(id)) {
      id = `${root}-${i++}`;
    }

    used.add(id);
    return id;
  }

  function edgeKeyOf(edge) {
    return `${edge.from}|${edge.to}|${edge.label || ""}|${edge.oneWay === false ? "0" : "1"}`;
  }

  function normalizeWaypoints(value) {
    if (!Array.isArray(value)) return [];

    const out = [];

    for (const p of value) {
      const x = Number(p?.x);
      const y = Number(p?.y);

      if (Number.isFinite(x) && Number.isFinite(y)) {
        out.push({ x, y });
      }
    }

    return out;
  }

  function buildNodeMapsFromRaw(rawNodes) {
    const usedIds = new Set();
    const nodes = [];
    const rawKeyToId = new Map();

    rawNodes.forEach((n, i) => {
      const label = typeof n?.label === "string" ? n.label : "Unnamed";

      const finalId = makeUniqueId(
        n?.id || slugifyLabel(label || `node-${i + 1}`),
        usedIds
      );

      const node = {
        id: finalId,
        label,
        subtitle: n?.subtitle || "",
        description: n?.description || "",
        notes: n?.notes || "",
        x: Number(n?.x) || 0,
        y: Number(n?.y) || 0,
        type: normalizeType(n?.type),
        status: n?.status || "draft",
        tags: Array.isArray(n?.tags) ? n.tags.map(String) : []
      };

      nodes.push(node);

      rawKeyToId.set(finalId, finalId);
      rawKeyToId.set(label, finalId);
      if (n?.id) rawKeyToId.set(n.id, finalId);
    });

    return { nodes, rawKeyToId };
  }

  function normalizeData(raw) {
    const rawNodes = Array.isArray(raw?.nodes) ? raw.nodes : [];
    const { nodes, rawKeyToId } = buildNodeMapsFromRaw(rawNodes);

    const validIds = new Set(nodes.map(n => n.id));
    const edges = [];
    const seen = new Set();

    for (const e of (raw?.edges || [])) {
      const from = rawKeyToId.get(e?.from);
      const to = rawKeyToId.get(e?.to);

      if (!from || !to) continue;
      if (!validIds.has(from) || !validIds.has(to)) continue;
      if (from === to) continue;

      const edge = {
        from,
        to,
        label: normalizeEdgeLabel(e.label),
        oneWay: e.oneWay !== false,
        waypoints: normalizeWaypoints(e.waypoints)
      };

      const key = edgeKeyOf(edge);
      if (seen.has(key)) continue;

      seen.add(key);
      edges.push(edge);
    }

    return { nodes, edges };
  }

  const getNodeById = (id) =>
    window.graphData.nodes.find(n => n.id === String(id)) || null;

  window.normalizeType = normalizeType;
  window.getTypeClass = getTypeClass;
  window.getTypeLabel = getTypeLabel;

  window.edgeKeyOf = edgeKeyOf;
  window.normalizeWaypoints = normalizeWaypoints;

  window.normalizeData = normalizeData;
  window.getNodeById = getNodeById;
})();
