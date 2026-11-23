import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeFolder, openMasterTasks, parseStatus, scan } from "./projects-scan";

function sh(cwd: string, ...cmd: string[]) {
  const r = Bun.spawnSync(cmd, { cwd, env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  if (r.exitCode !== 0) throw new Error(cmd.join(" ") + ": " + r.stderr.toString());
}

describe("parsers", () => {
  test("status states", () => {
    expect(parseStatus("# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -0\n").state).toBe("clean");
    expect(parseStatus("# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -0\n").state).toBe("ahead");
    expect(parseStatus("# branch.head main\n# branch.upstream origin/main\n# branch.ab +1 -3\n").state).toBe("diverged");
    expect(parseStatus("# branch.head main\n1 .M N... 100644 100644 100644 a b f\n? x\n")).toMatchObject({ state: "dirty", dirty: 2 });
    expect(parseStatus("# branch.head main\n").state).toBe("no-upstream");
  });
  test("claude folder name", () => {
    expect(claudeFolder("/home/u/code/my_app.v2")).toBe("-home-u-code-my-app-v2");
  });
  test("open master tasks per project", () => {
    const m = openMasterTasks("### MT-1 a\n- project: p\n- status: open\n\n### MT-2 b\n- project: p\n- status: done\n\n### MT-3 c\n- project: q\n- status: waiting-operator\n");
    expect([m.get("p"), m.get("q")]).toEqual([1, 1]);
  });
});

test("scan joins portfolio, git, tasks, sessions and catalog", async () => {
  const t = mkdtempSync(join(tmpdir(), "pscan-"));
  const ld = join(t, "ld"), claude = join(t, "claude"), bare = join(t, "bare.git"), repo = join(t, "repo"), other = join(t, "other");
  mkdirSync(join(ld, "projects", "alpha"), { recursive: true });
  mkdirSync(join(ld, "projects", "masterplan"), { recursive: true });
  writeFileSync(join(ld, "projects", "alpha", "tasks.md"), "- [ ] one\n- [x] two\n  - [ ] three\n");
  writeFileSync(join(ld, "projects", "masterplan", "master-tasks.md"), "### MT-9 x\n- project: alpha\n- status: open\n");
  sh(t, "git", "init", "-q", "--bare", bare);
  sh(t, "git", "clone", "-q", bare, repo);
  sh(repo, "git", "checkout", "-q", "-b", "main");
  writeFileSync(join(repo, "f"), "1");
  sh(repo, "git", "add", "f");
  sh(repo, "git", "commit", "-q", "-m", "one");
  sh(repo, "git", "push", "-q", "origin", "main"); // no -u: no upstream, as on mesh clones
  sh(t, "git", "clone", "-q", "-b", "main", bare, other);
  writeFileSync(join(other, "g"), "2");
  sh(other, "git", "add", "g");
  sh(other, "git", "commit", "-q", "-m", "two");
  sh(other, "git", "push", "-q", "origin", "main");
  sh(repo, "git", "fetch", "-q", "origin");
  writeFileSync(join(repo, "dirty"), "x");
  writeFileSync(join(ld, "portfolio.json"), JSON.stringify({ rows: [
    { name: "alpha", record: "alpha", recordPath: "projects/alpha", stage: "implementation", roots: [repo] },
    { name: "gone", record: null, stage: "ideation", roots: [join(t, "nope")] },
    { name: "skip", excludedReason: "x", roots: [repo] },
  ] }));
  mkdirSync(join(claude, claudeFolder(repo)), { recursive: true });
  const tr = join(claude, claudeFolder(repo), "s.jsonl");
  writeFileSync(tr, "{}\n");
  utimesSync(tr, new Date("2026-11-20T00:00:00Z"), new Date("2026-11-20T00:00:00Z"));
  const cat = join(t, "catalog.json");
  writeFileSync(cat, JSON.stringify({ projects: [{ projectId: "al-pha", folder: "Alpha Folder", readiness: "ready-for-spec-prep", stage: 2 }] }));

  const rows = await scan({ ldRoot: ld, claudeProjects: claude, catalogFile: cat, now: Date.parse("2026-11-22T00:00:00Z") });
  expect(rows.map((r) => r.name)).toEqual(["alpha", "gone"]);
  const a = rows[0];
  expect(a.openTasks).toEqual({ dossier: 2, master: 1 });
  expect(a.health).toMatchObject({ state: "dirty", dirty: 1, branch: "main" });
  expect(a.lastSession).toMatchObject({ harness: "claude_code", ageDays: 2 });
  expect(a.catalog).toEqual({ readiness: "ready-for-spec-prep", stage: 2 });
  expect(a.lastCommit?.sha).toMatch(/^[0-9a-f]{7,}$/);
  expect(rows[1].health.state).toBe("missing");

  sh(repo, "rm", "dirty");
  const [b] = await scan({ ldRoot: ld, claudeProjects: claude, catalogFile: cat });
  expect(b.health).toMatchObject({ state: "behind", behind: 1, ahead: 0, against: "origin/main" });
});
