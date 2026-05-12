(function () {
  "use strict";

  const freeze = Object.freeze;

  const ENV = freeze({
    PROJECT: "backroomsparadox",
    SAVE_URL: "https://roadmap.flux-saloris.workers.dev",
    RAW_JSON_URL:
      "https://raw.githubusercontent.com/fluxsaloris/Roadmap/main/backroomsparadox/backrooms-levels.json"
  });

  const STORAGE = freeze({
    LOCAL_DRAFT_KEY: "backrooms-editor-draft-v12",
    LAST_REMOTE_SAVE_KEY: "backrooms-editor-last-remote-save-v6",
    LAST_SNAPSHOT_META_KEY: "backrooms-editor-last-snapshot-meta-v6"
  });

  const EDITOR = freeze({
    MAX_HISTORY: 120,
    SAVE_COOLDOWN_MS: 15000,
    AUTOSAVE_DELAY_MS: 500,
    DIFF_REFRESH_DELAY_MS: 200,
    SEARCH_DEBOUNCE_MS: 100,
    SNAPSHOT_CACHE_LIMIT: 30,
    DEFAULT_NODE_TYPE: "stable",
    DEFAULT_NODE_STATUS: "draft",
    GRID_SIZE: 20,
    MIN_ZOOM: 0.2,
    MAX_ZOOM: 3
  });

  const TYPE_META = freeze({
    stable: freeze({
      id: "stable",
      className: "stable",
      label: "Stable",
      description: "Safe and mostly consistent levels.",
      edgeClass: "edge-stable",
      color: "#4ade80",
      priority: 1
    }),

    dangerous: freeze({
      id: "dangerous",
      className: "dangerous",
      label: "Dangerous",
      description: "Hostile or hazardous areas.",
      edgeClass: "edge-dangerous",
      color: "#f97316",
      priority: 2
    }),

    corrupted: freeze({
      id: "corrupted",
      className: "corrupted",
      label: "Corrupted",
      description: "Broken or unstable spaces.",
      edgeClass: "edge-corrupted",
      color: "#ef4444",
      priority: 3
    }),

    anomalous: freeze({
      id: "anomalous",
      className: "anomalous",
      label: "Anomalous",
      description: "Reality-defying environments.",
      edgeClass: "edge-anomalous",
      color: "#8b5cf6",
      priority: 4
    })
  });

  const NODE_STATUSES = freeze([
    "draft",
    "planned",
    "in-progress",
    "complete",
    "archived"
  ]);

  const DEFAULT_VIEWPORT_STATE = freeze({
    x: 0,
    y: 0,
    zoom: 1
  });

  const APP_INFO = freeze({
    name: "Backrooms Paradox Editor",
    version: "12.0.0",
    author: "Flux Saloris"
  });

  const utils = {
    deepFreeze(obj) {
      if (!obj || typeof obj !== "object") return obj;

      Object.getOwnPropertyNames(obj).forEach((prop) => {
        const value = obj[prop];

        if (
          value &&
          typeof value === "object" &&
          !Object.isFrozen(value)
        ) {
          utils.deepFreeze(value);
        }
      });

      return Object.freeze(obj);
    },

    safeParseJSON(value, fallback = null) {
      try {
        return JSON.parse(value);
      } catch {
        return fallback;
      }
    },

    generateId(prefix = "id") {
      if (crypto?.randomUUID) {
        return `${prefix}-${crypto.randomUUID()}`;
      }

      return `${prefix}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
    },

    clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }
  };

  utils.deepFreeze(TYPE_META);

  Object.assign(window, {
    ...ENV,
    ...STORAGE,
    ...EDITOR,

    TYPE_META,
    NODE_STATUSES,
    DEFAULT_VIEWPORT_STATE,
    APP_INFO,

    editorUtils: utils
  });

  window.getTypeMeta = function getTypeMeta(type) {
    return (
      TYPE_META[type] ||
      TYPE_META[EDITOR.DEFAULT_NODE_TYPE]
    );
  };

  window.getTypeList = function getTypeList() {
    return Object.keys(TYPE_META);
  };

  window.isValidNodeType = function isValidNodeType(type) {
    return Boolean(TYPE_META[type]);
  };

  window.isValidNodeStatus = function isValidNodeStatus(status) {
    return NODE_STATUSES.includes(status);
  };

  window.normalizeType = function normalizeType(type) {
    return window.isValidNodeType(type)
      ? type
      : EDITOR.DEFAULT_NODE_TYPE;
  };

  window.normalizeStatus = function normalizeStatus(status) {
    return window.isValidNodeStatus(status)
      ? status
      : EDITOR.DEFAULT_NODE_STATUS;
  };

  window.createDefaultNodeData = function createDefaultNodeData(
    overrides = {}
  ) {
    return {
      id: utils.generateId("level"),
      label: "New Level",
      subtitle: "",
      description: "",
      notes: "",
      x: 0,
      y: 0,
      type: EDITOR.DEFAULT_NODE_TYPE,
      status: EDITOR.DEFAULT_NODE_STATUS,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides
    };
  };

  window.createDefaultEdgeData = function createDefaultEdgeData(
    overrides = {}
  ) {
    return {
      from: "",
      to: "",
      label: "",
      oneWay: true,
      waypoints: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides
    };
  };

  window.createEmptyGraphData = function createEmptyGraphData() {
    return {
      nodes: [],
      edges: [],
      metadata: {
        project: ENV.PROJECT,
        version: APP_INFO.version,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    };
  };

  window.getEditorConfig = function getEditorConfig() {
    return freeze({
      ENV,
      STORAGE,
      EDITOR,
      TYPE_META,
      NODE_STATUSES,
      DEFAULT_VIEWPORT_STATE,
      APP_INFO
    });
  };
})();
