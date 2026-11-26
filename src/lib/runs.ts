import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getStore } from "@netlify/blobs";
import {
  aggregateEvents,
  DEFAULT_PROFILE,
  parseJsonl,
  type DashboardData,
  type ProfileSummary,
  type RunEvent,
} from "./runs-shared";

export type { DashboardData, JobRecord, ProfileSummary, RunEvent } from "./runs-shared";

const BLOBS_STORE_NAME = "jobcraft-runs";
const BLOBS_KEY = "events.jsonl";

function getBaseDir(): string {
  return process.env.JOB_COPILOT_DIR || path.join(os.homedir(), ".gemini", "job-copilot");
}

function isNetlifyRuntime(): boolean {
  return Boolean(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT);
}

function readProfileSummary(baseDir: string): ProfileSummary {
  try {
    const cvsDir = path.join(baseDir, "cvs");
    const cvsCount = fs.existsSync(cvsDir)
      ? fs.readdirSync(cvsDir).filter((f) => f.toLowerCase().endsWith(".pdf")).length
      : 0;

    const profilePath = path.join(baseDir, "master-profile.json");
    if (!fs.existsSync(profilePath)) {
      return { ...DEFAULT_PROFILE, cvs_count: cvsCount };
    }
    const raw = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
    const t = raw.targeting || {};
    return {
      mode: String(t.mode || DEFAULT_PROFILE.mode),
      min_match_score: Number(t.min_match_score ?? DEFAULT_PROFILE.min_match_score),
      daily_limits: {
        national: Number(t.daily_limits?.national ?? 10),
        international: Number(t.daily_limits?.international ?? 10),
      },
      tracks: Array.isArray(t.tracks) ? t.tracks : DEFAULT_PROFILE.tracks,
      cvs_count: cvsCount,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

function loadLocalEvents(baseDir: string): RunEvent[] {
  const runsDir = path.join(baseDir, "runs");
  if (!fs.existsSync(runsDir)) return [];

  const events: RunEvent[] = [];
  const files = fs
    .readdirSync(runsDir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort();

  for (const file of files) {
    const content = fs.readFileSync(path.join(runsDir, file), "utf-8");
    events.push(...parseJsonl(content));
  }
  return events;
}

async function loadCloudEvents(): Promise<RunEvent[]> {
  if (!isNetlifyRuntime()) return [];
  try {
    const store = getStore(BLOBS_STORE_NAME);
    const content = await store.get(BLOBS_KEY, { type: "text" });
    return content ? parseJsonl(content) : [];
  } catch {
    return [];
  }
}

export async function loadDashboardData(): Promise<DashboardData> {
  const baseDir = getBaseDir();
  const [localEvents, cloudEvents] = await Promise.all([
    Promise.resolve(loadLocalEvents(baseDir)),
    loadCloudEvents(),
  ]);
  const events = [...localEvents, ...cloudEvents];
  return aggregateEvents(events, readProfileSummary(baseDir));
}

export async function appendRunEvents(newEvents: RunEvent[]): Promise<{ saved: number; target: "netlify-blobs" | "local-fs" }> {
  const jsonlLines = newEvents.map((ev) => JSON.stringify(ev)).join("\n") + "\n";

  if (isNetlifyRuntime()) {
    const store = getStore(BLOBS_STORE_NAME);
    const existing = (await store.get(BLOBS_KEY, { type: "text" })) || "";
    const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
    await store.set(BLOBS_KEY, `${existing}${prefix}${jsonlLines}`);
    return { saved: newEvents.length, target: "netlify-blobs" };
  }

  const baseDir = getBaseDir();
  const runsDir = path.join(baseDir, "runs");
  fs.mkdirSync(runsDir, { recursive: true });
  const dateStr = new Date().toISOString().slice(0, 10);
  fs.appendFileSync(path.join(runsDir, `synced-${dateStr}.jsonl`), jsonlLines, "utf-8");
  return { saved: newEvents.length, target: "local-fs" };
}
