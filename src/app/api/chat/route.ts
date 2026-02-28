import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    const { messages, mode } = await req.json();
    const lastMessage = messages[messages.length - 1]?.content;

    if (!lastMessage) {
        return NextResponse.json({ error: "No message found" }, { status: 400 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout

    try {
        const response = await fetch(`${process.env.BACKEND_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: lastMessage, messages: messages, mode: mode || "ops" }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Backend error: ${response.statusText}`);
        }

        const encoder = new TextEncoder();
        // stream:true keeps incomplete multi-byte sequences buffered across reads
        const decoder = new TextDecoder('utf-8', { fatal: false });

        const stream = new ReadableStream({
            async start(controller) {
                const reader = response.body?.getReader();
                if (!reader) {
                    controller.close();
                    return;
                }

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = decoder.decode(value, { stream: true });
                        // Convert each chunk to Vercel AI SDK data stream format
                        // Format: 0:"token"\n
                        const formattedChunk = `0:${JSON.stringify(chunk)}\n`;
                        controller.enqueue(encoder.encode(formattedChunk));
                    }
                } catch (e) {
                    controller.error(e);
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'X-Vercel-AI-Data-Stream': 'v1'
            }
        });
    } catch (error: unknown) {
        console.error("Chat API Proxy Error:", error);
        return new Response(`0:${JSON.stringify("Error connecting to AI backend.")}\n`, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'X-Vercel-AI-Data-Stream': 'v1'
            }
        });
    }
}
