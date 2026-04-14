// ===============================
// CONFIG
// ===============================

const PROJECT = "backroomsparadox";

// 🔴 IMPORTANT: your Cloudflare Worker URL
const SAVE_URL = "https://roadmap.flux-saloris.workers.dev";

// 🔴 IMPORTANT: your GitHub raw JSON
const RAW_JSON_URL =
  "https://raw.githubusercontent.com/fluxsaloris/Roadmap/main/backroomsparadox/backrooms-levels.json";

// ===============================
// LOCAL STORAGE KEYS
// ===============================

const LOCAL_DRAFT_KEY = "backrooms-editor-draft-v10";
const LAST_REMOTE_SAVE_KEY = "backrooms-editor-last-remote-save-v5";
const LAST_SNAPSHOT_META_KEY = "backrooms-editor-last-snapshot-meta-v5";

// ===============================
// LIMITS / TIMERS
// ===============================

const MAX_HISTORY = 80;
const SAVE_COOLDOWN_MS = 15000;

// ===============================
// STATE FLAGS
// ===============================

let hasUnsavedChanges = false;
let isSavingToGitHub = false;

let lastRemoteSaveAt = null;
let lastVersionId = null;
let lastSnapshotPath = null;
let saveCooldownUntil = 0;

// ===============================
// CACHES
// ===============================

let historyIndexCache = null;
let snapshotCache = new Map();

// ===============================
// TIMERS
// ===============================

let autosaveTimer = null;
let diffTimer = null;

// ===============================
// VIEWPORT STATE (zoom + pan)
// ===============================

let viewportState = {
  x: 80,
  y: 80,
  scale: 1
};

// ===============================
// GRAPH DATA
// ===============================

let graphData = {
  nodes: [],
  edges: []
};

// ===============================
// SELECTION
// ===============================

let selectedNodeId = null;
let selectedEdgeKey = null;

// ===============================
// UNDO / REDO
// ===============================

let undoStack = [];
let redoStack = [];

// ===============================
// INTERACTION STATE
// ===============================

let interaction = {
  isPanning: false,
  panMouseX: 0,
  panMouseY: 0,
  panStartX: 0,
  panStartY: 0,

  dragNodeId: null,
  dragStartMouseX: 0,
  dragStartMouseY: 0,
  dragStartNodeX: 0,
  dragStartNodeY: 0,

  connectFromNodeId: null,
  connectMouseSceneX: 0,
  connectMouseSceneY: 0,

  movedDuringPointer: false
};

// ===============================
// WAYPOINT DRAG
// ===============================

let waypointDrag = {
  edgeKey: null,
  index: -1,
  active: false
};

// ===============================
// SEARCH
// ===============================

let currentSearch = "";

// ===============================
// DIFF CACHE
// ===============================

let latestDiffContext = null;

// ===============================
// DOM HELPERS (SUPER IMPORTANT)
// ===============================

function graphViewport() {
  return document.getElementById("graphViewport");
}

function graphScene() {
  return document.getElementById("graphScene");
}

function graphSvg() {
  return document.getElementById("graphSvg");
}

function graphNodesEl() {
  return document.getElementById("graphNodes");
}
