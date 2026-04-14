(function () {
  window.PROJECT = "backroomsparadox";
  window.SAVE_URL = "https://roadmap.flux-saloris.workers.dev";
  window.RAW_JSON_URL = "https://raw.githubusercontent.com/fluxsaloris/Roadmap/main/backroomsparadox/backrooms-levels.json";

  window.LOCAL_DRAFT_KEY = "backrooms-editor-draft-v10";
  window.LAST_REMOTE_SAVE_KEY = "backrooms-editor-last-remote-save-v5";
  window.LAST_SNAPSHOT_META_KEY = "backrooms-editor-last-snapshot-meta-v5";
  window.MAX_HISTORY = 80;
  window.SAVE_COOLDOWN_MS = 15000;

  window.TYPE_META = {
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
})();
