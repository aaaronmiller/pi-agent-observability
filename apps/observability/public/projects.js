// projects.js: the Projects view (OBS phase 4). Renders GET /projects, the latest
// snapshot that scripts/projects-scan.ts posted: one row per project with phase,
// open tasks, last commit, git health, last session and catalog readiness.
(function () {
  const { apiUrl, authHeaders } = window.OBS; // app.js is an IIFE; it shares helpers here
  const container = document.getElementById("projects-container");
  const body = document.getElementById("projects-body");
  const meta = document.getElementById("projects-meta");
  const filter = document.getElementById("projects-filter");
  let rows = [];
  let sortKey = "lastCommit";
  let sortDir = -1;
  let loadedAt = 0;

  const HEALTH_ORDER = ["diverged", "behind", "dirty", "ahead", "no-upstream", "not-git", "missing", "clean"];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const age = (d) => (d == null ? "" : d === 0 ? "today" : d === 1 ? "1 day" : `${d} days`);

  function healthText(h) {
    switch (h.state) {
      case "dirty": return `${h.dirty} uncommitted`;
      case "ahead": return `${h.ahead} to push`;
      case "behind": return `${h.behind} to pull`;
      case "diverged": return `${h.ahead} ahead, ${h.behind} behind`;
      case "no-upstream": return "no remote copy";
      case "not-git": return "not a git repo";
      case "missing": return "folder missing";
      default: return "clean";
    }
  }

  const SORTS = {
    name: (r) => r.name.toLowerCase(),
    phase: (r) => r.phase ?? "",
    tasks: (r) => r.openTasks.dossier + r.openTasks.master,
    lastCommit: (r) => (r.lastCommit ? Date.parse(r.lastCommit.at) : 0),
    health: (r) => HEALTH_ORDER.indexOf(r.health.state),
    lastSession: (r) => (r.lastSession ? Date.parse(r.lastSession.at) : 0),
    readiness: (r) => r.catalog?.readiness ?? "",
  };

  function render() {
    const q = (filter.value || "").trim().toLowerCase();
    const shown = rows
      .filter((r) => !q || [r.name, r.phase, r.health.state, r.catalog?.readiness].some((v) => String(v ?? "").toLowerCase().includes(q)))
      .sort((a, b) => {
        const x = SORTS[sortKey](a), y = SORTS[sortKey](b);
        return (x < y ? -1 : x > y ? 1 : 0) * sortDir;
      });
    for (const th of container.querySelectorAll("th[data-sort]")) {
      th.classList.toggle("sorted", th.dataset.sort === sortKey);
      th.dataset.dir = th.dataset.sort === sortKey ? (sortDir > 0 ? "asc" : "desc") : "";
    }
    body.innerHTML = shown.map((r) => `
      <tr>
        <td class="pj-name" title="${esc(r.root ?? "")}">${esc(r.name)}${r.dossier ? `<span class="pj-dossier">${esc(r.dossier)}</span>` : ""}</td>
        <td>${esc(r.phase ?? "")}</td>
        <td class="pj-num" title="dossier tasks + open master tasks">${r.openTasks.dossier + r.openTasks.master || ""}${r.openTasks.master ? `<span class="pj-sub">${r.openTasks.master} master</span>` : ""}</td>
        <td>${r.lastCommit ? `${age(r.lastCommit.ageDays)}<span class="pj-sub">${esc(r.lastCommit.sha)}</span>` : ""}</td>
        <td><span class="pj-health pj-${esc(r.health.state)}" title="${esc(r.health.against ? "against " + r.health.against : "")}">${esc(healthText(r.health))}</span></td>
        <td>${r.lastSession ? age(r.lastSession.ageDays) : ""}</td>
        <td>${esc(r.catalog?.readiness ?? "")}</td>
      </tr>`).join("");
    const counts = {};
    for (const r of rows) counts[r.health.state] = (counts[r.health.state] ?? 0) + 1;
    const summary = HEALTH_ORDER.filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`).join(" · ");
    meta.textContent = rows.length
      ? `${shown.length} of ${rows.length} projects · ${summary} · scanned ${new Date(snapshotAt).toLocaleString()}`
      : "No scan yet. Run: bun scripts/projects-scan.ts --post <server url>";
  }
  let snapshotAt = null;

  async function load() {
    try {
      const r = await fetch(apiUrl("/projects"), { headers: authHeaders() });
      if (!r.ok) throw new Error(`${r.status}`);
      const snap = await r.json();
      rows = Array.isArray(snap.projects) ? snap.projects : [];
      snapshotAt = snap.generatedAt;
      loadedAt = Date.now();
      render();
    } catch (err) {
      meta.textContent = `Could not load /projects (${err.message})`;
    }
  }

  container.querySelector("thead").addEventListener("click", (e) => {
    const th = e.target.closest("th[data-sort]");
    if (!th) return;
    if (sortKey === th.dataset.sort) sortDir = -sortDir;
    else { sortKey = th.dataset.sort; sortDir = th.dataset.sort === "name" || th.dataset.sort === "health" ? 1 : -1; }
    render();
  });
  filter.addEventListener("input", render);

  window.__projectsOnView = function () {
    if (Date.now() - loadedAt > 60_000) load();
    else render();
  };
})();

// app.js picks the initial view before this file loads; catch a page opened on Projects.
if (window.__OBS_STATE?.view === "projects") window.__projectsOnView();
