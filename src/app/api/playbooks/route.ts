import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

async function proxy(req: NextRequest, path: string) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
        const body = req.method === "GET" ? undefined : await req.text();
        const res = await fetch(`${BACKEND}${path}`, {
            method: req.method,
            headers: { "Content-Type": "application/json" },
            body,
            signal: ctrl.signal,
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: msg }, { status: 503 });
    } finally {
        clearTimeout(timer);
    }
}

export const GET = (req: NextRequest) => proxy(req, "/api/playbooks");
export const POST = (req: NextRequest) => proxy(req, "/api/playbooks");
