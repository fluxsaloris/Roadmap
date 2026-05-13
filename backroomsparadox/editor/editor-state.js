(function () {
  "use strict";

  // --------------------------------------------------
  // SAFE GLOBAL DEFAULTS
  // --------------------------------------------------

  window.graphData ||= window.createEmptyGraphData
    ? window.createEmptyGraphData()
    : {
        nodes: [],
        edges: [],
        metadata: {}
      };

  window.selectedNodeId ??= null;
  window.selectedEdgeKey ??= null;
  window.currentSearch ??= "";

  // --------------------------------------------------
  // TYPE HELPERS
  // (delegates to editor-config)
  // --------------------------------------------------

  function normalizeType(type) {
    if (typeof window.normalizeType === "function") {
      return window.normalizeType(type);
    }

    return "stable";
  }

  function normalizeStatus(status) {
    if (typeof window.normalizeStatus === "function") {
      return window.normalizeStatus(status);
    }

    return "draft";
  }

  function getTypeClass(type) {
    const meta =
      typeof window.getTypeMeta === "function"
        ? window.getTypeMeta(type)
        : null;

    return meta?.className || "stable";
  }

  // --------------------------------------------------
  // EDGE HELPERS
  // --------------------------------------------------

  function edgeKeyOf(edge) {
    if (!edge) return "";

    return [
      edge.from ?? "",
      edge.to ?? "",
      edge.label ?? "",
      edge.oneWay ? 1 : 0
    ].join("|");
  }

  function normalizeWaypoints(points) {
    if (!Array.isArray(points)) {
      return [];
    }

    const out = [];

    for (const point of points) {
      const x = Number(point?.x);
      const y = Number(point?.y);

      if (
        Number.isFinite(x) &&
        Number.isFinite(y)
      ) {
        out.push({ x, y });
      }
    }

    return out;
  }

  // --------------------------------------------------
  // ID HELPERS
  // --------------------------------------------------

  function slugify(value) {
    return String(value || "node")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "node";
  }

  function makeUniqueId(base, usedIds) {
    let id = String(base || "node");
    let index = 2;

    while (usedIds.has(id)) {
      id = `${base}-${index++}`;
    }

    usedIds.add(id);

    return id;
  }

  // --------------------------------------------------
  // NORMALIZATION
  // --------------------------------------------------

  function normalizeNode(rawNode, usedIds) {
    const originalId =
      rawNode?.id &&
      String(rawNode.id).trim()
        ? String(rawNode.id).trim()
        : slugify(rawNode?.label);

    const id = makeUniqueId(
      originalId,
      usedIds
    );

    return {
      id,

      label: String(
        rawNode?.label || "Unnamed"
      ),

      subtitle: String(
        rawNode?.subtitle || ""
      ),

      description: String(
        rawNode?.description || ""
      ),

      notes: String(
        rawNode?.notes || ""
      ),

      x: Number(rawNode?.x) || 0,
      y: Number(rawNode?.y) || 0,

      type: normalizeType(rawNode?.type),

      status: normalizeStatus(
        rawNode?.status
      ),

      tags: Array.isArray(rawNode?.tags)
        ? rawNode.tags.map(String)
        : [],

      createdAt:
        Number(rawNode?.createdAt) ||
        Date.now(),

      updatedAt:
        Number(rawNode?.updatedAt) ||
        Date.now()
    };
  }

  function normalizeEdge(rawEdge, validNodeIds) {
    const from = String(rawEdge?.from || "");
    const to = String(rawEdge?.to || "");

    if (!from || !to) {
      return null;
    }

    if (!validNodeIds.has(from)) {
      return null;
    }

    if (!validNodeIds.has(to)) {
      return null;
    }

    if (from === to) {
      return null;
    }

    return {
      from,
      to,

      label: String(
        rawEdge?.label || ""
      ),

      oneWay:
        rawEdge?.oneWay !== false,

      waypoints: normalizeWaypoints(
        rawEdge?.waypoints
      ),

      createdAt:
        Number(rawEdge?.createdAt) ||
        Date.now(),

      updatedAt:
        Number(rawEdge?.updatedAt) ||
        Date.now()
    };
  }

  function normalizeData(raw) {
    const nodesRaw = Array.isArray(raw?.nodes)
      ? raw.nodes
      : [];

    const edgesRaw = Array.isArray(raw?.edges)
      ? raw.edges
      : [];

    const metadata =
      raw?.metadata &&
      typeof raw.metadata === "object"
        ? { ...raw.metadata }
        : {};

    const usedIds = new Set();

    const nodes = nodesRaw.map((node) =>
      normalizeNode(node, usedIds)
    );

    const nodeIds = new Set(
      nodes.map((node) => node.id)
    );

    const edges = [];
    const seen = new Set();

    for (const edgeRaw of edgesRaw) {
      const edge = normalizeEdge(
        edgeRaw,
        nodeIds
      );

      if (!edge) {
        continue;
      }

      const key = edgeKeyOf(edge);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      edges.push(edge);
    }

    return {
      nodes,
      edges,

      metadata: {
        project:
          metadata.project ||
          window.PROJECT ||
          "project",

        version:
          metadata.version ||
          window.APP_INFO?.version ||
          "1.0.0",

        createdAt:
          Number(metadata.createdAt) ||
          Date.now(),

        updatedAt:
          Number(metadata.updatedAt) ||
          Date.now()
      }
    };
  }

  // --------------------------------------------------
  // ACCESSORS
  // --------------------------------------------------

  function getNodeById(id) {
    return (
      window.graphData?.nodes?.find(
        (node) =>
          node.id === String(id)
      ) || null
    );
  }

  function getEdgeByKey(key) {
    return (
      window.graphData?.edges?.find(
        (edge) =>
          edgeKeyOf(edge) === key
      ) || null
    );
  }

  function getSelectedNode() {
    return getNodeById(
      window.selectedNodeId
    );
  }

  function getSelectedEdge() {
    return getEdgeByKey(
      window.selectedEdgeKey
    );
  }

  // --------------------------------------------------
  // SERIALIZATION
  // --------------------------------------------------

  function getSerializableGraphData() {
    return JSON.parse(
      JSON.stringify(
        normalizeData(window.graphData)
      )
    );
  }

  // --------------------------------------------------
  // SEARCH
  // --------------------------------------------------

  function matchesSearch(node, query) {
    if (!query) {
      return true;
    }

    const q = String(query)
      .trim()
      .toLowerCase();

    if (!q) {
      return true;
    }

    const haystack = [
      node.id,
      node.label,
      node.subtitle,
      node.description,
      node.notes,
      ...(node.tags || [])
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(q);
  }

  // --------------------------------------------------
  // EXPORTS
  // --------------------------------------------------

  Object.assign(window, {
    normalizeType,
    normalizeStatus,
    getTypeClass,

    edgeKeyOf,
    normalizeWaypoints,

    slugify,
    makeUniqueId,

    normalizeNode,
    normalizeEdge,
    normalizeData,

    getNodeById,
    getEdgeByKey,

    getSelectedNode,
    getSelectedEdge,

    getSerializableGraphData,

    matchesSearch
  });
})();
