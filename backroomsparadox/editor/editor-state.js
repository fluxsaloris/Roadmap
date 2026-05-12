(function () {
  "use strict";

  window.graphData ||= { nodes: [], edges: [] };

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
      return structuredClone
        ? structuredClone(data)
        : JSON.parse(JSON.stringify(data));
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
    return `${edge.from}|${edge.to}|${edge.label || ""}|${
      edge.oneWay === false ? "0" : "1"
    }`;
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
      const explicitId =
        n?.id != null && String(n.id).trim() !== ""
          ? String(n.id).trim()
          : null;

      const label = typeof n?.label === "string" ? n.label : "Unnamed";

      const finalId = makeUniqueId(
        explicitId || slugifyLabel(label || `node-${i + 1}`),
        usedIds
      );

      const node = {
        id: finalId,
        label,
        subtitle: typeof n?.subtitle === "string" ? n.subtitle : "",
        description: typeof n?.description === "string" ? n.description : "",
        notes: typeof n?.notes === "string" ? n.notes : "",
        x: Number(n?.x) || 0,
        y: Number(n?.y) || 0,
        type: normalizeType(n?.type),
        status: typeof n?.status === "string" ? n.status : "draft",
        tags: Array.isArray(n?.tags)
          ? n.tags.map(String)
          : []
      };

      nodes.push(node);

      rawKeyToId.set(finalId, finalId);
      rawKeyToId.set(label, finalId);
      if (explicitId) rawKeyToId.set(explicitId, finalId);
    });

    return { nodes, rawKeyToId };
  }

  function normalizeData(raw) {
    const rawNodes = Array.isArray(raw?.nodes) ? raw.nodes : [];
    const { nodes, rawKeyToId } = buildNodeMapsFromRaw(rawNodes);

    const validIds = new Set(nodes.map((n) => n.id));
    const edges = [];
    const seen = new Set();

    const rawEdges = Array.isArray(raw?.edges) ? raw.edges : [];

    for (const e of rawEdges) {
      const fromKey = e?.from ? String(e.from).trim() : null;
      const toKey = e?.to ? String(e.to).trim() : null;

      const from = fromKey ? rawKeyToId.get(fromKey) : null;
      const to = toKey ? rawKeyToId.get(toKey) : null;

      if (!from || !to) continue;
      if (!validIds.has(from) || !validIds.has(to)) continue;
      if (from === to) continue;

      const edge = {
        from,
        to,
        label: normalizeEdgeLabel(e.label),
        oneWay: e.oneWay === false ? false : true,
        waypoints: normalizeWaypoints(e.waypoints)
      };

      const key = edgeKeyOf(edge);
      if (seen.has(key)) continue;

      seen.add(key);
      edges.push(edge);
    }

    return { nodes, edges };
  }

  function sanitizeGraphDataForSave() {
    const used = new Set();
    const refMap = new Map();

    for (const node of window.graphData.nodes) {
      const oldId = node?.id ? String(node.id) : null;

      const newId = makeUniqueId(
        oldId || slugifyLabel(node.label || "node"),
        used
      );

      if (oldId) refMap.set(oldId, newId);
      refMap.set(newId, newId);

      node.id = newId;
    }

    if (window.selectedNodeId && refMap.has(window.selectedNodeId)) {
      window.selectedNodeId = refMap.get(window.selectedNodeId);
    }

    const valid = new Set(window.graphData.nodes.map((n) => n.id));
    const seen = new Set();

    window.graphData.edges = window.graphData.edges
      .map((e) => ({
        from: refMap.get(e.from) || e.from,
        to: refMap.get(e.to) || e.to,
        label: normalizeEdgeLabel(e.label),
        oneWay: e.oneWay === false ? false : true,
        waypoints: normalizeWaypoints(e.waypoints)
      }))
      .filter((e) => {
        if (!e.from || !e.to) return false;
        if (!valid.has(e.from) || !valid.has(e.to)) return false;
        if (e.from === e.to) return false;

        const key = edgeKeyOf(e);
        if (seen.has(key)) return false;

        seen.add(key);
        return true;
      });
  }

  function getSerializableGraphData() {
    sanitizeGraphDataForSave();

    return {
      nodes: window.graphData.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        subtitle: n.subtitle,
        type: n.type,
        status: n.status,
        description: n.description,
        notes: n.notes,
        tags: Array.isArray(n.tags) ? [...n.tags] : [],
        x: n.x,
        y: n.y
      })),
      edges: window.graphData.edges.map((e) => ({
        from: e.from,
        to: e.to,
        label: e.label || "",
        oneWay: e.oneWay === false ? false : true,
        waypoints: normalizeWaypoints(e.waypoints)
      }))
    };
  }

  const getNodeById = (id) =>
    window.graphData.nodes.find((n) => n.id === String(id)) || null;

  const getSelectedNode = () =>
    window.selectedNodeId ? getNodeById(window.selectedNodeId) : null;

  const getEdgeByKey = (key) =>
    window.graphData.edges.find((e) => edgeKeyOf(e) === key) || null;

  const getOutgoingEdges = (id) =>
    window.graphData.edges.filter((e) => e.from === String(id));

  const getIncomingEdges = (id) =>
    window.graphData.edges.filter((e) => e.to === String(id));

  const nodeMatchesSearch = (node, search) => {
    if (!search) return true;

    const haystack = [
      node.id,
      node.label,
      node.subtitle,
      node.description,
      node.notes,
      getTypeLabel(node.type),
      ...(node.tags || [])
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  };

  const getVisibleNodeIds = () => {
    const s = String(window.currentSearch || "").trim().toLowerCase();

    const nodes = window.graphData.nodes || [];
    if (!s) return new Set(nodes.map((n) => n.id));

    return new Set(nodes.filter((n) => nodeMatchesSearch(n, s)).map((n) => n.id));
  };

  window.normalizeType = normalizeType;
  window.getTypeLabel = getTypeLabel;
  window.getTypeClass = getTypeClass;
  window.getTypeEdgeClass = getTypeEdgeClass;

  window.cloneData = cloneData;
  window.normalizeEdgeLabel = normalizeEdgeLabel;
  window.slugifyLabel = slugifyLabel;
  window.makeUniqueId = makeUniqueId;
  window.edgeKeyOf = edgeKeyOf;
  window.normalizeWaypoints = normalizeWaypoints;

  window.buildNodeMapsFromRaw = buildNodeMapsFromRaw;
  window.normalizeData = normalizeData;

  window.sanitizeGraphDataForSave = sanitizeGraphDataForSave;
  window.getSerializableGraphData = getSerializableGraphData;

  window.getNodeById = getNodeById;
  window.getSelectedNode = getSelectedNode;
  window.getEdgeByKey = getEdgeByKey;

  window.getOutgoingEdges = getOutgoingEdges;
  window.getIncomingEdges = getIncomingEdges;

  window.nodeMatchesSearch = nodeMatchesSearch;
  window.getVisibleNodeIds = getVisibleNodeIds;
})();
