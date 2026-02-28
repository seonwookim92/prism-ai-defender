import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const response = await fetch(`${process.env.BACKEND_URL}/api/report-bug`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await response.json();
        return NextResponse.json(data);
    } catch (e) {
        console.error("report-bug proxy error:", e);
        return NextResponse.json({ success: false, message: "서버 연결 오류" }, { status: 500 });
    }
}
