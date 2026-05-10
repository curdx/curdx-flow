// tests/runner/manifest-integrity.test.ts
//
// Structural validation for the 3 manifest types under plugins/curdx-flow/:
//
//   - commands/*.md      — slash-command markdown
//   - agents/*.md        — subagent prompt markdown
//   - skills/*/SKILL.md  — skill markdown
//
// Today there is ZERO automated check that these files have valid frontmatter
// or that their inline `references/<file>.md` links resolve. A typo'd YAML
// key, a renamed reference, or a missing description can ship to users with
// no CI guard. This test closes that gap.
//
// Approach: regex parsing only — same convention as claudeMd.test.ts and
// iron-law-doc.test.ts (no gray-matter dependency in this repo).

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PLUGIN_ROOT = path.join(REPO_ROOT, "plugins", "curdx-flow");

const PLUGIN_MANIFEST = path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json");
const COMMANDS_DIR = path.join(PLUGIN_ROOT, "commands");
const AGENTS_DIR = path.join(PLUGIN_ROOT, "agents");
const SKILLS_DIR = path.join(PLUGIN_ROOT, "skills");
const REFERENCES_DIR = path.join(PLUGIN_ROOT, "references");
const HOOKS_CONFIG = path.join(PLUGIN_ROOT, "hooks", "hooks.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract YAML frontmatter as a raw string, or null if missing. */
function extractFrontmatter(body: string): string | null {
  const m = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m && m[1] !== undefined ? m[1] : null;
}

/** Parse simple `key: value` pairs from frontmatter. Multi-line values are
 *  not supported because no manifest in this repo uses them; keeping the
 *  parser tight matches the claudeMd.test.ts precedent. */
function parseFrontmatterFields(fm: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const rawLine of fm.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.length === 0) continue;
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (m && m[1] !== undefined && m[2] !== undefined) {
      fields.set(m[1], m[2].trim());
    }
  }
  return fields;
}

/** All `references/<name>.md` mentions in markdown body (anywhere, regardless
 *  of leading prefix like ${CLAUDE_PLUGIN_ROOT}). */
function findReferenceLinks(body: string): string[] {
  const matches = [...body.matchAll(/references\/([A-Za-z0-9_-]+)\.md/g)];
  return [...new Set(matches.map((m) => m[1] as string))];
}

function listMarkdown(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(dir, f));
}

function listSkillManifests(dir: string): string[] {
  const out: string[] = [];
  for (const sub of readdirSync(dir)) {
    const subPath = path.join(dir, sub);
    if (!statSync(subPath).isDirectory()) continue;
    const skillMd = path.join(subPath, "SKILL.md");
    if (existsSync(skillMd)) out.push(skillMd);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Discovery (run once at module load so the `it()` count reflects reality)
// ---------------------------------------------------------------------------

const COMMAND_FILES = listMarkdown(COMMANDS_DIR);
const AGENT_FILES = listMarkdown(AGENTS_DIR);
const SKILL_FILES = listSkillManifests(SKILLS_DIR);

// ---------------------------------------------------------------------------
// Discovery sanity (locks the count so accidental file deletion fails CI)
// ---------------------------------------------------------------------------

describe("manifest discovery", () => {
  it("plugin.json declares official metadata and component paths", () => {
    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, "utf8")) as {
      name?: string;
      version?: string;
      homepage?: string;
      repository?: string;
      license?: string;
      skills?: string | string[];
      commands?: string | string[];
      agents?: string | string[];
      hooks?: string | string[];
    };

    expect(manifest.name).toBe("curdx-flow");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    expect(manifest.homepage).toMatch(/^https:\/\/github\.com\/curdx\/curdx-flow/);
    expect(manifest.repository).toBe("https://github.com/curdx/curdx-flow");
    expect(manifest.license).toBe("MIT");

    for (const key of ["skills", "commands", "agents", "hooks"] as const) {
      const value = manifest[key];
      expect(value, `plugin.json: missing ${key}`).toBeDefined();
      const paths = Array.isArray(value) ? value : [value!];
      expect(paths.length, `plugin.json: ${key} path list must be non-empty`).toBeGreaterThan(0);
      for (const relPath of paths) {
        expect(relPath, `plugin.json: ${key} path must start with ./`).toMatch(/^\.\//);
        expect(
          existsSync(path.join(PLUGIN_ROOT, relPath)),
          `plugin.json: ${key} path does not exist: ${relPath}`,
        ).toBe(true);
      }
    }
  });

  it("finds at least 10 commands, 5 agents, 3 skills", () => {
    // Lower bounds rather than exact counts so adding new manifests
    // doesn't break this test, but mass-deletion is caught.
    expect(COMMAND_FILES.length).toBeGreaterThanOrEqual(10);
    expect(AGENT_FILES.length).toBeGreaterThanOrEqual(5);
    expect(SKILL_FILES.length).toBeGreaterThanOrEqual(3);
  });

  it("references/ directory exists and contains at least 5 .md files", () => {
    expect(existsSync(REFERENCES_DIR)).toBe(true);
    const refs = listMarkdown(REFERENCES_DIR);
    expect(refs.length).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Frontmatter validation per manifest type
// ---------------------------------------------------------------------------

describe("commands frontmatter integrity", () => {
  // Commands don't have a `name` field — the filename is the command name.
  // Required: `description`. Optional but recommended: `argument-hint`,
  // `allowed-tools`.
  it.each(COMMAND_FILES.map((f) => [path.basename(f), f]))(
    "%s has frontmatter with non-empty `description`",
    (_label, file) => {
      const body = readFileSync(file, "utf8");
      const fm = extractFrontmatter(body);
      expect(fm, `${file}: missing frontmatter`).not.toBeNull();
      const fields = parseFrontmatterFields(fm!);
      const desc = fields.get("description");
      expect(
        desc !== undefined && desc.length > 0,
        `${file}: missing/empty 'description' in frontmatter`,
      ).toBe(true);
    },
  );
});

describe("agents frontmatter integrity", () => {
  // Required: `name`, `description`. The `name` field is the canonical id
  // the Task tool uses to spawn the subagent.
  it.each(AGENT_FILES.map((f) => [path.basename(f), f]))(
    "%s has non-empty `name` and `description`",
    (_label, file) => {
      const body = readFileSync(file, "utf8");
      const fm = extractFrontmatter(body);
      expect(fm, `${file}: missing frontmatter`).not.toBeNull();
      const fields = parseFrontmatterFields(fm!);
      const name = fields.get("name");
      const desc = fields.get("description");
      expect(
        name !== undefined && name.length > 0,
        `${file}: missing/empty 'name' in frontmatter`,
      ).toBe(true);
      expect(
        desc !== undefined && desc.length > 0,
        `${file}: missing/empty 'description' in frontmatter`,
      ).toBe(true);
    },
  );

  it("agent `name` field matches its filename (kebab-case)", () => {
    for (const file of AGENT_FILES) {
      const expectedName = path.basename(file, ".md");
      const fm = extractFrontmatter(readFileSync(file, "utf8"));
      const name = parseFrontmatterFields(fm!).get("name");
      expect(
        name,
        `${file}: name field "${name}" does not match filename "${expectedName}.md"`,
      ).toBe(expectedName);
    }
  });

  it("agents declare official runtime frontmatter fields", () => {
    const allowedModels = new Set(["inherit", "haiku", "sonnet", "opus"]);
    const allowedEffort = new Set(["low", "medium", "high", "xhigh", "max"]);

    for (const file of AGENT_FILES) {
      const fm = extractFrontmatter(readFileSync(file, "utf8"));
      const fields = parseFrontmatterFields(fm!);
      const model = fields.get("model");
      const effort = fields.get("effort");
      const maxTurns = fields.get("maxTurns");

      expect(model, `${file}: missing model`).toBeDefined();
      expect(allowedModels.has(model!), `${file}: unsupported model ${model}`).toBe(true);
      expect(effort, `${file}: missing effort`).toBeDefined();
      expect(allowedEffort.has(effort!), `${file}: unsupported effort ${effort}`).toBe(true);
      expect(maxTurns, `${file}: missing maxTurns`).toMatch(/^[1-9]\d*$/);
    }
  });

  it("read-only reviewer agents do not allow write tools", () => {
    for (const filename of ["spec-reviewer.md", "code-quality-reviewer.md"]) {
      const file = path.join(AGENTS_DIR, filename);
      const fm = extractFrontmatter(readFileSync(file, "utf8"));
      const fields = parseFrontmatterFields(fm!);
      const tools = fields.get("tools");
      expect(tools, `${file}: missing tools allowlist`).toBeDefined();
      expect(tools).not.toMatch(/\b(Write|Edit|MultiEdit)\b/);
    }
  });
});

describe("hooks config integrity", () => {
  it("command hooks declare statusMessage and bounded timeout", () => {
    const config = JSON.parse(readFileSync(HOOKS_CONFIG, "utf8")) as {
      hooks?: Record<string, Array<{ hooks?: Array<Record<string, unknown>> }>>;
    };
    expect(config.hooks).toBeDefined();

    for (const [event, matchers] of Object.entries(config.hooks ?? {})) {
      for (const matcher of matchers) {
        for (const hook of matcher.hooks ?? []) {
          if (hook.type !== "command") continue;
          expect(hook.command, `${event}: command hook missing command`).toEqual(
            expect.any(String),
          );
          expect(hook.statusMessage, `${event}: command hook missing statusMessage`).toEqual(
            expect.any(String),
          );
          expect(hook.timeout, `${event}: command hook missing timeout`).toEqual(
            expect.any(Number),
          );
          expect(
            Number(hook.timeout) > 0 && Number(hook.timeout) <= 60,
            `${event}: timeout must be in 1..60 seconds`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("skills frontmatter integrity", () => {
  // Required: `name`, `description`. Optional: `version`.
  it.each(SKILL_FILES.map((f) => [path.relative(SKILLS_DIR, f), f]))(
    "%s has non-empty `name` and `description`",
    (_label, file) => {
      const body = readFileSync(file, "utf8");
      const fm = extractFrontmatter(body);
      expect(fm, `${file}: missing frontmatter`).not.toBeNull();
      const fields = parseFrontmatterFields(fm!);
      const name = fields.get("name");
      const desc = fields.get("description");
      expect(
        name !== undefined && name.length > 0,
        `${file}: missing/empty 'name' in frontmatter`,
      ).toBe(true);
      expect(
        desc !== undefined && desc.length > 0,
        `${file}: missing/empty 'description' in frontmatter`,
      ).toBe(true);
    },
  );

  it("skill `name` field matches its parent directory name", () => {
    for (const file of SKILL_FILES) {
      const expectedName = path.basename(path.dirname(file));
      const fm = extractFrontmatter(readFileSync(file, "utf8"));
      const name = parseFrontmatterFields(fm!).get("name");
      expect(
        name,
        `${file}: name field "${name}" does not match dir "${expectedName}"`,
      ).toBe(expectedName);
    }
  });
});

// ---------------------------------------------------------------------------
// references/ link integrity — every "references/foo.md" mention must resolve
// ---------------------------------------------------------------------------

describe("references/ link integrity", () => {
  // Commands + agents use the GLOBAL plugin references at
  // plugins/curdx-flow/references/. Skills use their LOCAL
  // skills/<name>/references/ subdirectory (each skill is self-contained
  // per the Claude Code skills convention). The test must differentiate
  // these two scopes — a skill saying `references/foo.md` resolves to
  // its own folder, not to the global one.
  const globalScopeManifests = [...COMMAND_FILES, ...AGENT_FILES];

  it("every references/<name>.md in commands/agents resolves under plugin/references/", () => {
    const broken: Array<{ source: string; target: string }> = [];
    for (const file of globalScopeManifests) {
      const body = readFileSync(file, "utf8");
      for (const refName of findReferenceLinks(body)) {
        const refPath = path.join(REFERENCES_DIR, `${refName}.md`);
        if (!existsSync(refPath)) {
          broken.push({
            source: path.relative(REPO_ROOT, file),
            target: `references/${refName}.md`,
          });
        }
      }
    }
    expect(
      broken,
      `Broken reference links found:\n${broken
        .map((b) => `  ${b.source} -> ${b.target}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("every references/<name>.md in a skill resolves under skills/<skill>/references/", () => {
    const broken: Array<{ source: string; target: string }> = [];
    for (const file of SKILL_FILES) {
      const body = readFileSync(file, "utf8");
      const skillDir = path.dirname(file);
      const skillRefDir = path.join(skillDir, "references");
      for (const refName of findReferenceLinks(body)) {
        const refPath = path.join(skillRefDir, `${refName}.md`);
        if (!existsSync(refPath)) {
          broken.push({
            source: path.relative(REPO_ROOT, file),
            target: path.relative(REPO_ROOT, refPath),
          });
        }
      }
    }
    expect(
      broken,
      `Broken skill-local reference links found:\n${broken
        .map((b) => `  ${b.source} -> ${b.target}`)
        .join("\n")}`,
    ).toEqual([]);
  });
});
