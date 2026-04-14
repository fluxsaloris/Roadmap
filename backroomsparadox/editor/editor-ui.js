(function () {
  function el(id) {
    return document.getElementById(id);
  }

  function setStatus(text, isError = false) {
    const bar = el("statusBar") || el("statusLine");
    if (!bar) return;
    bar.textContent = text;
    bar.style.color = isError ? "#ff9a9a" : "";
  }

  function showErrorPanel(message) {
    const panel = el("errorPanel");
    const text = el("errorText") || el("errorPanelText");
    if (text) text.textContent = message || "Unknown error";
    if (panel) panel.style.display = "block";
  }

  function hideErrorPanel() {
    const panel = el("errorPanel");
    if (panel) panel.style.display = "none";
  }

  function showLoading(text = "Loading editor...") {
    const loading = el("loadingScreen") || el("loadingOverlay");
    const loadingText = el("loadingText");
    if (loadingText) loadingText.textContent = text;
    if (loading) loading.style.display = "flex";
  }

  function hideLoading() {
    const loading = el("loadingScreen") || el("loadingOverlay");
    if (loading) loading.style.display = "none";
  }

  function formatTimestamp(ts) {
    if (!ts) return "never";
    try {
      return new Date(ts).toLocaleString([], {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    } catch {
      return "unknown";
    }
  }

  function setSaveBadge(mode, text) {
    const badge = el("saveStateBadge");
    if (!badge) return;
    badge.className = `saveBadge ${mode}`;
    badge.textContent = text;
  }

  function updateMetaBadges() {
    const remote = el("lastRemoteSaveBadge");
    const snapshot = el("lastSnapshotBadge");

    if (remote) {
      remote.textContent = window.lastRemoteSaveAt
        ? `GitHub: ${formatTimestamp(window.lastRemoteSaveAt)}`
        : "GitHub: not saved yet";
    }

    if (snapshot) {
      snapshot.textContent = window.lastVersionId
        ? `Snapshot: ${window.lastVersionId}`
        : "No snapshot yet";
    }
  }

  function updateStatsBar() {
    const statNodes = el("statNodes");
    const statEdges = el("statEdges");
    const statSelected = el("statSelected");
    const statLocalSave = el("statLocalSave");
    const statUndo = el("statUndo");
    const statRedo = el("statRedo");

    const graphData = window.graphData || { nodes: [], edges: [] };
    const selected = typeof window.getSelectedNode === "function"
      ? window.getSelectedNode()
      : null;

    if (statNodes) statNodes.textContent = `${graphData.nodes.length} nodes`;
    if (statEdges) statEdges.textContent = `${graphData.edges.length} links`;
    if (statSelected) {
      statSelected.textContent = selected
        ? `Selected: ${selected.label || selected.id}`
        : "No level selected";
    }
    if (statLocalSave) {
      statLocalSave.textContent = `Local draft: ${formatTimestamp(window.lastLocalSaveAt)}`;
    }
    if (statUndo) statUndo.textContent = `Undo: ${(window.undoStack || []).length}`;
    if (statRedo) statRedo.textContent = `Redo: ${(window.redoStack || []).length}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeJs(value) {
    return String(value ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll("'", "\\'");
  }

  function renderLinkList(direction, nodeId, targetId) {
    const listEl = el(targetId);
    if (!listEl) return;

    if (!nodeId) {
      listEl.innerHTML = "<li>No level selected.</li>";
      return;
    }

    const graphData = window.graphData || { edges: [] };
    const edges = direction === "outgoing"
      ? graphData.edges.filter(e => e.from === nodeId)
      : graphData.edges.filter(e => e.to === nodeId);

    listEl.innerHTML = edges.length
      ? edges.map(edge => {
          const otherId = direction === "outgoing" ? edge.to : edge.from;
          const other = typeof window.getNodeById === "function" ? window.getNodeById(otherId) : null;
          const key = typeof window.edgeKeyOf === "function" ? window.edgeKeyOf(edge) : "";
          const isSelected = window.selectedEdgeKey === key;
          const clickAttr = `onclick="selectEdgeByKey('${escapeJs(key)}')"`;

          if (direction === "outgoing" && targetId === "outgoingList") {
            return `
              <li>
                <button ${clickAttr} style="margin-right:6px;${isSelected ? "border-color:rgba(190,26,72,0.5);" : ""}">
                  Select
                </button>
                ${escapeHtml(other?.label || otherId)}${edge.label ? ` — ${escapeHtml(edge.label)}` : ""}
                ${Array.isArray(edge.waypoints) && edge.waypoints.length ? ` <span style="color:#a7a7b5;">(${edge.waypoints.length} bend)</span>` : ""}
                <button onclick="deleteEdge('${escapeJs(edge.from)}','${escapeJs(edge.to)}','${escapeJs(edge.label || "")}')" style="margin-left:6px;">Remove</button>
              </li>
            `;
          }

          return `
            <li>
              <button ${clickAttr} style="margin-right:6px;${isSelected ? "border-color:rgba(190,26,72,0.5);" : ""}">
                Select
              </button>
              ${escapeHtml(other?.label || otherId)}${edge.label ? ` — ${escapeHtml(edge.label)}` : ""}
              ${Array.isArray(edge.waypoints) && edge.waypoints.length ? ` <span style="color:#a7a7b5;">(${edge.waypoints.length} bend)</span>` : ""}
            </li>
          `;
        }).join("")
      : `<li>No ${direction} links.</li>`;
  }

  function updateWaypointList() {
    const container = el("waypointList");
    if (!container) return;

    const edge = typeof window.getEdgeByKey === "function"
      ? window.getEdgeByKey(window.selectedEdgeKey)
      : null;

    const selectedEdgeHint = el("selectedEdgeHint");

    if (!edge) {
      container.innerHTML = `<div class="changeEmpty">No link selected.</div>`;
      if (selectedEdgeHint) {
        selectedEdgeHint.textContent = "Select a link from the outgoing list or click a line.";
      }
      return;
    }

    const fromNode = typeof window.getNodeById === "function" ? window.getNodeById(edge.from) : null;
    const toNode = typeof window.getNodeById === "function" ? window.getNodeById(edge.to) : null;

    if (selectedEdgeHint) {
      selectedEdgeHint.textContent =
        `${fromNode?.label || edge.from} → ${toNode?.label || edge.to}${edge.label ? ` (${edge.label})` : ""}`;
    }

    const waypoints = typeof window.normalizeWaypoints === "function"
      ? window.normalizeWaypoints(edge.waypoints)
      : [];

    if (!waypoints.length) {
      container.innerHTML = `<div class="changeEmpty">This link has no bend points yet.</div>`;
      return;
    }

    container.innerHTML = waypoints.map((point, index) => `
      <div class="waypointItem">
        <div class="waypointMeta">
          <div>Bend Point ${index + 1}</div>
          <div class="waypointMetaSmall">X: ${Math.round(point.x)} • Y: ${Math.round(point.y)}</div>
        </div>
        <div class="actionRow" style="margin-top:0;">
          <button onclick="removeWaypointFromSelectedEdge(${index})" class="dangerBtn">Remove</button>
        </div>
      </div>
    `).join("");
  }

  function updateDesktopSidebar(node) {
    const selectedHint = el("selectedHint");
    if (selectedHint) {
      selectedHint.textContent = node
        ? `Editing ${node.label || node.id}`
        : "Click a node in the graph to edit it.";
    }

    if (el("nodeLabel")) el("nodeLabel").value = node?.label || "";
    if (el("nodeSubtitle")) el("nodeSubtitle").value = node?.subtitle || "";
    if (el("nodeType")) el("nodeType").value = node?.type || "stable";
    if (el("nodeStatus")) el("nodeStatus").value = node?.status || "draft";
    if (el("nodeX")) el("nodeX").value = node ? Math.round(node.x) : "";
    if (el("nodeY")) el("nodeY").value = node ? Math.round(node.y) : "";
    if (el("nodeTags")) el("nodeTags").value = node?.tags?.join(", ") || "";
    if (el("nodeDescription")) el("nodeDescription").value = node?.description || "";
    if (el("nodeNotes")) el("nodeNotes").value = node?.notes || "";

    const targetSelect = el("linkTarget");
    if (targetSelect) {
      const currentTarget = targetSelect.value;
      const graphData = window.graphData || { nodes: [] };

      targetSelect.innerHTML = graphData.nodes
        .filter(n => !node || n.id !== node.id)
        .map(n => `<option value="${escapeHtml(n.id)}">${escapeHtml(n.label)}</option>`)
        .join("");

      if ([...targetSelect.options].some(opt => opt.value === currentTarget)) {
        targetSelect.value = currentTarget;
      }
    }

    renderLinkList("outgoing", node?.id || null, "outgoingList");
    renderLinkList("incoming", node?.id || null, "incomingList");
    updateWaypointList();
  }

  function updateMobileSidebar(node) {
    if (el("mobileInspectorTitle")) {
      el("mobileInspectorTitle").textContent = node ? (node.label || node.id) : "No level selected";
    }

    if (el("mobileNodeLabel")) el("mobileNodeLabel").value = node?.label || "";
    if (el("mobileNodeSubtitle")) el("mobileNodeSubtitle").value = node?.subtitle || "";
    if (el("mobileNodeType")) el("mobileNodeType").value = node?.type || "stable";
    if (el("mobileNodeStatus")) el("mobileNodeStatus").value = node?.status || "draft";
    if (el("mobileNodeX")) el("mobileNodeX").value = node ? Math.round(node.x) : "";
    if (el("mobileNodeY")) el("mobileNodeY").value = node ? Math.round(node.y) : "";
    if (el("mobileNodeTags")) el("mobileNodeTags").value = node?.tags?.join(", ") || "";
    if (el("mobileNodeDescription")) el("mobileNodeDescription").value = node?.description || "";
    if (el("mobileNodeNotes")) el("mobileNodeNotes").value = node?.notes || "";

    const targetSelect = el("mobileLinkTarget");
    if (targetSelect) {
      const currentTarget = targetSelect.value;
      const graphData = window.graphData || { nodes: [] };

      targetSelect.innerHTML = graphData.nodes
        .filter(n => !node || n.id !== node.id)
        .map(n => `<option value="${escapeHtml(n.id)}">${escapeHtml(n.label)}</option>`)
        .join("");

      if ([...targetSelect.options].some(opt => opt.value === currentTarget)) {
        targetSelect.value = currentTarget;
      }
    }

    renderLinkList("outgoing", node?.id || null, "mobileOutgoingList");
    renderLinkList("incoming", node?.id || null, "mobileIncomingList");
  }

  function updateSidebarForSelection() {
    const node = typeof window.getSelectedNode === "function"
      ? window.getSelectedNode()
      : null;

    updateDesktopSidebar(node);
    updateMobileSidebar(node);
  }

  function renderDiffBucket(title, items, formatter) {
    return `
      <div class="changeBucket">
        <h3>${escapeHtml(title)}</h3>
        ${
          items.length
            ? `<ul class="changeList">${items.map(item => `<li>${formatter(item)}</li>`).join("")}</ul>`
            : `<div class="changeEmpty">No changes in this section.</div>`
        }
      </div>
    `;
  }

  function buildTextSummary(diff, context) {
    const lines = [];
    lines.push("Backrooms Update Log");
    if (context) lines.push(context);
    lines.push("");

    const hasChanges =
      diff.addedNodes.length ||
      diff.deletedNodes.length ||
      diff.movedNodes.length ||
      diff.updatedNodes.length ||
      diff.addedLinks.length ||
      diff.deletedLinks.length;

    if (!hasChanges) {
      lines.push("- No changes detected");
      return lines.join("\n");
    }

    diff.addedNodes.forEach(item => lines.push(`- Added node: ${item.label}`));
    diff.deletedNodes.forEach(item => lines.push(`- Deleted node: ${item.label}`));
    diff.movedNodes.forEach(item => lines.push(`- Moved node: ${item.label} (${item.from} -> ${item.to})`));
    diff.updatedNodes.forEach(item => lines.push(`- Updated node: ${item.label}`));
    diff.addedLinks.forEach(item => lines.push(`- Added link: ${item.from} -> ${item.to}${item.label ? ` (${item.label})` : ""}${item.bends ? ` [${item.bends} bends]` : ""}`));
    diff.deletedLinks.forEach(item => lines.push(`- Deleted link: ${item.from} -> ${item.to}${item.label ? ` (${item.label})` : ""}${item.bends ? ` [${item.bends} bends]` : ""}`));

    return lines.join("\n");
  }

  function buildDiscordSummary(diff, context) {
    const lines = [];
    lines.push("Backrooms Graph Update");
    if (context) lines.push(context);
    lines.push("");

    const hasChanges =
      diff.addedNodes.length ||
      diff.deletedNodes.length ||
      diff.movedNodes.length ||
      diff.updatedNodes.length ||
      diff.addedLinks.length ||
      diff.deletedLinks.length;

    if (!hasChanges) {
      lines.push("- No changes detected");
      return lines.join("\n");
    }

    if (diff.addedNodes.length) lines.push(`- Added nodes: ${diff.addedNodes.map(x => x.label).join(", ")}`);
    if (diff.deletedNodes.length) lines.push(`- Deleted nodes: ${diff.deletedNodes.map(x => x.label).join(", ")}`);
    if (diff.movedNodes.length) lines.push(`- Moved nodes: ${diff.movedNodes.map(x => x.label).join(", ")}`);
    if (diff.updatedNodes.length) lines.push(`- Updated nodes: ${diff.updatedNodes.map(x => x.label).join(", ")}`);
    if (diff.addedLinks.length) lines.push(`- Added links: ${diff.addedLinks.map(x => `${x.from} -> ${x.to}${x.bends ? ` [${x.bends} bends]` : ""}`).join("; ")}`);
    if (diff.deletedLinks.length) lines.push(`- Deleted links: ${diff.deletedLinks.map(x => `${x.from} -> ${x.to}${x.bends ? ` [${x.bends} bends]` : ""}`).join("; ")}`);

    return lines.join("\n");
  }

  function computeDiff(previousData, currentData) {
    const prevNodes = new Map(previousData.nodes.map(n => [n.id, n]));
    const currNodes = new Map(currentData.nodes.map(n => [n.id, n]));

    const prevEdges = new Set(previousData.edges.map(e => JSON.stringify(e)));
    const currEdges = new Set(currentData.edges.map(e => JSON.stringify(e)));

    const addedNodes = [];
    const deletedNodes = [];
    const movedNodes = [];
    const updatedNodes = [];
    const addedLinks = [];
    const deletedLinks = [];

    for (const [id, curr] of currNodes.entries()) {
      if (!prevNodes.has(id)) {
        addedNodes.push({ id, label: curr.label });
        continue;
      }

      const prev = prevNodes.get(id);
      const moved = prev.x !== curr.x || prev.y !== curr.y;
      const updated =
        prev.label !== curr.label ||
        prev.subtitle !== curr.subtitle ||
        prev.description !== curr.description ||
        prev.notes !== curr.notes ||
        prev.type !== curr.type ||
        prev.status !== curr.status ||
        JSON.stringify(prev.tags || []) !== JSON.stringify(curr.tags || []);

      if (moved) movedNodes.push({ label: curr.label, from: `${prev.x}, ${prev.y}`, to: `${curr.x}, ${curr.y}` });
      if (updated) updatedNodes.push({ label: curr.label });
    }

    for (const [id, prev] of prevNodes.entries()) {
      if (!currNodes.has(id)) {
        deletedNodes.push({ id, label: prev.label });
      }
    }

    for (const edge of currentData.edges) {
      const key = JSON.stringify(edge);
      if (!prevEdges.has(key)) {
        addedLinks.push({
          from: currNodes.get(edge.from)?.label || edge.from,
          to: currNodes.get(edge.to)?.label || edge.to,
          label: edge.label || "",
          bends: (window.normalizeWaypoints ? window.normalizeWaypoints(edge.waypoints) : []).length
        });
      }
    }

    for (const edge of previousData.edges) {
      const key = JSON.stringify(edge);
      if (!currEdges.has(key)) {
        deletedLinks.push({
          from: prevNodes.get(edge.from)?.label || edge.from,
          to: prevNodes.get(edge.to)?.label || edge.to,
          label: edge.label || "",
          bends: (window.normalizeWaypoints ? window.normalizeWaypoints(edge.waypoints) : []).length
        });
      }
    }

    return { addedNodes, deletedNodes, movedNodes, updatedNodes, addedLinks, deletedLinks };
  }

  async function copyText(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text);
      if (!(window.isMobileLayout && window.isMobileLayout())) {
        setStatus(successMessage);
      }
    } catch (err) {
      console.error(err);
      if (!(window.isMobileLayout && window.isMobileLayout())) {
        setStatus("Copy failed.", true);
      }
    }
  }

  function copyChangeSummary() {
    if (!window.latestDiffContext) return;
    copyText(
      buildTextSummary(window.latestDiffContext.diff, window.latestDiffContext.contextText),
      "Copied summary to clipboard."
    );
  }

  function copyDiscordLog() {
    if (!window.latestDiffContext) return;
    copyText(
      buildDiscordSummary(window.latestDiffContext.diff, window.latestDiffContext.contextText),
      "Copied Discord log to clipboard."
    );
  }

  async function refreshChangeSummary() {
    const panel = el("changeSummaryPanel");
    if (!panel) return;

    panel.innerHTML = `
      <h2 class="changeTitle">Change Summary</h2>
      <div class="changeSub">Checking history and current draft changes...</div>
    `;

    try {
      if (typeof window.fetchHistoryIndex !== "function" || typeof window.fetchSnapshotByPath !== "function") {
        panel.innerHTML = `
          <h2 class="changeTitle">Change Summary</h2>
          <div class="changeSub">History tools are not available in this build yet.</div>
        `;
        return;
      }

      const history = await window.fetchHistoryIndex();
      const versions = Array.isArray(history?.versions) ? history.versions : [];

      let diff;
      let contextText = "";

      if (!versions.length) {
        diff = {
          addedNodes: [],
          deletedNodes: [],
          movedNodes: [],
          updatedNodes: [],
          addedLinks: [],
          deletedLinks: []
        };
        contextText = "No saved history found yet.";
      } else if (window.hasUnsavedChanges || !window.lastSnapshotPath) {
        const latest = await window.fetchSnapshotByPath(versions[0].path);
        diff = computeDiff(latest, window.graphData);
        contextText = "Comparing current draft to latest saved snapshot.";
      } else if (versions[0]?.path === window.lastSnapshotPath && versions.length > 1) {
        const previous = await window.fetchSnapshotByPath(versions[1].path);
        const latest = await window.fetchSnapshotByPath(versions[0].path);
        diff = computeDiff(previous, latest);
        contextText = "Comparing latest saved snapshot to previous saved snapshot.";
      } else {
        const latest = await window.fetchSnapshotByPath(versions[0].path);
        diff = computeDiff(latest, window.graphData);
        contextText = "Comparing current draft to latest saved snapshot.";
      }

      window.latestDiffContext = { diff, contextText };

      panel.innerHTML = `
        <h2 class="changeTitle">Change Summary</h2>
        <div class="changeSub">${escapeHtml(contextText)}</div>

        <div class="changeToolbar">
          <button onclick="copyChangeSummary()">Copy Summary</button>
          <button onclick="copyDiscordLog()">Copy Discord Log</button>
        </div>

        <div class="changeGrid">
          ${renderDiffBucket("Added Nodes", diff.addedNodes, item => escapeHtml(item.label))}
          ${renderDiffBucket("Deleted Nodes", diff.deletedNodes, item => escapeHtml(item.label))}
          ${renderDiffBucket("Moved Nodes", diff.movedNodes, item => `${escapeHtml(item.label)} <span style="color:#8e8fa0;">(${escapeHtml(item.from)} → ${escapeHtml(item.to)})</span>`)}
          ${renderDiffBucket("Updated Nodes", diff.updatedNodes, item => escapeHtml(item.label))}
          ${renderDiffBucket("Added Links", diff.addedLinks, item => `${escapeHtml(item.from)} → ${escapeHtml(item.to)}${item.label ? ` <span style="color:#8e8fa0;">(${escapeHtml(item.label)})</span>` : ""}${item.bends ? ` <span style="color:#8e8fa0;">[${item.bends} bends]</span>` : ""}`)}
          ${renderDiffBucket("Deleted Links", diff.deletedLinks, item => `${escapeHtml(item.from)} → ${escapeHtml(item.to)}${item.label ? ` <span style="color:#8e8fa0;">(${escapeHtml(item.label)})</span>` : ""}${item.bends ? ` <span style="color:#8e8fa0;">[${item.bends} bends]</span>` : ""}`)}
        </div>

        <textarea class="changeTextarea" readonly>${buildTextSummary(diff, contextText)}</textarea>
      `;
    } catch (err) {
      console.error(err);
      panel.innerHTML = `
        <h2 class="changeTitle">Change Summary</h2>
        <div class="changeSub">Couldn’t load history diff yet.</div>
        <div class="changeEmpty" style="margin-top:12px;">${escapeHtml(err.message || "Unknown diff error")}</div>
      `;
    }
  }

  function refreshAllUI() {
    updateMetaBadges();
    updateStatsBar();
    updateSidebarForSelection();
    if (typeof window.refreshGraph === "function") {
      window.refreshGraph();
    }
  }

  window.setStatus = setStatus;
  window.showErrorPanel = showErrorPanel;
  window.hideErrorPanel = hideErrorPanel;
  window.showLoading = showLoading;
  window.hideLoading = hideLoading;
  window.formatTimestamp = formatTimestamp;
  window.setSaveBadge = setSaveBadge;
  window.updateMetaBadges = updateMetaBadges;
  window.updateStatsBar = updateStatsBar;
  window.escapeHtml = escapeHtml;
  window.escapeJs = escapeJs;
  window.renderLinkList = renderLinkList;
  window.updateWaypointList = updateWaypointList;
  window.updateDesktopSidebar = updateDesktopSidebar;
  window.updateMobileSidebar = updateMobileSidebar;
  window.updateSidebarForSelection = updateSidebarForSelection;
  window.renderDiffBucket = renderDiffBucket;
  window.computeDiff = computeDiff;
  window.buildTextSummary = buildTextSummary;
  window.buildDiscordSummary = buildDiscordSummary;
  window.copyText = copyText;
  window.copyChangeSummary = copyChangeSummary;
  window.copyDiscordLog = copyDiscordLog;
  window.refreshChangeSummary = refreshChangeSummary;
  window.refreshAllUI = refreshAllUI;
})();
