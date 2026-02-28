"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
    ShieldCheck, Upload, Loader2, CheckCircle2, XCircle, HelpCircle,
    Clock, Download, Pause, Play, FileText, Send,
    ChevronDown, ChevronRight, Wrench, Server, X, AlertTriangle,
    Ban, Radar, Cpu
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Asset { name: string; ip: string; }
type Severity = "critical" | "high" | "medium" | "low";
type ItemStatus = "pending" | "verifying" | "confirmed" | "clear" | "needs_review";
type Phase = "idle" | "analyzing" | "checklist" | "verifying" | "paused" | "done";

interface CheckItem {
    id: string;
    title: string;
    severity: Severity;
    category: string;
    description: string;
    evidence: string;
    analysis?: string; // AI's primary analysis in Korean
    checked: boolean;
    status: ItemStatus;
}

interface ChatMsg {
    role: "user" | "assistant";
    content: string;
    itemId?: string;
    queued?: boolean;
}

interface AnalysisProgress {
    current: number;
    total: number;
    found: number;
    status: string;
    counts?: { critical: number; high: number; medium: number; low: number };
}

interface AnalysisStats {
    chunksProcessed: number;
    rawFound: number;
    duplicatesRemoved: number;
    source: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const UPLOAD_CHUNK_SIZE = 20_000; // chars per upload chunk (~5K tokens)
const UPLOAD_CHUNK_OVERLAP = 300;  // overlap to avoid boundary cuts
const SERVER_CHUNK_LINES = 600;    // lines per SSH read chunk

// ── Helpers ───────────────────────────────────────────────────────────────────
const SEV: Record<Severity, string> = {
    critical: "bg-red-500/20 text-red-400 border-red-500/30",
    high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    low: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

function SeverityBadge({ sev }: { sev: Severity }) {
    return (
        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0", SEV[sev])}>
            {sev}
        </span>
    );
}

function StatusIcon({ status }: { status: ItemStatus }) {
    switch (status) {
        case "verifying": return <Loader2 className="size-3.5 text-blue-400 animate-spin shrink-0" />;
        case "confirmed": return <XCircle className="size-3.5 text-red-400 shrink-0" />;
        case "clear": return <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />;
        case "needs_review": return <HelpCircle className="size-3.5 text-yellow-400 shrink-0" />;
        default: return <Clock className="size-3.5 text-slate-600 shrink-0" />;
    }
}

// ── Stream reader ─────────────────────────────────────────────────────────────
async function streamChat(
    message: string,
    history: { role: string; content: string }[],
    mode: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
): Promise<string> {
    const allMsgs = [...history, { role: "user", content: message }];
    const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, messages: allMsgs, mode }),
        signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
            if (line.startsWith("0:")) {
                try { const c = JSON.parse(line.slice(2)); full += c; onChunk(c); } catch { /* ignore */ }
            }
        }
    }
    if (buffer.startsWith("0:")) {
        try { const c = JSON.parse(buffer.slice(2)); full += c; onChunk(c); } catch { /* ignore */ }
    }
    return full;
}

// ── Parsing helpers ───────────────────────────────────────────────────────────
function parseChunkFindings(raw: string): Omit<CheckItem, "id">[] {
    const stripped = raw
        .replace(/\[THOUGHT\][\s\S]*?\[\/THOUGHT\]/gi, "")
        .replace(/\[MCP_TOOL_CALL\][\s\S]*?\[\/MCP_TOOL_CALL\]/gi, "")
        .replace(/\[SYSTEM\][^\n]*/g, "")
        .replace(/```json\n?/g, "").replace(/```\n?/g, "")
        .trim();
    const arrMatch = stripped.match(/\[[\s\S]*\]/);
    if (!arrMatch) return [];
    try {
        const parsed = JSON.parse(arrMatch[0]);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(item => ({
            title: (item.title ?? item.subject ?? "Unknown Finding") as string,
            severity: (["critical", "high", "medium", "low"].includes(item.severity)
                ? item.severity : "medium") as Severity,
            category: (item.category ?? "Other") as string,
            description: (item.description ?? "") as string,
            evidence: (item.evidence ?? "") as string,
            analysis: (item.analysis ?? item.summary ?? item.ai_findings ?? "") as string,
            checked: true,
            status: "pending" as ItemStatus,
        }));
    } catch { return []; }
}

function ScanningAnimation() {
    return (
        <div className="relative size-32 mx-auto mb-10">
            {/* Outer rings */}
            <div className="absolute inset-0 rounded-full border border-red-500/5 animate-[ping_3s_infinite]" />
            <div className="absolute inset-2 rounded-full border border-red-500/10 animate-[ping_2s_infinite]" />

            {/* Spinning radar sweep */}
            <div className="absolute inset-0 rounded-full border border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.1)]">
                <div className="absolute inset-0 bg-gradient-to-tr from-red-600/20 to-transparent rounded-full animate-spin duration-[3000ms]" />
            </div>

            {/* Scanning horizontal line effect */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent animate-scanLine opacity-50 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />

            {/* Center icon */}
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="size-16 rounded-full bg-slate-950 flex items-center justify-center border border-red-500/30 relative">
                    <Radar className="size-8 text-red-500 animate-pulse" />
                    <div className="absolute inset-0 rounded-full border-2 border-red-500/20 animate-ping opacity-30" />
                </div>
            </div>

            {/* Small circling dot */}
            <div className="absolute w-full h-full animate-[spin_4s_linear_infinite]">
                <div className="absolute top-0 left-1/2 -ml-1 size-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
            </div>
        </div>
    );
}

function AuditResultCard({ type }: { type: string }) {
    const isConfirmed = type === "confirmed";
    const isClear = type === "clear";
    const title = isConfirmed ? "VULNERABILITY CONFIRMED" : isClear ? "SYSTEM SECURE / CLEAR" : "MANUAL REVIEW REQUIRED";
    const color = isConfirmed ? "text-red-500" : isClear ? "text-emerald-500" : "text-amber-500";
    const bgColor = isConfirmed ? "bg-red-500/[0.03]" : isClear ? "bg-emerald-500/[0.03]" : "bg-amber-500/[0.03]";
    const borderColor = isConfirmed ? "border-red-500/30" : isClear ? "border-emerald-500/30" : "border-amber-500/30";
    const Icon = isConfirmed ? Ban : isClear ? CheckCircle2 : AlertTriangle;

    return (
        <div className={cn("mt-8 p-6 rounded-3xl border flex flex-col gap-4 shadow-2xl relative overflow-hidden group/card transition-all duration-700 animate-in zoom-in-95", bgColor, borderColor)}>
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover/card:opacity-10 transition-opacity pointer-events-none">
                <Icon className="size-32 rotate-12" />
            </div>
            <div className="flex items-center gap-4 relative z-10">
                <div className={cn("size-12 rounded-2xl flex items-center justify-center border shadow-xl relative", isConfirmed ? "bg-red-600 border-red-400" : isClear ? "bg-emerald-600 border-emerald-400" : "bg-amber-600 border-amber-400")}>
                    <Icon className="size-7 text-white" />
                    <div className="absolute inset-0 rounded-2xl animate-ping opacity-20 bg-current pointer-events-none" />
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 flex items-center gap-2">
                        <ShieldCheck className="size-3" />
                        Verification Conclusion
                    </span>
                    <h3 className={cn("text-xl font-black tracking-tighter", color)}>{title}</h3>
                </div>
            </div>
            <p className="text-[13px] leading-relaxed text-slate-400 pl-1">
                {isConfirmed
                    ? "심층 분석 결과, 실제 공격 가능성이 있는 보안 위협이 확인되었습니다. 발견된 근거 데이터와 시스템 설정을 즉시 대조하고 패치나 설정 변경 등 대응 조치를 권장합니다."
                    : isClear
                        ? "검증 결과 해당 항목은 위협이 아니거나 오탐(False Positive)으로 판단됩니다. 현재 시스템 상태는 안전하며 추가적인 조치가 필요하지 않습니다."
                        : "자동화된 분석만으로는 위협 여부를 확정할 수 없습니다. 시스템 로그 분석이나 특수 도구를 활용한 전문가의 수동 검토가 필요합니다."}
            </p>
        </div>
    );
}

function chunkText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
        chunks.push(text.slice(start, start + UPLOAD_CHUNK_SIZE));
        if (start + UPLOAD_CHUNK_SIZE >= text.length) break;
        start += UPLOAD_CHUNK_SIZE - UPLOAD_CHUNK_OVERLAP;
    }
    return chunks.length ? chunks : [text];
}

// ── System status line ────────────────────────────────────────────────────────
function SystemLine({ text }: { text: string }) {
    return (
        <div className="flex items-center gap-2 my-2 py-1.5 px-3 rounded-lg bg-blue-500/5 border border-blue-500/10 text-[11px] text-blue-400/70 font-mono">
            <div className="size-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <span>{text.replace(/^도구 실행 중:\s*/, "⚙ ").replace(/^오류 발생:\s*/, "✗ ").replace(/^최대 도구 실행 단계/, "⚠ 최대 도구 실행 단계")}</span>
        </div>
    );
}

// ── Tool call block ───────────────────────────────────────────────────────────
function ToolBlock({ raw }: { raw: string }) {
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(raw); } catch { /* ignore */ }
    const toolName = (data.tool || data.tool_name || "tool") as string;
    const result = (data.result || {}) as Record<string, unknown>;
    const out = (result.stdout || result.stderr || (result.status === "error" ? result.message : JSON.stringify(result, null, 2))) as string;
    const args = data.args as Record<string, any> | undefined;
    const command = args?.command || args?.cmd;
    const isError = result.status === "error";
    const [open, setOpen] = useState(true);

    return (
        <div className={cn("my-4 rounded-xl overflow-hidden shadow-2xl group/tool border", isError ? "border-red-500/30 bg-[#0c0e14]" : "border-slate-700/50 bg-[#0c0e14]")}>
            <button
                onClick={() => setOpen(!open)}
                className={cn("w-full flex items-center gap-2.5 px-4 py-3 transition-all border-b border-white/5", isError ? "bg-red-950/30 hover:bg-red-950/50" : "bg-[#161b22] hover:bg-[#1c2128]")}
            >
                <div className={cn("size-6 rounded-lg flex items-center justify-center shrink-0 border transition-colors", isError ? "bg-red-500/10 border-red-500/30 group-hover/tool:border-red-500/50" : "bg-emerald-500/10 border-emerald-500/20 group-hover/tool:border-emerald-500/40")}>
                    <Wrench className={cn("size-3.5", isError ? "text-red-400" : "text-emerald-400")} />
                </div>
                <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
                    <span className={cn("font-mono text-[11px] font-bold uppercase tracking-wider", isError ? "text-red-400" : "text-emerald-400")}>{toolName}</span>
                    {command && (
                        <span className="text-slate-500 font-mono text-[10px] truncate max-w-full opacity-70 italic">
                            $ {String(command)}
                        </span>
                    )}
                </div>
                {isError && <span className="text-[9px] font-bold text-red-400/60 uppercase tracking-widest shrink-0">Error</span>}
                {open ? <ChevronDown className="size-4 text-slate-500" /> : <ChevronRight className="size-4 text-slate-500" />}
            </button>
            {open && (
                <div className="p-0 flex flex-col animate-in slide-in-from-top-1 duration-200">
                    <div className="bg-[#0c0e14] p-5 font-mono text-[12px] leading-relaxed relative">
                        {command && (
                            <div className="flex gap-2.5 mb-5 text-blue-400/90 font-bold border-b border-white/5 pb-4">
                                <span className="text-emerald-500 select-none opacity-80">ssh@target:~$</span>
                                <span className="break-all text-slate-100">{String(command)}</span>
                                <span className="w-1.5 h-4 bg-emerald-500 animate-pulse ml-0.5" />
                            </div>
                        )}
                        <div className="relative group/pre">
                            <pre className="text-slate-400 whitespace-pre-wrap max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent pr-2 custom-scrollbar selection:bg-emerald-500/30 transition-colors group-hover/pre:text-slate-200">
                                {out || <span className="text-slate-600 italic">Process completed with no output</span>}
                            </pre>
                            <div className="absolute top-0 right-0 p-2 opacity-0 group-hover/pre:opacity-100 transition-opacity">
                                <div className="px-1.5 py-0.5 rounded bg-slate-800 text-[8px] text-slate-500 font-bold uppercase tracking-widest">stdout</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MsgBubble({ msg, streaming, onRef }: { msg: ChatMsg; streaming?: boolean; onRef?: (el: HTMLDivElement | null) => void }) {
    // Strip internal reasoning and extract structured metadata
    let content = msg.content
        .replace(/\[THOUGHT\][\s\S]*?\[\/THOUGHT\]/gi, "")
        .replace(/(Tool Call|Tool Response|도구 실행|실행 결과):?\s*/gi, "")
        .trim();

    const resultMatch = msg.content.match(/\[AUDIT_RESULT:([^\]]+)\]/i);
    const resultType = resultMatch?.[1];
    content = content.replace(/\[AUDIT_RESULT:[^\]]*\]/gi, "").trim();

    // Split content into text, tool-call, and system-status parts
    const parts: { type: "text" | "tool" | "system"; content: string }[] = [];
    const splitRe = /(\[MCP_TOOL_CALL\][\s\S]*?\[\/MCP_TOOL_CALL\]|\[SYSTEM\][^\n]*)/g;
    let last = 0, m: RegExpExecArray | null;
    while ((m = splitRe.exec(content)) !== null) {
        if (m.index > last) {
            const t = content.slice(last, m.index).trim();
            if (t) parts.push({ type: "text", content: t });
        }
        if (m[0].startsWith("[MCP_TOOL_CALL]")) {
            parts.push({ type: "tool", content: m[0].slice("[MCP_TOOL_CALL]".length, -"[/MCP_TOOL_CALL]".length) });
        } else {
            parts.push({ type: "system", content: m[0].replace(/^\[SYSTEM\]\s*/, "") });
        }
        last = splitRe.lastIndex;
    }
    if (last < content.length) {
        const t = content.slice(last).trim();
        if (t) parts.push({ type: "text", content: t });
    }

    if (msg.role === "user") {
        const isItemMsg = !!msg.itemId;

        // Detailed parsing for Item Verification messages
        let structured: any = null;
        if (isItemMsg) {
            const titleMatch = content.match(/\*\*제목\*\*: (.*)/);
            const sevMatch = content.match(/\*\*심각도\*\*: (.*)/);
            const catMatch = content.match(/\*\*카테고리\*\*: (.*)/);
            const analysisMatch = content.match(/### 분석 내용 \(AI Findings\)\n([\s\S]*?)\n\n### 세부 설명/);
            const descMatch = content.match(/### 세부 설명\n([\s\S]*?)\n\n### 발견된 근거/);
            const evidenceMatch = content.match(/### 발견된 근거 \(Evidence\)\n([\s\S]*)/);

            structured = {
                title: titleMatch?.[1],
                sev: sevMatch?.[1] as Severity,
                cat: catMatch?.[1],
                analysis: analysisMatch?.[1],
                desc: descMatch?.[1],
                evidence: evidenceMatch?.[1]
            };
        }

        return (
            <div className={cn("flex justify-end mb-4 px-2", msg.queued && "opacity-60")}>
                <div
                    ref={onRef}
                    className={cn(
                        "max-w-[85%] bg-slate-800 border border-slate-700 rounded-3xl rounded-tr-sm px-5 py-4 text-sm text-slate-300 break-words shadow-2xl relative transition-all duration-500",
                        isItemMsg && "bg-slate-900 border-red-900/40 ring-1 ring-red-500/10 shadow-red-900/10"
                    )}
                >
                    {msg.queued && <span className="absolute -top-6 right-0 text-[9px] text-blue-400 font-bold uppercase tracking-[0.2em] animate-pulse">⏳ Queueing Phase</span>}

                    {isItemMsg && structured?.title ? (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-white/5">
                                <div className="flex items-center gap-2">
                                    <div className="size-6 rounded-lg bg-red-500/10 flex items-center justify-center">
                                        <FileText className="size-3.5 text-red-500" />
                                    </div>
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Verification Request</span>
                                </div>
                                <SeverityBadge sev={structured.sev} />
                            </div>

                            <div className="space-y-1">
                                <h4 className="text-base font-bold text-white tracking-tight">{structured.title}</h4>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{structured.cat}</p>
                            </div>

                            <div className="grid gap-3">
                                <div className="bg-slate-950/40 rounded-xl p-3 border border-white/5">
                                    <span className="text-[9px] font-bold text-slate-600 uppercase block mb-1.5 tracking-tighter">AI Analysis</span>
                                    <p className="text-[12px] leading-relaxed text-slate-300">{structured.analysis}</p>
                                </div>

                                <div className="bg-slate-950/40 rounded-xl p-3 border border-white/5">
                                    <span className="text-[9px] font-bold text-slate-600 uppercase block mb-1.5 tracking-tighter">Description</span>
                                    <p className="text-[12px] leading-relaxed text-slate-400 italic">{structured.desc}</p>
                                </div>

                                {structured.evidence && (
                                    <div className="bg-black/60 rounded-xl p-3 border border-white/5 font-mono">
                                        <span className="text-[9px] font-bold text-red-500/60 uppercase block mb-2 tracking-tighter">Discovery Evidence</span>
                                        <pre className="text-[11px] text-slate-400 leading-relaxed overflow-x-auto custom-scrollbar whitespace-pre-wrap">{structured.evidence}</pre>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="whitespace-pre-wrap leading-relaxed">{content}</div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="mb-8 animate-in fade-in slide-in-from-bottom-2 px-2">
            <div className="flex items-start gap-4">
                <div className="size-9 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shrink-0 mt-1.5 border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                    <ShieldCheck className="size-5 text-white" />
                </div>
                <div className="flex-1 min-w-0 space-y-3" ref={onRef}>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black text-red-500/80 uppercase tracking-[0.2em]">Cortex AI Audit</span>
                        <div className="h-px flex-1 bg-gradient-to-r from-red-500/20 to-transparent" />
                    </div>

                    <div className="text-[14px] text-slate-200 leading-relaxed">
                        {parts.map((part, i) =>
                            part.type === "tool"
                                ? <ToolBlock key={i} raw={part.content} />
                                : part.type === "system"
                                    ? <SystemLine key={i} text={part.content} />
                                    : (
                                        <div key={i} className="prose prose-invert prose-sm max-w-none mb-4 prose-p:leading-relaxed prose-code:text-emerald-400 prose-code:bg-emerald-500/5 prose-pre:bg-[#0c0e14] prose-pre:border prose-pre:border-white/5">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {part.content}
                                            </ReactMarkdown>
                                        </div>
                                    )
                        )}
                    </div>

                    {streaming && (
                        <div className="inline-flex items-center gap-3 px-4 py-2 bg-red-500/[0.04] rounded-2xl border border-red-500/10 mt-4 animate-in fade-in slide-in-from-left-2 shadow-sm">
                            <div className="relative size-4">
                                <Loader2 className="absolute inset-0 size-4 text-red-500 animate-spin" />
                                <div className="absolute inset-0 size-4 rounded-full border border-red-500 animate-ping opacity-20" />
                            </div>
                            <span className="text-[11px] font-black text-red-500 uppercase tracking-widest flex items-center gap-2">
                                <Cpu className="size-3" />
                                Cortex Reasoning...
                            </span>
                        </div>
                    )}

                    {resultType && <AuditResultCard type={resultType} />}
                </div>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AuditPage() {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const [scanFile, setScanFile] = useState<{ name: string; text: string } | null>(null);
    const [inputMode, setInputMode] = useState<"upload" | "path">("upload");
    const [serverFilePath, setServerFilePath] = useState("");
    const [phase, setPhase] = useState<Phase>("idle");
    const [checkItems, setCheckItems] = useState<CheckItem[]>([]);
    const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
    const [streamBuf, setStreamBuf] = useState("");
    const [userInput, setUserInput] = useState("");
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
    const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
    const [analysisStats, setAnalysisStats] = useState<AnalysisStats | null>(null);
    const [loading, setLoading] = useState(false);

    const [activeTab, setActiveTab] = useState<"checklist" | "results">("checklist");
    const [activityLog, setActivityLog] = useState<{ id: string; time: string; msg: string; type: "info" | "success" | "warning" | "error" }[]>([]);
    const logRef = useRef<HTMLDivElement>(null);

    const addLog = (msg: string, type: "info" | "success" | "warning" | "error" = "info") => {
        const time = new Date().toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setActivityLog(prev => [...prev.slice(-19), { id: Math.random().toString(36).substr(2, 9), time, msg, type }]);
    };

    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [activityLog]);
    const pausedRef = useRef(false);
    const resumeCbRef = useRef<(() => void) | null>(null);
    const historyRef = useRef<{ role: string; content: string }[]>([]);
    const pendingMsgsRef = useRef<string[]>([]);
    const runningRef = useRef(false);
    const abortRef = useRef<AbortController | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load assets
    useEffect(() => {
        fetch("/api/onboarding/status")
            .then(r => r.json())
            .then(data => {
                if (data.config?.assets) {
                    const parsed: Asset[] = typeof data.config.assets === "string"
                        ? JSON.parse(data.config.assets)
                        : data.config.assets;
                    setAssets(parsed);
                }
            })
            .catch(console.error);
    }, []);

    // Auto-scroll
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMsgs, streamBuf]);

    // ── Pause / Resume ──────────────────────────────────────────────────────
    const waitIfPaused = () => new Promise<void>(resolve => {
        if (!pausedRef.current) { resolve(); return; }
        resumeCbRef.current = resolve;
    });

    const handlePause = () => {
        pausedRef.current = true;
        setPhase("paused");
    };

    const handleResume = () => {
        pausedRef.current = false;
        setPhase("verifying");
        resumeCbRef.current?.();
        resumeCbRef.current = null;
    };

    const handleStop = () => {
        runningRef.current = false;
        pausedRef.current = false;
        resumeCbRef.current?.();
        resumeCbRef.current = null;
        setPhase("done");
    };

    const scrollToMsg = (itemId: string) => {
        const el = msgRefs.current[itemId];
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            el.classList.add("ring-4", "ring-emerald-500/40", "ring-offset-8", "ring-offset-[#0a0c12]", "z-20", "scale-[1.02]", "shadow-[0_0_50px_rgba(16,185,129,0.2)]");
            setTimeout(() => {
                el.classList.remove("ring-4", "ring-emerald-500/40", "ring-offset-8", "ring-offset-[#0a0c12]", "z-20", "scale-[1.02]", "shadow-[0_0_50px_rgba(16,185,129,0.2)]");
            }, 2500);
        }
    };

    // ── History helpers ─────────────────────────────────────────────────────
    const pushMsg = (msg: ChatMsg) => {
        setChatMsgs(prev => [...prev, msg]);
        if (!msg.queued) {
            historyRef.current = [...historyRef.current, { role: msg.role, content: msg.content }];
        }
    };

    const resolveQueuedMsg = (content: string) => {
        setChatMsgs(prev => {
            const idx = prev.findIndex(m => m.queued && m.content === content);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], queued: false };
            return next;
        });
        historyRef.current = [...historyRef.current, { role: "user", content }];
    };

    // ── File handling ───────────────────────────────────────────────────────
    const handleFileSelect = (file: File) => {
        const reader = new FileReader();
        reader.onload = () => setScanFile({ name: file.name, text: reader.result as string });
        reader.readAsText(file);
    };

    // ── Chunked analysis core ───────────────────────────────────────────────
    const analyzeTextChunk = useCallback(async (
        text: string,
        chunkLabel: string,
        signal: AbortSignal,
        onStream: (buf: string) => void,
    ): Promise<Omit<CheckItem, "id">[]> => {
        if (!text.trim()) return [];
        let buf = "";
        try {
            const full = await streamChat(
                `${chunkLabel}\n\n${text}`,
                [],
                "audit_analysis",
                (c) => { buf += c; onStream(buf); },
                signal,
            );
            return parseChunkFindings(full);
        } catch {
            return [];
        }
    }, []);

    // ── Cancel analysis ─────────────────────────────────────────────────────
    const handleCancelAnalysis = () => {
        abortRef.current?.abort();
        setPhase("idle");
        setAnalysisProgress(null);
        setStreamBuf("");
    };

    // ── Analysis ────────────────────────────────────────────────────────────
    const handleAnalyze = async () => {
        if (!selectedAsset) return;
        if (inputMode === "upload" && !scanFile) return;
        if (inputMode === "path" && !serverFilePath.trim()) return;

        const ctrl = new AbortController();
        abortRef.current = ctrl;

        setPhase("analyzing");
        setStreamBuf("");
        setCheckItems([]);
        setChatMsgs([]);
        setAnalysisStats(null);
        historyRef.current = [];

        // Accumulated deduplicated findings
        const allFindings: Omit<CheckItem, "id">[] = [];
        let rawTotal = 0;

        const addFindings = (newItems: Omit<CheckItem, "id">[]) => {
            let addedCount = 0;
            for (const f of newItems) {
                rawTotal++;
                const key = f.title.toLowerCase().trim();
                // Deduplicate by title
                if (!allFindings.some(r => r.title.toLowerCase().trim() === key)) {
                    allFindings.push(f);
                    addedCount++;
                }
            }

            // Severity counts for progress ticker
            const counts = allFindings.reduce((acc, curr) => {
                acc[curr.severity]++;
                return acc;
            }, { critical: 0, high: 0, medium: 0, low: 0 });

            // Incremental update CheckItems
            setCheckItems(allFindings.map((item, i) => ({ ...item, id: String(i + 1) })));

            setAnalysisProgress(prev => prev ? {
                ...prev,
                found: allFindings.length,
                counts
            } : null);

            if (addedCount > 0) {
                addLog(`${addedCount}개의 새로운 취약점 항목 발견`, "success");
            }
        };

        try {
            if (inputMode === "upload") {
                // ── Upload mode: chunk text locally ──────────────────────
                const chunks = chunkText(scanFile!.text);
                setAnalysisProgress({
                    current: 0, total: chunks.length, found: 0, status: "준비 중...",
                    counts: { critical: 0, high: 0, medium: 0, low: 0 }
                });
                setActivityLog([]);
                addLog(`${scanFile!.name} 분석 시작 (${chunks.length}개 청크)`, "info");

                for (let i = 0; i < chunks.length; i++) {
                    if (ctrl.signal.aborted) break;

                    const statusMsg = `청크 ${i + 1}/${chunks.length} 분석 중...`;
                    setAnalysisProgress(prev => prev ? {
                        ...prev, current: i + 1, status: statusMsg
                    } : null);
                    addLog(statusMsg, "info");
                    setStreamBuf("");

                    const findings = await analyzeTextChunk(chunks[i], `청크 ${i + 1}/${chunks.length}`, ctrl.signal, setStreamBuf);
                    addFindings(findings);
                }

                if (!ctrl.signal.aborted) {
                    setAnalysisStats({
                        chunksProcessed: chunks.length,
                        rawFound: rawTotal,
                        duplicatesRemoved: rawTotal - allFindings.length,
                        source: scanFile!.name,
                    });
                }

            } else {
                // ── Server path mode: Verify existence first ─────────────
                const filePath = serverFilePath.trim();
                setAnalysisProgress({ current: 0, total: 0, found: 0, status: "파일 경로 검증 중..." });
                addLog(`경로 검증 시작: ${filePath}`, "info");

                const vRes = await fetch("/api/audit/verify-path", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ip: selectedAsset.ip, file_path: filePath }),
                    signal: ctrl.signal,
                });
                const vData = await vRes.json();
                if (!vRes.ok || !vData.exists) {
                    addLog(`검증 실패: ${vData.error || "파일을 찾을 수 없습니다."}`, "error");
                    throw new Error(vData.error || "파일이 존재하지 않거나 접근할 수 없습니다.");
                }
                addLog(`파일 확인 완료 (Access OK)`, "success");

                // ── Proceed to SSH chunked read ───────────────────
                setAnalysisProgress({ current: 0, total: 0, found: 0, status: "파일 정보 확인 중..." });

                // First request: get total_lines + first chunk content
                const firstRes = await fetch("/api/audit/ssh-read", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ip: selectedAsset.ip, file_path: filePath, start_line: 1, end_line: SERVER_CHUNK_LINES }),
                    signal: ctrl.signal,
                });
                if (!firstRes.ok) {
                    const e = await firstRes.json().catch(() => ({ error: "SSH 연결 실패" }));
                    throw new Error(e.error || `HTTP ${firstRes.status}`);
                }
                const firstData = await firstRes.json();

                if (firstData.error && !firstData.text?.trim()) {
                    throw new Error(firstData.error);
                }

                const totalLines: number = firstData.total_lines ?? 0;
                const totalChunks = totalLines > 0
                    ? Math.ceil(totalLines / SERVER_CHUNK_LINES)
                    : 1;

                setAnalysisProgress({
                    current: 0, total: totalChunks,
                    found: 0,
                    status: `${totalLines.toLocaleString()}줄 파일 — ${totalChunks}개 청크로 분할`,
                    counts: { critical: 0, high: 0, medium: 0, low: 0 }
                });
                setActivityLog([]);
                addLog(`서버 파일 분석 시작: ${filePath}`, "info");
                addLog(`${totalLines.toLocaleString()}줄 발견, ${totalChunks}개 청크로 처리`, "info");

                // Process first chunk
                if (firstData.text?.trim() && !ctrl.signal.aborted) {
                    const statusMsg = `줄 1~${SERVER_CHUNK_LINES} 분석 중 (1/${totalChunks})`;
                    setAnalysisProgress(prev => prev
                        ? { ...prev, current: 1, status: statusMsg }
                        : null);
                    addLog(statusMsg, "info");
                    setStreamBuf("");
                    const f = await analyzeTextChunk(
                        firstData.text,
                        `${selectedAsset.name}:${filePath} (줄 1-${SERVER_CHUNK_LINES})`,
                        ctrl.signal, setStreamBuf,
                    );
                    addFindings(f);
                    setAnalysisProgress(prev => prev ? { ...prev, found: allFindings.length } : null);
                }

                // Process remaining chunks
                for (let chunk = 1; chunk < totalChunks; chunk++) {
                    if (ctrl.signal.aborted) break;

                    const startLine = chunk * SERVER_CHUNK_LINES + 1;
                    const endLine = Math.min((chunk + 1) * SERVER_CHUNK_LINES, totalLines);

                    setAnalysisProgress(prev => prev
                        ? { ...prev, current: chunk + 1, found: allFindings.length, status: `줄 ${startLine.toLocaleString()}~${endLine.toLocaleString()} 읽는 중...` }
                        : null);
                    addLog(`청크 ${chunk + 1}/${totalChunks} 읽는 중...`, "info");

                    const chunkRes = await fetch("/api/audit/ssh-read", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ip: selectedAsset.ip, file_path: filePath, start_line: startLine, end_line: endLine }),
                        signal: ctrl.signal,
                    });
                    if (!chunkRes.ok) {
                        addLog(`청크 ${chunk + 1} 읽기 실패`, "warning");
                        continue;
                    }
                    const chunkData = await chunkRes.json();
                    if (!chunkData.text?.trim()) continue;

                    const statusMsg = `청크 ${chunk + 1}/${totalChunks} 분석 중...`;
                    setAnalysisProgress(prev => prev
                        ? { ...prev, status: statusMsg }
                        : null);
                    addLog(statusMsg, "info");
                    setStreamBuf("");

                    const f = await analyzeTextChunk(
                        chunkData.text,
                        `${selectedAsset.name}:${filePath} (줄 ${startLine}-${endLine})`,
                        ctrl.signal, setStreamBuf,
                    );
                    addFindings(f);
                }

                if (!ctrl.signal.aborted) {
                    setAnalysisStats({
                        chunksProcessed: totalChunks,
                        rawFound: rawTotal,
                        duplicatesRemoved: rawTotal - allFindings.length,
                        source: filePath,
                    });
                }
            }

        } catch (e) {
            if (ctrl.signal.aborted) {
                setPhase("idle");
                setAnalysisProgress(null);
                setStreamBuf("");
                return;
            }
            console.error("Analysis failed:", e);
            // Fall through to show whatever we found so far
        }

        // Finalize — show results even if partially aborted
        let items: CheckItem[] = allFindings.map((item, i) => ({ ...item, id: String(i + 1) }));
        if (items.length === 0) {
            items = [{
                id: "1", title: "의심 항목 없음", severity: "low",
                category: "Other", description: "분석 파일에서 명확한 의심 항목이 발견되지 않았습니다.",
                evidence: "", checked: false, status: "pending",
            }];
        }

        historyRef.current = [];
        setCheckItems(items);
        setStreamBuf("");
        setAnalysisProgress(null);
        setPhase("checklist");
    };

    // ── Verification loop ────────────────────────────────────────────────────
    const handleStartAudit = async () => {
        const checkedItems = checkItems.filter(i => i.checked);
        if (!checkedItems.length || !selectedAsset) return;

        const isResume = phase === "done";
        setPhase("verifying");
        if (!isResume) setChatMsgs([]);
        runningRef.current = true;
        pausedRef.current = false;
        setLoading(true);

        const total = checkedItems.length;

        for (let i = 0; i < total; i++) {
            await waitIfPaused();
            if (!runningRef.current) break;

            while (pendingMsgsRef.current.length > 0) {
                const pending = pendingMsgsRef.current.shift()!;
                resolveQueuedMsg(pending);
                setStreamBuf("");
                let buf = "";
                try {
                    const full = await streamChat(
                        pending,
                        historyRef.current.slice(0, -1),
                        "audit_verify",
                        (c) => { buf += c; setStreamBuf(buf); }
                    );
                    pushMsg({ role: "assistant", content: full });
                } catch (e) {
                    pushMsg({ role: "assistant", content: `오류: ${e}` });
                }
                setStreamBuf("");
                await waitIfPaused();
                if (!runningRef.current) break;
            }
            if (!runningRef.current) break;

            const item = checkedItems[i];
            setCheckItems(prev => prev.map(ci => ci.id === item.id ? { ...ci, status: "verifying" } : ci));

            const userMsg = `[${i + 1}/${total}] 다음 보안 항목을 ${selectedAsset.name}(${selectedAsset.ip})에 SSH로 직접 접속하여 실시간 검증해줘:

**제목**: ${item.title}
**심각도**: ${item.severity}
**카테고리**: ${item.category}

### 분석 내용 (AI Findings)
${item.analysis || "분석 내용 없음"}

### 세부 설명
${item.description}

### 발견된 근거 (Evidence)
${item.evidence || "근거 데이터 없음"}`;

            pushMsg({ role: "user", content: userMsg, itemId: item.id });
            setStreamBuf("");
            let buf = "";

            try {
                const full = await streamChat(
                    userMsg,
                    historyRef.current.slice(0, -1),
                    "audit_verify",
                    (c) => { buf += c; setStreamBuf(buf); }
                );
                pushMsg({ role: "assistant", content: full, itemId: item.id });
                setStreamBuf("");

                let status: ItemStatus = "needs_review";
                if (/\[AUDIT_RESULT:confirmed\]/i.test(full)) status = "confirmed";
                else if (/\[AUDIT_RESULT:clear\]/i.test(full)) status = "clear";
                setCheckItems(prev => prev.map(ci => ci.id === item.id ? { ...ci, status, checked: false } : ci));
            } catch (e) {
                setStreamBuf("");
                pushMsg({ role: "assistant", content: `검증 오류: ${e}` });
                setCheckItems(prev => prev.map(ci => ci.id === item.id ? { ...ci, status: "needs_review", checked: false } : ci));
            }
        }

        runningRef.current = false;
        setLoading(false);
        if (!pausedRef.current) setPhase("done");
    };

    // ── User input during verification ───────────────────────────────────────
    const handleUserSend = async () => {
        if (!userInput.trim()) return;
        const msg = userInput.trim();
        setUserInput("");

        if (phase === "verifying") {
            pendingMsgsRef.current.push(msg);
            setChatMsgs(prev => [...prev, { role: "user", content: msg, queued: true }]);
        } else if (phase === "paused" || phase === "done") {
            pushMsg({ role: "user", content: msg });
            setStreamBuf("");
            let buf = "";
            setLoading(true);
            try {
                const full = await streamChat(
                    msg,
                    historyRef.current.slice(0, -1),
                    "audit_verify",
                    (c) => { buf += c; setStreamBuf(buf); }
                );
                pushMsg({ role: "assistant", content: full });
            } catch (e) {
                pushMsg({ role: "assistant", content: `오류: ${e}` });
            } finally {
                setLoading(false);
            }
            setStreamBuf("");
        }
    };

    // ── Export ───────────────────────────────────────────────────────────────
    const handleExport = () => {
        const confirmed = checkItems.filter(i => i.status === "confirmed");
        const cleared = checkItems.filter(i => i.status === "clear");
        const review = checkItems.filter(i => i.status === "needs_review");

        let md = `# 보안 감사 보고서\n\n`;
        md += `- **대상 자산**: ${selectedAsset?.name} (${selectedAsset?.ip})\n`;
        md += `- **분석 파일**: ${analysisStats?.source ?? (inputMode === "path" ? serverFilePath : scanFile?.name ?? "unknown")}\n`;
        md += `- **감사 일시**: ${new Date().toLocaleString("ko-KR")}\n`;
        if (analysisStats) {
            md += `- **청크 처리**: ${analysisStats.chunksProcessed}개 청크, ${analysisStats.rawFound}개 발견 → 중복 ${analysisStats.duplicatesRemoved}개 제거\n`;
        }
        md += `\n## 요약\n\n| 구분 | 수 |\n|------|----|\n`;
        md += `| 전체 항목 | ${checkItems.filter(i => i.checked).length} |\n`;
        md += `| 확인된 위협 | ${confirmed.length} |\n`;
        md += `| 정상 (false positive) | ${cleared.length} |\n`;
        md += `| 추가 검토 필요 | ${review.length} |\n\n`;

        if (confirmed.length > 0) {
            md += `## 확인된 위협\n\n`;
            confirmed.forEach(item => {
                md += `### [${item.severity.toUpperCase()}] ${item.title}\n`;
                md += `**카테고리**: ${item.category}\n\n${item.description}\n\n**근거**: ${item.evidence}\n\n`;
            });
        }

        md += `## 검증 대화록\n\n`;
        chatMsgs.forEach(msg => {
            const role = msg.role === "user" ? "**검사관**" : "**AI**";
            const content = msg.content
                .replace(/\[THOUGHT\][\s\S]*?\[\/THOUGHT\]/gi, "")
                .replace(/\[AUDIT_RESULT:[^\]]*\]/gi, "")
                .replace(/\[MCP_TOOL_CALL\][\s\S]*?\[\/MCP_TOOL_CALL\]/g, "[SSH 명령 실행]")
                .trim();
            md += `${role}: ${content}\n\n---\n\n`;
        });

        const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit_${selectedAsset?.ip}_${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Derived ──────────────────────────────────────────────────────────────
    const inVerifyPhase = phase === "verifying" || phase === "paused" || phase === "done";
    const confirmed = checkItems.filter(i => i.status === "confirmed").length;
    const cleared = checkItems.filter(i => i.status === "clear").length;
    const needsReview = checkItems.filter(i => i.status === "needs_review").length;
    const checkedCount = checkItems.filter(i => i.checked).length;

    const PHASE_LABEL: Record<Phase, string> = {
        idle: "대기", analyzing: "분석 중", checklist: "체크리스트",
        verifying: "검증 중", paused: "일시 정지", done: "완료",
    };
    const PHASE_STYLE: Record<Phase, string> = {
        idle: "border-slate-700 text-slate-500",
        analyzing: "border-blue-500/30 bg-blue-500/10 text-blue-400",
        checklist: "border-purple-500/30 bg-purple-500/10 text-purple-400",
        verifying: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
        paused: "border-slate-600 bg-slate-800/50 text-slate-400",
        done: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    };

    const progressPct = analysisProgress && analysisProgress.total > 0
        ? Math.round((analysisProgress.current / analysisProgress.total) * 100)
        : 0;

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">

            {/* ── Header ── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl shrink-0">
                <div className="flex items-center gap-3">
                    <div className="size-9 rounded-xl bg-red-600/20 flex items-center justify-center">
                        <ShieldCheck className="size-5 text-red-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-white">Security Audit</h1>
                        <p className="text-xs text-slate-500">청크 단위 분석 · SSH 기반 실시간 검증</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {(phase === "done" || inVerifyPhase) && confirmed + cleared + needsReview > 0 && (
                        <button
                            onClick={handleExport}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium transition-colors"
                        >
                            <Download className="size-3.5" />
                            보고서 내보내기
                        </button>
                    )}
                    <div className={cn("px-3 py-1.5 rounded-lg text-xs font-bold border", PHASE_STYLE[phase])}>
                        {PHASE_LABEL[phase]}
                    </div>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="flex flex-1 overflow-hidden divide-x divide-slate-800/50">

                {/* ── Left panel ── */}
                <div className="w-[300px] shrink-0 flex flex-col overflow-hidden">

                    {/* Asset selector */}
                    <div className="p-4 border-b border-slate-800/50">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">대상 자산</p>
                        {inVerifyPhase && (
                            <div className="flex items-center gap-1 mb-3">
                                <div className="w-px h-3 bg-slate-700" />
                                {phase === "verifying" ? (
                                    <button onClick={handlePause} className="p-1 hover:bg-slate-800 rounded-md transition-colors" title="Pause">
                                        <Pause className="size-3.5 text-slate-400" />
                                    </button>
                                ) : (
                                    <button onClick={handleResume} className="p-1 hover:bg-slate-800 rounded-md transition-colors" title="Resume">
                                        <Play className="size-3.5 text-emerald-400" />
                                    </button>
                                )}
                                <button onClick={handleStop} className="p-1 hover:bg-slate-800 rounded-md transition-colors" title="Stop Audit">
                                    <X className="size-3.5 text-red-500" />
                                </button>
                            </div>
                        )}
                        <div className="space-y-1">
                            {assets.length === 0 ? (
                                <p className="text-xs text-slate-600 py-2">자산 없음 — Settings에서 추가</p>
                            ) : assets.map(asset => (
                                <button
                                    key={asset.ip}
                                    onClick={() => !inVerifyPhase && setSelectedAsset(asset)}
                                    disabled={inVerifyPhase}
                                    className={cn(
                                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition-all border",
                                        selectedAsset?.ip === asset.ip
                                            ? "border-red-500/40 bg-red-500/10 text-white"
                                            : "border-transparent hover:border-slate-700 text-slate-400 hover:bg-slate-800/50",
                                        inVerifyPhase && "opacity-60 cursor-default"
                                    )}
                                >
                                    <div className={cn("size-2 rounded-full shrink-0",
                                        selectedAsset?.ip === asset.ip ? "bg-red-400" : "bg-slate-600"
                                    )} />
                                    <div>
                                        <p className="font-semibold">{asset.name}</p>
                                        <p className="text-[10px] text-slate-500 font-mono">{asset.ip}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* File input section (hidden during verify) */}
                    {!inVerifyPhase && (
                        <div className="p-4 border-b border-slate-800/50">
                            {/* Mode toggle */}
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">스캔 파일</p>
                                <div className="flex bg-slate-800/60 rounded-md p-0.5">
                                    <button
                                        onClick={() => setInputMode("upload")}
                                        className={cn(
                                            "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                                            inputMode === "upload" ? "bg-slate-600 text-white" : "text-slate-500 hover:text-slate-400"
                                        )}
                                    >
                                        <Upload className="size-2.5" />업로드
                                    </button>
                                    <button
                                        onClick={() => setInputMode("path")}
                                        className={cn(
                                            "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                                            inputMode === "path" ? "bg-slate-600 text-white" : "text-slate-500 hover:text-slate-400"
                                        )}
                                    >
                                        <Server className="size-2.5" />서버 경로
                                    </button>
                                </div>
                            </div>

                            {inputMode === "upload" ? (
                                <>
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        onDragOver={e => e.preventDefault()}
                                        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
                                        className={cn(
                                            "border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all",
                                            scanFile
                                                ? "border-emerald-500/40 bg-emerald-500/5"
                                                : "border-slate-700 hover:border-slate-600 hover:bg-slate-800/20"
                                        )}
                                    >
                                        {scanFile ? (
                                            <div className="flex items-center gap-2 justify-center text-emerald-400">
                                                <FileText className="size-4 shrink-0" />
                                                <span className="text-xs font-medium truncate">{scanFile.name}</span>
                                            </div>
                                        ) : (
                                            <div className="text-slate-600">
                                                <Upload className="size-5 mx-auto mb-1" />
                                                <p className="text-xs">클릭 또는 파일 드롭</p>
                                                <p className="text-[10px] mt-0.5 text-slate-700">Thor, LinPEAS, Lynis 출력 파일</p>
                                            </div>
                                        )}
                                    </div>
                                    {/* Size hint */}
                                    {scanFile && (
                                        <p className="text-[10px] text-slate-600 mt-1.5 text-center">
                                            {(scanFile.text.length / 1000).toFixed(0)}KB
                                            {" · "}예상 청크 {chunkText(scanFile.text).length}개
                                        </p>
                                    )}
                                    <input
                                        ref={fileInputRef} type="file" accept=".txt,.log,.out" className="hidden"
                                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ""; }}
                                    />
                                </>
                            ) : (
                                <div>
                                    <input
                                        type="text"
                                        placeholder="/var/log/auth.log"
                                        value={serverFilePath}
                                        onChange={e => setServerFilePath(e.target.value)}
                                        onKeyDown={e => e.key === "Enter" && handleAnalyze()}
                                        className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 font-mono focus:outline-none focus:border-red-500/40"
                                    />
                                    <p className="text-[10px] text-slate-600 mt-1">
                                        SSH로 서버 파일을 청크 단위로 읽어 분석합니다
                                    </p>
                                </div>
                            )}

                            <button
                                onClick={handleAnalyze}
                                disabled={
                                    !selectedAsset ||
                                    (inputMode === "upload" ? !scanFile : !serverFilePath.trim()) ||
                                    phase === "analyzing"
                                }
                                className={cn(
                                    "mt-3 w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
                                    selectedAsset && (inputMode === "upload" ? !!scanFile : !!serverFilePath.trim()) && phase !== "analyzing"
                                        ? "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/30"
                                        : "bg-slate-800 text-slate-600 cursor-not-allowed"
                                )}
                            >
                                {phase === "analyzing"
                                    ? <><Loader2 className="size-4 animate-spin" />분석 중...</>
                                    : inputMode === "path"
                                        ? <><Server className="size-4" />서버 파일 분석</>
                                        : <><ShieldCheck className="size-4" />파일 분석</>
                                }
                            </button>
                        </div>
                    )}

                    {/* Analysis summary */}
                    {checkItems.length > 0 && (
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">분석 결과</p>
                                <p className="text-sm font-bold text-white">{checkItems.length}개 항목 발견</p>
                                <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                                    {analysisStats?.source ?? (inputMode === "path" ? serverFilePath : scanFile?.name)}
                                </p>
                            </div>
                            {analysisStats && (
                                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-1.5">
                                    <div className="flex justify-between text-[11px]">
                                        <span className="text-slate-500">청크 처리</span>
                                        <span className="text-slate-300">{analysisStats.chunksProcessed}개</span>
                                    </div>
                                    <div className="flex justify-between text-[11px]">
                                        <span className="text-slate-500">원시 발견</span>
                                        <span className="text-slate-300">{analysisStats.rawFound}개</span>
                                    </div>
                                    {analysisStats.duplicatesRemoved > 0 && (
                                        <div className="flex justify-between text-[11px]">
                                            <span className="text-slate-500">중복 제거</span>
                                            <span className="text-amber-400">{analysisStats.duplicatesRemoved}개</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                {(["critical", "high", "medium", "low"] as Severity[]).map(sev => {
                                    const count = checkItems.filter(i => i.severity === sev).length;
                                    return (
                                        <div key={sev} className="bg-slate-900 rounded-xl p-3 border border-slate-800 text-center">
                                            <p className="text-xl font-bold text-white">{count}</p>
                                            <SeverityBadge sev={sev} />
                                        </div>
                                    );
                                })}
                            </div>
                            {checkItems.some(i => i.severity === "critical") && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                                    <AlertTriangle className="size-3.5 text-red-400 shrink-0" />
                                    <p className="text-xs text-red-400">Critical 항목 포함</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Middle panel: Checklist & Results ── */}
                {checkItems.length > 0 && (
                    <div className="w-[340px] shrink-0 flex flex-col overflow-hidden bg-slate-900/20">
                        {/* Tab Switcher */}
                        <div className="flex border-b border-slate-800/50 shrink-0">
                            <button
                                onClick={() => setActiveTab("checklist")}
                                className={cn(
                                    "flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all relative overflow-hidden",
                                    activeTab === "checklist" ? "text-white bg-white/5" : "text-slate-500 hover:text-slate-300"
                                )}
                            >
                                Checklist
                                {activeTab === "checklist" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
                            </button>
                            <button
                                onClick={() => setActiveTab("results")}
                                disabled={!inVerifyPhase}
                                className={cn(
                                    "flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all relative overflow-hidden",
                                    activeTab === "results" ? "text-white bg-white/5" : "text-slate-500 hover:text-slate-300",
                                    !inVerifyPhase && "opacity-0 invisible"
                                )}
                            >
                                Results
                                {activeTab === "results" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
                            </button>
                        </div>

                        {activeTab === "checklist" ? (
                            <div className="flex flex-col flex-1 overflow-hidden">
                                <div className="px-4 py-2.5 border-b border-slate-800/50 flex items-center justify-between shrink-0 bg-slate-900/40">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        항목 선정 ({checkedCount}/{checkItems.length})
                                    </p>
                                    {phase !== "verifying" && checkedCount > 0 && (
                                        <button
                                            onClick={() => setCheckItems(prev => prev.map(ci => ({ ...ci, checked: false })))}
                                            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors px-1.5 py-0.5 rounded hover:bg-slate-800"
                                        >
                                            전체 해제
                                        </button>
                                    )}
                                </div>
                                {phase !== "verifying" && checkItems.length > 0 && (() => {
                                    const sevConfig: { sev: Severity; label: string; color: string; dot: string }[] = [
                                        { sev: "critical", label: "Crit", color: "text-red-400", dot: "bg-red-500" },
                                        { sev: "high", label: "High", color: "text-orange-400", dot: "bg-orange-500" },
                                        { sev: "medium", label: "Med", color: "text-yellow-400", dot: "bg-yellow-500" },
                                        { sev: "low", label: "Low", color: "text-slate-400", dot: "bg-slate-500" },
                                    ];
                                    return (
                                        <div className="px-4 py-2.5 border-b border-slate-800/50 flex items-center gap-2 shrink-0 flex-wrap bg-slate-950/40">
                                            {sevConfig.map(({ sev, label, color, dot }) => {
                                                const total = checkItems.filter(i => i.severity === sev).length;
                                                if (total === 0) return null;
                                                const allChecked = checkItems.filter(i => i.severity === sev).every(i => i.checked);
                                                const someChecked = checkItems.filter(i => i.severity === sev).some(i => i.checked);
                                                return (
                                                    <label key={sev} className="flex items-center gap-1.5 cursor-pointer group select-none">
                                                        <input
                                                            type="checkbox"
                                                            checked={allChecked}
                                                            ref={el => { if (el) el.indeterminate = !allChecked && someChecked; }}
                                                            onChange={() => setCheckItems(prev => prev.map(ci =>
                                                                ci.severity === sev ? { ...ci, checked: !allChecked } : ci
                                                            ))}
                                                            className="w-3 h-3 accent-slate-400 cursor-pointer"
                                                        />
                                                        <span className={`flex items-center gap-1 text-[10px] font-semibold ${color} group-hover:brightness-125 transition-all`}>
                                                            {label}
                                                            <span className="text-slate-600 font-normal">({total})</span>
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
                                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                    {checkItems.map(item => {
                                        const isAnalyzed = item.status !== "pending" && item.status !== "verifying";
                                        return (
                                            <div key={item.id} className="group">
                                                <div
                                                    className={cn(
                                                        "flex items-start gap-2 px-2.5 py-2.5 rounded-xl cursor-pointer transition-all border",
                                                        item.checked ? "bg-slate-800/60 border-slate-700/50 shadow-lg ring-1 ring-white/5" :
                                                            isAnalyzed ? "bg-[#0a0c12]/40 border-slate-800/80 opacity-80" : "bg-transparent border-transparent opacity-50 grayscale-[0.5]",
                                                        item.status === "verifying" ? "border-blue-500/40 bg-blue-500/10" :
                                                            item.status === "confirmed" ? "border-red-500/20 bg-red-500/5" :
                                                                item.status === "clear" ? "border-emerald-500/20 bg-emerald-500/5" : "",
                                                        "hover:border-slate-700/50 hover:bg-slate-800/60"
                                                    )}
                                                    onClick={() => setExpandedItems(prev => {
                                                        const n = new Set(prev);
                                                        n.has(item.id) ? n.delete(item.id) : n.add(item.id);
                                                        return n;
                                                    })}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={item.checked}
                                                        disabled={phase === "verifying"}
                                                        onChange={e => {
                                                            e.stopPropagation();
                                                            if (phase !== "verifying")
                                                                setCheckItems(prev => prev.map(ci =>
                                                                    ci.id === item.id ? { ...ci, checked: e.target.checked } : ci
                                                                ));
                                                        }}
                                                        onClick={e => e.stopPropagation()}
                                                        className="mt-0.5 accent-red-500 shrink-0 scale-90"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-1.5 overflow-hidden">
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <StatusIcon status={item.status} />
                                                                <span className={cn(
                                                                    "text-[12px] font-medium truncate transition-colors",
                                                                    item.checked ? "text-slate-100" : isAnalyzed ? "text-slate-400" : "text-slate-500"
                                                                )}>
                                                                    {item.title}
                                                                </span>
                                                            </div>
                                                            {isAnalyzed && (
                                                                <span className="text-[8px] font-black px-1 py-0.5 rounded bg-slate-800/80 text-slate-500 border border-white/5 uppercase tracking-tighter shrink-0">
                                                                    Analyzed
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <SeverityBadge sev={item.severity} />
                                                            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter truncate">{item.category}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                {expandedItems.has(item.id) && (
                                                    <div className="ml-6 mr-1 mb-1 px-3 py-2.5 text-[11px] text-slate-400 bg-black/20 rounded-xl border border-white/5 mt-1 animate-in fade-in slide-in-from-top-1">
                                                        <p className="mb-2 leading-relaxed italic border-l-2 border-slate-700 pl-2">{item.analysis}</p>
                                                        <p className="mb-2 leading-relaxed opacity-80">{item.description}</p>
                                                        {item.evidence && (
                                                            <div className="bg-black/40 p-2 rounded-lg border border-white/5 font-mono text-[10px] break-all leading-relaxed max-h-32 overflow-y-auto custom-scrollbar">
                                                                <span className="text-slate-600 block mb-1 font-bold uppercase tracking-widest text-[8px]">Evidence Data</span>
                                                                {item.evidence}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                {!inVerifyPhase && phase === "checklist" && (
                                    <div className="p-4 border-t border-slate-800/50 shrink-0 bg-slate-900/60 transition-all">
                                        <button
                                            onClick={handleStartAudit}
                                            disabled={checkedCount === 0 || !selectedAsset}
                                            className={cn(
                                                "w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-xl",
                                                checkedCount > 0 && selectedAsset
                                                    ? "bg-gradient-to-br from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-red-900/20"
                                                    : "bg-slate-800 text-slate-600 cursor-not-allowed"
                                            )}
                                        >
                                            <ShieldCheck className="size-4.5" />
                                            검증 시작 ({checkedCount}개 항목)
                                        </button>
                                    </div>
                                )}
                                {phase === "done" && (
                                    <div className="p-4 border-t border-slate-800/50 shrink-0 bg-slate-950 transition-all border-emerald-500/20">
                                        <button
                                            onClick={handleStartAudit}
                                            disabled={checkedCount === 0 || !selectedAsset}
                                            className={cn(
                                                "w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-xl",
                                                checkedCount > 0 && selectedAsset
                                                    ? "bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white shadow-emerald-900/20"
                                                    : "bg-slate-800 text-slate-600 cursor-not-allowed"
                                            )}
                                        >
                                            <ShieldCheck className="size-4.5" />
                                            추가 검증 시작 ({checkedCount}개 항목)
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Results Tab Content */
                            <div className="flex flex-1 flex-col overflow-hidden">
                                <div className="px-4 py-3 border-b border-slate-800/50 flex items-center justify-between shrink-0 bg-slate-900/40">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        검증 결과 요약
                                    </p>
                                    <div className="flex gap-2">
                                        <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-bold">{confirmed} Confirm</span>
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">{cleared} Clear</span>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                                    {checkItems.filter(i => i.status !== "pending" && i.status !== "verifying").length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center px-6">
                                            <Clock className="size-8 mb-2 opacity-20" />
                                            <p className="text-xs">아직 검증된 항목이 없습니다</p>
                                        </div>
                                    ) : (
                                        checkItems.filter(i => i.status === "confirmed" || i.status === "clear" || i.status === "needs_review").map(item => (
                                            <button
                                                key={item.id}
                                                onClick={() => scrollToMsg(item.id)}
                                                className={cn(
                                                    "w-full flex items-start gap-3 p-3 rounded-xl border transition-all text-left group",
                                                    item.status === "confirmed" ? "bg-red-500/5 border-red-500/20 hover:border-red-500/40" :
                                                        item.status === "clear" ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40" :
                                                            "bg-slate-800/40 border-slate-700/50 hover:border-slate-600"
                                                )}
                                            >
                                                <div className="mt-0.5"><StatusIcon status={item.status} /></div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[12px] font-bold text-slate-200 flex items-center justify-between">
                                                        <span className="truncate">{item.title}</span>
                                                        <ChevronRight className="size-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    </div>
                                                    <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Right panel ── */}
                <div className="flex-1 flex flex-col overflow-hidden">

                    {/* Idle */}
                    {phase === "idle" && (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center text-slate-600 space-y-3 max-w-sm">
                                <ShieldCheck className="size-14 mx-auto opacity-15" />
                                <p className="text-sm font-medium text-slate-500">보안 감사 시작</p>
                                <p className="text-xs leading-relaxed">
                                    좌측에서 자산을 선택하고 Thor, LinPEAS, Lynis 등의
                                    스캔 출력 파일을 업로드하거나, 서버 내 파일 경로를 지정하세요.
                                </p>
                                <div className="flex items-center justify-center gap-4 text-[10px] text-slate-700 pt-1">
                                    <span>대용량 파일 지원</span>
                                    <span>·</span>
                                    <span>청크 단위 분석</span>
                                    <span>·</span>
                                    <span>중복 자동 제거</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Analyzing phase: progress + side-by-side log & stream */}
                    {phase === "analyzing" && (
                        <div className="flex-1 flex flex-col bg-[#080a0f] relative overflow-hidden">
                            {/* Scanning Background Animation Layer */}
                            <div className="absolute inset-0 opacity-10 pointer-events-none">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#ef4444_0%,transparent_70%)] animate-pulse" />
                            </div>

                            {/* Header Area: Progress */}
                            <div className="p-6 border-b border-slate-800/50 bg-slate-900/40 relative z-10 shrink-0">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-4">
                                        <div className="size-10 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                                            <Loader2 className="size-5 text-red-500 animate-spin" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-white uppercase tracking-tight italic">Analyzing System State</h3>
                                            <p className="text-[10px] text-slate-500 font-mono mt-0.5">{analysisProgress?.status || "Initializing process..."}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleCancelAnalysis}
                                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-red-900/20 text-slate-400 hover:text-red-400 text-[10px] font-bold transition-all border border-slate-700/50 uppercase tracking-widest shadow-lg"
                                    >
                                        Cancel Scan
                                    </button>
                                </div>

                                {/* Progress Bar */}
                                {analysisProgress && analysisProgress.total > 0 && (
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-[10px] font-mono mb-1">
                                            <span className="text-slate-500 font-bold uppercase tracking-widest">Scanning Efficiency</span>
                                            <span className="text-white font-black">{Math.round((analysisProgress.current / analysisProgress.total) * 100)}%</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden shadow-inner ring-1 ring-white/5">
                                            <div
                                                className="h-full bg-gradient-to-r from-red-600 to-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)] transition-all duration-1000 relative"
                                                style={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }}
                                            >
                                                <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.4)_50%,transparent_100%)] animate-[shimmer_2s_infinite] w-20" />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 flex overflow-hidden">
                                {/* Activity Log (Left) */}
                                <div className="w-[40%] border-r border-slate-800/30 flex flex-col bg-[#0a0c10]/80 backdrop-blur-sm">
                                    <div className="px-4 py-3 border-b border-slate-800/50 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Activity Ticker</span>
                                        </div>
                                        <ScanningAnimation /> {/* Optional small one? No, let's just keep the big one in background or just the ticker */}
                                    </div>
                                    <div ref={logRef} className="flex-1 overflow-y-auto p-4 space-y-3 font-mono">
                                        {activityLog.map(log => (
                                            <div key={log.id} className="flex gap-2.5 text-[10px] leading-relaxed group animate-in fade-in slide-in-from-left-2 duration-300">
                                                <span className="text-slate-600 shrink-0 select-none font-bold">[{log.time}]</span>
                                                <span className={cn(
                                                    "break-all",
                                                    log.type === "success" ? "text-emerald-400 font-bold" :
                                                        log.type === "error" ? "text-red-400 font-bold" :
                                                            log.type === "warning" ? "text-amber-400 font-bold" : "text-slate-400"
                                                )}>
                                                    {log.msg}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Main Scan View (Right) */}
                                <div className="flex-1 flex flex-col bg-black/40 relative">
                                    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 pointer-events-none">
                                        <ScanningAnimation />
                                        <div className="text-center mt-2">
                                            <h4 className="text-[10px] font-black text-red-500 uppercase tracking-[0.3em] mb-4 animate-pulse">Live Forensic Analysis</h4>
                                        </div>
                                    </div>

                                    <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between z-10 bg-black/20">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Raw Stream Buffer</span>
                                        {streamBuf && <div className="size-1.5 rounded-full bg-red-500 animate-ping" />}
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-6 z-10 relative">
                                        <pre className="text-[11px] text-slate-400 font-mono whitespace-pre-wrap leading-relaxed opacity-40 select-none">
                                            {streamBuf || "Awaiting incoming telemetry data..."}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Checklist ready: summary */}
                    {phase === "checklist" && (
                        <div className="flex-1 flex items-center justify-center bg-slate-900/20">
                            <div className="space-y-5 max-w-sm w-full px-8">
                                <div className="text-center">
                                    <div className="size-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                                        <ShieldCheck className="size-6 text-emerald-500" />
                                    </div>
                                    <p className="text-lg font-bold text-white tracking-tight">{checkItems.length}개 항목 분석 완료</p>
                                    <p className="text-xs text-slate-500 mt-1 font-mono truncate">
                                        {analysisStats?.source ?? (inputMode === "path" ? serverFilePath : scanFile?.name)}
                                    </p>
                                </div>

                                {/* Chunk stats */}
                                {analysisStats && (
                                    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                                        <div className="flex items-center justify-center gap-3 text-[11px] text-slate-500">
                                            <span>{analysisStats.chunksProcessed}개 청크 처리</span>
                                            <span className="text-slate-700">·</span>
                                            <span>{analysisStats.rawFound}개 원시 발견</span>
                                            {analysisStats.duplicatesRemoved > 0 && (
                                                <>
                                                    <span className="text-slate-700">·</span>
                                                    <span className="text-amber-500/70">중복 {analysisStats.duplicatesRemoved}개 제거</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Severity grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    {(["critical", "high", "medium", "low"] as Severity[]).map(sev => {
                                        const count = checkItems.filter(i => i.severity === sev).length;
                                        return (
                                            <div key={sev} className="bg-slate-900/40 rounded-xl p-4 border border-slate-800/50 text-center">
                                                <p className="text-2xl font-black text-white">{count}</p>
                                                <SeverityBadge sev={sev} />
                                            </div>
                                        );
                                    })}
                                </div>

                                {checkItems.some(i => i.severity === "critical") && (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                                        <AlertTriangle className="size-3.5 text-red-500 shrink-0" />
                                        <p className="text-[10px] text-red-400 font-bold">Critical 항목이 포함되어 있습니다. 즉각적인 조치가 필요합니다.</p>
                                    </div>
                                )}

                                <div className="pt-2">
                                    <p className="text-[10px] text-slate-500 text-center leading-relaxed">
                                        좌측 체크리스트에서 정밀 검증할 항목을 선택한 후<br />
                                        하단의 <span className="text-emerald-400 font-bold tracking-widest uppercase">검증 시작</span> 버튼을 클릭하세요.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Verification chat */}
                    {inVerifyPhase && (
                        <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0c12]">
                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                                {chatMsgs.map((msg, i) => (
                                    <MsgBubble
                                        key={i}
                                        msg={msg}
                                        streaming={i === chatMsgs.length - 1 && loading}
                                        onRef={(el) => { if (msg.itemId && msg.role === "user") msgRefs.current[msg.itemId] = el; }}
                                    />
                                ))}
                                {streamBuf && (
                                    <MsgBubble msg={{ role: "assistant", content: streamBuf }} streaming />
                                )}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Done summary bar */}
                            {phase === "done" && (
                                <div className="px-5 py-3 border-t border-slate-800/50 bg-slate-900/60 flex items-center justify-between shrink-0 animate-in slide-in-from-bottom-2">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-1.5">
                                            <div className="size-2 rounded-full bg-red-500" />
                                            <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">{confirmed} CONFIRMED</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className="size-2 rounded-full bg-emerald-500" />
                                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">{cleared} CLEARED</span>
                                        </div>
                                        {needsReview > 0 && (
                                            <div className="flex items-center gap-1.5">
                                                <div className="size-2 rounded-full bg-amber-500" />
                                                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">{needsReview} REVIEW</span>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setPhase("checklist")}
                                        className="text-[10px] font-bold text-slate-400 hover:text-white uppercase tracking-widest transition-colors"
                                    >
                                        돌아가기
                                    </button>
                                </div>
                            )}

                            {/* Input bar */}
                            <div className="border-t border-slate-800/50 px-4 py-3 shrink-0 bg-slate-900/40">
                                <div className="flex items-center gap-2">
                                    {phase !== "done" && (
                                        phase === "verifying" ? (
                                            <button
                                                onClick={handlePause}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-xs font-medium transition-colors shrink-0"
                                            >
                                                <Pause className="size-3.5" />일시 정지
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleResume}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium transition-colors shrink-0"
                                            >
                                                <Play className="size-3.5" />재개
                                            </button>
                                        )
                                    )}
                                    <input
                                        type="text"
                                        placeholder={
                                            phase === "verifying" ? "검증 중 추가 지시 (다음 항목 처리 시 반영)..." :
                                                phase === "paused" ? "추가 지시 또는 질문 입력..." :
                                                    "결과에 대해 추가 질문..."
                                        }
                                        value={userInput}
                                        onChange={e => setUserInput(e.target.value)}
                                        onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleUserSend()}
                                        className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-red-500/40"
                                    />
                                    <button
                                        onClick={handleUserSend}
                                        disabled={!userInput.trim()}
                                        className="p-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg disabled:opacity-30 transition-colors"
                                    >
                                        <Send className="size-4" />
                                    </button>
                                </div>
                                {phase === "paused" && (
                                    <p className="text-[11px] text-slate-600 text-center mt-1.5">
                                        일시 정지됨 — 메시지를 입력하거나 재개 버튼을 눌러주세요
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <style>{`
                @keyframes scanLine {
                    0% { transform: translateY(-100%); opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { transform: translateY(1000%); opacity: 0; }
                }
                .animate-scanLine {
                    animation: scanLine 4s linear infinite;
                }
            `}</style>
        </div >
    );
}
