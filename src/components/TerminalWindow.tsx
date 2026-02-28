"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { X } from "lucide-react";

interface TerminalWindowProps {
    ip: string;
    name: string;
    onClose: () => void;
}

export default function TerminalWindow({ ip, name, onClose }: TerminalWindowProps) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (!terminalRef.current) return;

        const container = terminalRef.current;

        const term = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: '"Fira Code", monospace',
            logLevel: "off",
            theme: {
                background: "#0f172a",
                foreground: "#cbd5e1",
            },
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(container);

        // Safe fit: only call when container has actual dimensions
        const safeFit = () => {
            try {
                if (container.clientWidth > 0 && container.clientHeight > 0) {
                    fitAddon.fit();
                }
            } catch {
                // Ignore fit errors during mount/unmount transitions
            }
        };

        // Delay initial fit until terminal is fully rendered in DOM
        const fitTimer = setTimeout(() => {
            requestAnimationFrame(safeFit);
        }, 100);

        xtermRef.current = term;

        // Connect to backend WebSocket
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || `${window.location.protocol}//${window.location.hostname}:8001`;
        const wsBase = backendUrl.replace(/^http/, 'ws');
        const wsUrl = `${wsBase}/ws/terminal/${ip}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        const sendResize = () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "resize",
                    cols: term.cols,
                    rows: term.rows
                }));
            }
        };

        ws.onopen = () => {
            term.writeln(`\x1b[1;32m[*] Connected to ${name} (${ip})\x1b[0m\r\n`);
            safeFit();
            sendResize();
        };

        ws.onmessage = (event) => {
            term.write(event.data);
        };

        ws.onclose = () => {
            term.writeln("\r\n\x1b[1;31m[!] Connection closed.\x1b[0m");
        };

        ws.onerror = () => {
            term.writeln("\r\n\x1b[1;31m[!] WebSocket error. Check backend connection.\x1b[0m");
        };

        term.onData((data: string) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "data", data }));
            }
        });

        const handleResize = () => {
            safeFit();
            sendResize();
        };
        window.addEventListener("resize", handleResize);

        return () => {
            clearTimeout(fitTimer);
            window.removeEventListener("resize", handleResize);
            ws.close();
            term.dispose();
        };
    }, [ip, name]);

    return (
        <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
                <div className="flex items-center gap-2">
                    <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-mono text-slate-300">{name} - {ip}</span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-slate-800 rounded-md transition-colors text-slate-500 hover:text-white"
                >
                    <X className="size-4" />
                </button>
            </div>
            <div ref={terminalRef} className="flex-1 p-2 overflow-hidden relative" />
        </div>
    );
}
