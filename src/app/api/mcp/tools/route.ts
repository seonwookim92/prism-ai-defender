import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const response = await fetch(`${process.env.BACKEND_URL}/api/mcp/tools`, {
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`Backend error: ${response.statusText}`);
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error("MCP tools proxy error:", error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : String(error),
            tools: []
        }, { status: 500 });
    }
}
