// ===============================
// TYPE META
// ===============================

const TYPE_META = {
  stable: {
    className: "stable",
    label: "Stable",
    edgeClass: "edge-stable"
  },
  dangerous: {
    className: "dangerous",
    label: "Dangerous",
    edgeClass: "edge-dangerous"
  },
  corrupted: {
    className: "corrupted",
    label: "Corrupted",
    edgeClass: "edge-corrupted"
  },
  anomalous: {
    className: "anomalous",
    label: "Anomalous",
    edgeClass: "edge-anomalous"
  }
};

// ===============================
// BASIC HELPERS
// ===============================

function normalizeType(type) {
  const value = String(type || "").trim().toLowerCase();

  if (value === "stable" || value === "start") return "stable";
  if (value === "dangerous" || value === "progression") return "dangerous";
  if (value === "corrupted" || value === "danger") return "corrupted";
  if (value === "anomalous" || value === "weird") return "anomalous";

  return "stable";
}

function getTypeLabel(type) {
  return TYPE_META[normalizeType(type)].label;
}

function getTypeClass(type) {
  return TYPE_META[normalizeType(type)].className;
}

function getTypeEdgeClass(type) {
  return TYPE_META[normalizeType(type)].edgeClass;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function normalizeEdgeLabel(label) {
  return typeof label === "string" ? label : "";
}

function slugifyLabel(label) {
  return String(label || "node")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "node";
}

function makeUniqueId(base, used) {
  let normalizedBase = String(base || "node").trim() || "node";
  let id = normalizedBase;
  let i = 2;

  while (used.has(id)) {
    id = `${normalizedBase}-${i}`;
    i++;
  }

  used.add(id);
  return id;
}

function edgeKeyOf(edge) {
  return `${edge.from}|${edge.to}|${edge.label || ""}|${edge.oneWay === false ? "0" : "1"}`;
}

function normalizeWaypoints(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => ({
      x: typeof item?.x === "number" ? item.x : null,
      y: typeof item?.y === "number" ? item.y : null
    }))
    .filter((item) => typeof item.x === "number" && typeof item.y === "number");
}

// ===============================
// RAW -> NORMALIZED NODE MAPS
// ===============================

function buildNodeMapsFromRaw(rawNodes) {
  const usedIds = new Set();
  const nodes = [];
  const rawKeyToId = new Map();

  for (let i = 0; i < rawNodes.length; i++) {
    const n = rawNodes[i] || {};

    const explicitId =
      n.id !== null &&
      n.id !== undefined &&
      String(n.id).trim() !== ""
        ? String(n.id).trim()
        : null;

    const label = typeof n.label === "string" ? n.label : "Unnamed";

    const finalId = makeUniqueId(
      explicitId || slugifyLabel(label || `node-${i + 1}`),
      usedIds
    );

    const node = {
      id: finalId,
      label,
      subtitle: typeof n.subtitle === "string" ? n.subtitle : "",
      description: typeof n.description === "string" ? n.description : "",
      notes: typeof n.notes === "string" ? n.notes : "",
      x: typeof n.x === "number" ? n.x : 0,
      y: typeof n.y === "number" ? n.y : 0,
      type: normalizeType(n.type),
      status: typeof n.status === "string" ? n.status : "draft",
      tags: Array.isArray(n.tags) ? n.tags.map((tag) => String(tag)) : []
    };

    nodes.push(node);

    rawKeyToId.set(finalId, finalId);
    rawKeyToId.set(label, finalId);

    if (explicitId) {
      rawKeyToId.set(explicitId, finalId);
    }
  }

  return { nodes, rawKeyToId };
}

// ===============================
// NORMALIZE WHOLE GRAPH
// ===============================

function normalizeData(raw) {
  const rawNodes = Array.isArray(raw?.nodes) ? raw.nodes : [];
  const { nodes, rawKeyToId } = buildNodeMapsFromRaw(rawNodes);

  const validIds = new Set(nodes.map((n) => n.id));
  const seen = new Set();

  const rawEdges = Array.isArray(raw?.edges) ? raw.edges : [];
  const edges = [];

  for (const e of rawEdges) {
    const rawFrom =
      e?.from !== null &&
      e?.from !== undefined &&
      String(e.from).trim() !== ""
        ? String(e.from).trim()
        : null;

    const rawTo =
      e?.to !== null &&
      e?.to !== undefined &&
      String(e.to).trim() !== ""
        ? String(e.to).trim()
        : null;

    const from = rawFrom ? rawKeyToId.get(rawFrom) || null : null;
    const to = rawTo ? rawKeyToId.get(rawTo) || null : null;

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

// ===============================
// SANITIZE FOR SAVE
// ===============================

function sanitizeGraphDataForSave() {
  const usedIds = new Set();
  const nodeRefMap = new Map();

  for (const node of graphData.nodes) {
    const previousId =
      node?.id !== null &&
      node?.id !== undefined &&
      String(node.id).trim() !== ""
        ? String(node.id).trim()
        : null;

    const finalId = makeUniqueId(
      previousId || slugifyLabel(node.label || "node"),
      usedIds
    );

    if (previousId) nodeRefMap.set(previousId, finalId);
    nodeRefMap.set(finalId, finalId);
    nodeRefMap.set(String(node.label || "").trim(), finalId);

    node.id = finalId;
  }

  if (selectedNodeId && nodeRefMap.has(String(selectedNodeId))) {
    selectedNodeId = nodeRefMap.get(String(selectedNodeId));
  }

  const validIds = new Set(graphData.nodes.map((node) => node.id));
  const seen = new Set();

  graphData.edges = graphData.edges
    .map((edge) => {
      const rawFrom =
        edge?.from !== null &&
        edge?.from !== undefined &&
        String(edge.from).trim() !== ""
          ? String(edge.from).trim()
          : null;

      const rawTo =
        edge?.to !== null &&
        edge?.to !== undefined &&
        String(edge.to).trim() !== ""
          ? String(edge.to).trim()
          : null;

      return {
        from: rawFrom ? nodeRefMap.get(rawFrom) || rawFrom : null,
        to: rawTo ? nodeRefMap.get(rawTo) || rawTo : null,
        label: normalizeEdgeLabel(edge?.label),
        oneWay: edge?.oneWay === false ? false : true,
        waypoints: normalizeWaypoints(edge?.waypoints)
      };
    })
    .filter((edge) => {
      if (!edge.from || !edge.to) return false;
      if (!validIds.has(edge.from) || !validIds.has(edge.to)) return false;
      if (edge.from === edge.to) return false;

      const key = edgeKeyOf(edge);
      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });

  if (selectedEdgeKey) {
    const stillExists = graphData.edges.some(
      (edge) => edgeKeyOf(edge) === selectedEdgeKey
    );
    if (!stillExists) selectedEdgeKey = null;
  }
}

function getSerializableGraphData() {
  sanitizeGraphDataForSave();

  return {
    nodes: graphData.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      subtitle: node.subtitle,
      type: node.type,
      status: node.status,
      description: node.description,
      notes: node.notes,
      tags: Array.isArray(node.tags) ? [...node.tags] : [],
      x: node.x,
      y: node.y
    })),
    edges: graphData.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      label: edge.label || "",
      oneWay: edge.oneWay === false ? false : true,
      waypoints: normalizeWaypoints(edge.waypoints)
    }))
  };
}

// ===============================
// LOOKUPS
// ===============================

function getNodeById(id) {
  return graphData.nodes.find((n) => n.id === String(id)) || null;
}

function getSelectedNode() {
  return selectedNodeId ? getNodeById(selectedNodeId) : null;
}

function getEdgeByKey(key) {
  return graphData.edges.find((edge) => edgeKeyOf(edge) === key) || null;
}

function getOutgoingEdges(id) {
  return graphData.edges.filter((edge) => edge.from === String(id));
}

function getIncomingEdges(id) {
  return graphData.edges.filter((edge) => edge.to === String(id));
}

// ===============================
// SEARCH / FILTER
// ===============================

function buildSearchString(value) {
  return String(value || "").trim().toLowerCase();
}

function nodeMatchesSearch(node, search) {
  if (!search) return true;

  const hay = [
    node.id,
    node.label,
    node.subtitle,
    node.description,
    node.notes,
    getTypeLabel(node.type),
    ...(Array.isArray(node.tags) ? node.tags : [])
  ]
    .join(" ")
    .toLowerCase();

  return hay.includes(search);
}

function getVisibleNodeIds() {
  const search = currentSearch.trim().toLowerCase();

  if (!search) {
    return new Set(graphData.nodes.map((n) => n.id));
  }

  return new Set(
    graphData.nodes
      .filter((n) => nodeMatchesSearch(n, search))
      .map((n) => n.id)
  );
}

// ===============================
// EDGE / NODE GEOMETRY
// ===============================

function getNodePortPosition(nodeId, side) {
  const node = getNodeById(nodeId);
  if (!node) return null;

  const width = isMobileLayout() ? 118 : 170;

  return {
    x: node.x + (side === "output" ? width / 2 : -width / 2),
    y: node.y
  };
}

function buildEdgePoints(edge) {
  const fromPort = getNodePortPosition(edge.from, "output");
  const toPort = getNodePortPosition(edge.to, "input");

  if (!fromPort || !toPort) return null;

  return [fromPort, ...normalizeWaypoints(edge.waypoints), toPort];
}

function createSegmentPath(points) {
  if (!points || points.length < 2) return "";

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = Math.abs(b.x - a.x);
    const curve = Math.max(30, Math.min(120, dx * 0.35));

    path += ` C ${a.x + curve} ${a.y}, ${b.x - curve} ${b.y}, ${b.x} ${b.y}`;
  }

  return path;
}

function createEdgePath(points) {
  return createSegmentPath(points);
}

function getEdgeMidpoint(points) {
  if (!points || points.length < 2) {
    return { x: 0, y: 0 };
  }

  let total = 0;
  const lengths = [];

  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.hypot(dx, dy);

    lengths.push(len);
    total += len;
  }

  let target = total / 2;

  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i]) {
      const ratio = lengths[i] === 0 ? 0 : target / lengths[i];

      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * ratio,
        y: points[i].y + (points[i + 1].y - points[i].y) * ratio
      };
    }

    target -= lengths[i];
  }

  return points[Math.floor(points.length / 2)];
}

function getEdgeTypeClass(edge) {
  const fromNode = getNodeById(edge.from);
  return getTypeEdgeClass(fromNode?.type || "stable");
}

function getGraphBounds(nodes) {
  if (!nodes.length) {
    return { minX: 0, maxX: 1000, minY: 0, maxY: 600 };
  }

  const allX = [];
  const allY = [];

  for (const node of nodes) {
    allX.push(node.x);
    allY.push(node.y);
  }

  for (const edge of graphData.edges) {
    for (const waypoint of normalizeWaypoints(edge.waypoints)) {
      allX.push(waypoint.x);
      allY.push(waypoint.y);
    }
  }

  return {
    minX: Math.min(...allX),
    maxX: Math.max(...allX),
    minY: Math.min(...allY),
    maxY: Math.max(...allY)
  };
}

// ===============================
// EDGES / NODES MUTATION HELPERS
// ===============================

function edgeExists(from, to, label = "") {
  return graphData.edges.some(
    (e) => e.from === from && e.to === to && (e.label || "") === (label || "")
  );
}

function addEdge(from, to, label = "", oneWay = true) {
  if (!from || !to || from === to) return;
  if (edgeExists(from, to, label)) return;

  const edge = {
    from,
    to,
    label: label || "",
    oneWay: !!oneWay,
    waypoints: []
  };

  graphData.edges.push(edge);

  if (!oneWay && !edgeExists(to, from, label)) {
    graphData.edges.push({
      from: to,
      to: from,
      label: label || "",
      oneWay: !!oneWay,
      waypoints: []
    });
  }
}

function generateNodeId() {
  const used = new Set(graphData.nodes.map((n) => String(n.id || "")));
  return makeUniqueId("level", used);
}
