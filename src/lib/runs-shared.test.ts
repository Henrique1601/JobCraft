import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateEvents, DEFAULT_PROFILE, parseJsonl } from "./runs-shared.ts";

describe("parseJsonl", () => {
  it("parses valid JSONL lines and skips malformed or incomplete lines", () => {
    const input = [
      JSON.stringify({
        timestamp: "2026-11-26T10:00:00Z",
        job_title: "Full-Stack Engineer",
        company: "Acme",
        platform: "LinkedIn",
        track: "Full-Stack",
        language: "PT-BR",
        work_model: "Remoto",
        match_score: 92,
        step: "apply",
        status: "Enviada",
        job_url: "https://example.com/1",
      }),
      "{invalid json",
      JSON.stringify({ timestamp: "2026-11-26T10:01:00Z" }), // missing job_title & company
      "",
    ].join("\n");

    const events = parseJsonl(input);
    assert.equal(events.length, 1);
    assert.equal(events[0].company, "Acme");
    assert.equal(events[0].match_score, 92);
  });
});

describe("aggregateEvents", () => {
  it("deduplicates by job_url, keeps latest status, and computes stats & daily progress", () => {
    const now = new Date("2026-11-26T14:00:00Z");
    const events = parseJsonl(
      [
        JSON.stringify({
          timestamp: "2026-11-26T09:00:00Z",
          job_title: "Frontend Dev",
          company: "Empresa A",
          platform: "Gupy",
          track: "Front-End",
          language: "PT-BR",
          work_model: "Remoto",
          match_score: 85,
          step: "discovery",
          status: "Em Revisão",
          job_url: "https://example.com/a",
        }),
        JSON.stringify({
          timestamp: "2026-11-26T10:00:00Z",
          job_title: "Frontend Dev",
          company: "Empresa A",
          platform: "Gupy",
          track: "Front-End",
          language: "PT-BR",
          work_model: "Remoto",
          match_score: 88,
          step: "submit",
          status: "Enviada",
          job_url: "https://example.com/a",
        }),
        JSON.stringify({
          timestamp: "2026-11-26T11:00:00Z",
          job_title: "AI Engineer",
          company: "Global Corp",
          platform: "LinkedIn",
          track: "AI Engineer",
          language: "EN",
          work_model: "Remoto",
          match_score: 90,
          step: "submit",
          status: "Submitted",
          job_url: "https://example.com/b",
        }),
        JSON.stringify({
          timestamp: "2026-11-25T11:00:00Z",
          job_title: "Backend Dev",
          company: "Old Corp",
          platform: "Indeed",
          track: "Back-End",
          language: "PT-BR",
          work_model: "Híbrido",
          match_score: 50,
          step: "filter",
          status: "Descartada",
          job_url: "https://example.com/c",
        }),
      ].join("\n")
    );

    const data = aggregateEvents(events, DEFAULT_PROFILE, now);
    assert.equal(data.stats.total, 3);
    assert.equal(data.stats.sent, 2);
    assert.equal(data.stats.discarded, 1);
    assert.equal(data.stats.review, 0);
    assert.equal(data.stats.avg_match, Math.round((88 + 90 + 50) / 3));
    assert.deepEqual(data.stats.today_sent, { national: 1, international: 1 });

    const jobA = data.jobs.find((j) => j.id === "https://example.com/a");
    assert.ok(jobA);
    assert.equal(jobA.timeline.length, 2);
    assert.equal(jobA.latest_status, "Enviada");
    assert.equal(jobA.match_score, 88);
  });
});
