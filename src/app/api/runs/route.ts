import { NextResponse } from "next/server";
import { appendRunEvents, loadDashboardData, type RunEvent } from "@/lib/runs";

export async function GET() {
  const data = await loadDashboardData();
  return NextResponse.json(data);
}

function normalizeIncomingEvents(body: unknown): RunEvent[] {
  const rawList = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { events?: unknown }).events)
      ? (body as { events: unknown[] }).events
      : body && typeof body === "object"
        ? [body]
        : [];

  const valid: RunEvent[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const ev = item as Partial<RunEvent>;
    if (!ev.job_title || !ev.company || !ev.step || !ev.status) continue;
    valid.push({
      timestamp: String(ev.timestamp || new Date().toISOString()),
      job_title: String(ev.job_title),
      company: String(ev.company),
      platform: String(ev.platform || "Desconhecida"),
      track: String(ev.track || "Full-Stack"),
      language: String(ev.language || "PT-BR"),
      work_model: String(ev.work_model || "Remoto"),
      match_score: Number(ev.match_score || 0),
      step: String(ev.step),
      status: String(ev.status),
      job_url: String(ev.job_url || ""),
      screenshot_path: ev.screenshot_path ? String(ev.screenshot_path) : undefined,
      error_reason: ev.error_reason ? String(ev.error_reason) : undefined,
    });
  }
  return valid;
}

export async function POST(request: Request) {
  const expectedToken = process.env.JOBCRAFT_API_TOKEN;
  if (expectedToken) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "JOBCRAFT_API_TOKEN must be configured in production" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const events = normalizeIncomingEvents(body);
  if (events.length === 0) {
    return NextResponse.json(
      { error: "No valid RunEvent items found (required: job_title, company, step, status)" },
      { status: 400 }
    );
  }

  const result = await appendRunEvents(events);
  return NextResponse.json({ ok: true, ...result }, { status: 201 });
}
