#!/usr/bin/env bun
/**
 * Projects view data (OBS phase 4): one row per project with its phase, open
 * tasks, last commit and age, git health, last session, Living Documents
 * dossier and assignment-catalog readiness.
 *
 *   bun scripts/projects-scan.ts [--out projects.json] [--post http://127.0.0.1:43190]
 *
 * --post sends the snapshot to the console server's POST /projects with the bearer
 * token in OBS_AUTH_TOKEN; the server keeps the latest one and serves GET /projects.
 *
 * Sources, all read-only and local (no fetch, no network):
 *   portfolio.json            Living Documents portfolio index: name, phase, roots, dossier
 *   projects/<d>/tasks.md     unchecked "- [ ]" lines in the dossier task list
 *   masterplan master-tasks   blocks whose "- project:" names the dossier and whose status is open
 *   git                       one `status --porcelain=v2 --branch` and one `log -1` per root
 *   ~/.claude/projects        newest transcript in the folder Claude Code names after the root
 *   new_assignments/catalog.json  readiness and stage of an assignment with the same name
 *
 * Git health reads the last-fetched upstream only, so "behind" can be stale; a
 * fetch per repo would break the five-second budget. Paths come from $HOME or
 * the options, never from this file.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Health = {
  state: "clean" | "dirty" | "ahead" | "behind" | "diverged" | "no-upstream" | "not-git" | "missing";
  dirty: number;
  ahead: number;
  behind: number;
  branch: string | null;
  /** what ahead and behind are measured against: the upstream, or a remote copy of the branch when none is set */
  against: string | null;
};

export type ProjectRow = {
  name: string;
  phase: string | null;
  dossier: string | null;
  root: string | null;
  openTasks: { dossier: number; master: number };
  lastCommit: { sha: string; at: string; ageDays: number } | null;
  health: Health;
  lastSession: { harness: "claude_code"; at: string; ageDays: number } | null;
  catalog: { readiness: string; stage: unknown } | null;
};

export type ScanOptions = {
  ldRoot?: string;
  claudeProjects?: string;
  catalogFile?: string;
  now?: number;
  concurrency?: number;
};

const DAY = 86_400_000;

/** Catalog folders and portfolio names differ in case and punctuation ("TetherNotes", "tether-notes"). */
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function readJson(path: string): any {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

async function git(root: string, args: string[]): Promise<string | null> {
  const p = Bun.spawn(["git", "-C", root, ...args], { stdout: "pipe", stderr: "ignore" });
  const out = await new Response(p.stdout).text();
  return (await p.exited) === 0 ? out : null;
}

export function parseStatus(out: string): Health {
  let branch: string | null = null;
  let ahead = 0;
  let behind = 0;
  let upstream: string | null = null;
  let dirty = 0;
  for (const line of out.split("\n")) {
    if (line.startsWith("# branch.head ")) branch = line.slice(14);
    else if (line.startsWith("# branch.upstream ")) upstream = line.slice(18);
    else if (line.startsWith("# branch.ab ")) {
      const m = line.match(/\+(\d+) -(\d+)/);
      if (m) {
        ahead = Number(m[1]);
        behind = Number(m[2]);
      }
    } else if (line && !line.startsWith("#")) dirty++;
  }
  const state: Health["state"] = dirty
    ? "dirty"
    : !upstream
      ? "no-upstream"
      : ahead && behind
        ? "diverged"
        : ahead
          ? "ahead"
          : behind
            ? "behind"
            : "clean";
  return { state, dirty, ahead, behind, branch, against: upstream };
}

/** Claude Code names a project folder after its working directory, every non-alphanumeric character as "-". */
export function claudeFolder(root: string): string {
  return root.replace(/[^A-Za-z0-9]/g, "-");
}

function newestTranscript(dir: string): number | null {
  if (!existsSync(dir)) return null;
  let best: number | null = null;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".jsonl")) continue;
    const t = statSync(join(dir, f)).mtimeMs;
    if (best === null || t > best) best = t;
  }
  return best;
}

export function openMasterTasks(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const block of text.split(/\n(?=### MT-\d+ )/)) {
    if (!block.startsWith("### MT-")) continue;
    const project = block.match(/^- project: (\S+)/m)?.[1];
    const status = block.match(/^- status: (\S+)/m)?.[1] ?? "";
    if (project && !["done", "cut", "superseded"].includes(status)) {
      counts.set(project, (counts.get(project) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * No upstream set (common on mesh clones): measure against a remote-tracking copy of
 * the same branch, origin first, so a laptop copy behind its mesh host still shows it.
 */
async function viaRemote(root: string, h: Health): Promise<Health> {
  const refs = (await git(root, ["for-each-ref", "--format=%(refname:short)", "refs/remotes"])) ?? "";
  const cands = refs.split("\n").filter((r) => r.endsWith("/" + h.branch));
  const ref = cands.find((r) => r.startsWith("origin/")) ?? cands[0];
  if (!ref) return h;
  const lr = await git(root, ["rev-list", "--left-right", "--count", `HEAD...${ref}`]);
  if (!lr) return h;
  const [ahead, behind] = lr.trim().split(/\s+/).map(Number);
  const state = ahead && behind ? "diverged" : ahead ? "ahead" : behind ? "behind" : "clean";
  return { ...h, state, ahead, behind, against: ref };
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export async function scan(opts: ScanOptions = {}): Promise<ProjectRow[]> {
  const home = homedir();
  const ld = opts.ldRoot ?? join(home, "LIVING_DOCUMENTS");
  const claude = opts.claudeProjects ?? join(home, ".claude", "projects");
  const now = opts.now ?? Date.now();
  const portfolio = readJson(join(ld, "portfolio.json"));
  const rows: any[] = Array.isArray(portfolio?.rows) ? portfolio.rows : [];
  const masterFile = join(ld, "projects", "masterplan", "master-tasks.md");
  const master = existsSync(masterFile) ? openMasterTasks(readFileSync(masterFile, "utf8")) : new Map();
  const catalog = readJson(opts.catalogFile ?? join(ld, "new_assignments", "catalog.json"));
  const byName = new Map<string, any>();
  for (const p of catalog?.projects ?? []) {
    for (const k of [p?.projectId, p?.folder, p?.name]) if (k) byName.set(key(String(k)), p);
  }

  return pool(rows.filter((r) => r?.name && !r.excludedReason), opts.concurrency ?? 16, async (r) => {
    const root: string | null = (r.roots ?? r.folders ?? [])[0] ?? null;
    const dossierId: string | null = r.record ?? null;
    let dossierTasks = 0;
    if (dossierId) {
      const tf = join(ld, "projects", dossierId, "tasks.md");
      if (existsSync(tf)) dossierTasks = (readFileSync(tf, "utf8").match(/^\s*- \[ \]/gm) ?? []).length;
    }
    let health: Health = { state: "missing", dirty: 0, ahead: 0, behind: 0, branch: null, against: null };
    let lastCommit: ProjectRow["lastCommit"] = null;
    if (root && existsSync(root)) {
      const [st, log] = await Promise.all([
        git(root, ["status", "--porcelain=v2", "--branch"]),
        git(root, ["log", "-1", "--format=%h%x00%ct"]),
      ]);
      health = st === null ? { ...health, state: "not-git" } : parseStatus(st);
      if (health.state === "no-upstream" && health.branch) health = await viaRemote(root, health);
      if (log) {
        const [sha, ct] = log.trim().split("\0");
        const at = Number(ct) * 1000;
        lastCommit = { sha, at: new Date(at).toISOString(), ageDays: Math.floor((now - at) / DAY) };
      }
    }
    const t = root ? newestTranscript(join(claude, claudeFolder(root))) : null;
    const cat = byName.get(key(r.name)) ?? (dossierId ? byName.get(key(dossierId)) : undefined);
    return {
      name: r.name,
      phase: r.stage ?? r.group ?? null,
      dossier: r.recordPath ?? null,
      root,
      openTasks: { dossier: dossierTasks, master: (dossierId && master.get(dossierId)) || 0 },
      lastCommit,
      health,
      lastSession: t === null ? null : { harness: "claude_code", at: new Date(t).toISOString(), ageDays: Math.floor((now - t) / DAY) },
      catalog: cat ? { readiness: cat.readiness, stage: cat.stage } : null,
    } satisfies ProjectRow;
  });
}

if (import.meta.main) {
  const t0 = performance.now();
  const rows = await scan();
  const ms = Math.round(performance.now() - t0);
  const outAt = process.argv.indexOf("--out");
  const body = JSON.stringify({ generatedAt: new Date().toISOString(), scanMs: ms, projects: rows }, null, 1);
  const postAt = process.argv.indexOf("--post");
  if (outAt > 0 && process.argv[outAt + 1]) writeFileSync(process.argv[outAt + 1], body + "\n");
  if (postAt > 0 && process.argv[postAt + 1]) {
    const r = await fetch(process.argv[postAt + 1].replace(/\/$/, "") + "/projects", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OBS_AUTH_TOKEN ?? ""}` },
      body,
    });
    if (!r.ok) {
      console.error(`POST /projects: ${r.status} ${await r.text()}`);
      process.exit(1);
    }
  }
  if (outAt < 0 && postAt < 0) console.log(body);
  console.error(`${rows.length} projects in ${ms} ms`);
}
