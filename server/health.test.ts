import { describe, expect, it, vi } from "vitest";
import { checkHealth, type HealthBody } from "./health.js";

const env = { supabaseUrl: "https://example.supabase.co", publishableKey: "sb_publishable_test" };
const fixedNow = () => new Date("2026-11-11T12:00:00Z");
const body = async (r: Response) => (await r.json()) as HealthBody;

describe("GET /api/health", () => {
  it("reports 'unconfigured' (not an outage) when Supabase settings are missing", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const res = await checkHealth({}, fetchImpl, fixedNow);
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true, db: "unconfigured", time: "2026-11-11T12:00:00.000Z" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("calls the ping function with the publishable key and reports 'up'", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('"2026-11-11T12:00:00Z"', { status: 200 }));
    const res = await checkHealth(env, fetchImpl, fixedNow);
    expect(res.status).toBe(200);
    expect((await body(res)).db).toBe("up");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://example.supabase.co/rest/v1/rpc/ping");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.apikey).toBe("sb_publishable_test");
  });

  it("returns 503 'down' when the database answers with an error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 500 }));
    const res = await checkHealth(env, fetchImpl, fixedNow);
    expect(res.status).toBe(503);
    expect(await body(res)).toMatchObject({ ok: false, db: "down" });
  });

  it("returns 503 'down' instead of throwing when the network fails or times out", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const res = await checkHealth(env, fetchImpl, fixedNow);
    expect(res.status).toBe(503);
    expect(await body(res)).toMatchObject({ ok: false, db: "down" });
  });

  it("is never cached, so an outage can't hide behind a stale 'up'", async () => {
    const res = await checkHealth({}, fetch, fixedNow);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
