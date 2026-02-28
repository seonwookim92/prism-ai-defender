"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
    Upload, Terminal, Trash2, Plus, Rocket, Loader2, CheckCircle2, XCircle,
    SkipForward, Clock, ChevronDown, ChevronRight, Sparkles, FolderOpen,
    ArrowUp, ArrowDown, Save, BookOpen, Download, FolderInput, X, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Asset { name: string; ip: string; port: number; user: string; }

interface UploadBlock { type: "upload"; id: string; filename: string; contentB64: string; }
interface CommandBlock { type: "command"; id: string; command: string; }
type Block = UploadBlock | CommandBlock;

type BlockStatus = "pending" | "running" | "success" | "error" | "skipped";
interface BlockResult { status: BlockStatus; stdout?: string; stderr?: string; error?: string; path?: string; }
type ExecutionState = Record<string, BlockResult[]>;

interface PlaybookSummary { id: number; name: string; block_count: number; updated_at: string; }

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatusIcon({ status }: { status: BlockStatus }) {
    switch (status) {
        case "running":  return <Loader2 className="size-4 text-blue-400 animate-spin" />;
        case "success":  return <CheckCircle2 className="size-4 text-emerald-400" />;
        case "error":    return <XCircle className="size-4 text-red-400" />;
        case "skipped":  return <SkipForward className="size-4 text-slate-500" />;
        default:         return <Clock className="size-4 text-slate-600" />;
    }
}

function TypeBadge({ type }: { type: "upload" | "command" }) {
    return (
        <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0",
            type === "upload" ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400"
        )}>
            {type === "upload" ? "upload" : "cmd"}
        </span>
    );
}

function BlockItem({ block, index, total, onDelete, onMoveUp, onMoveDown, directory }: {
    block: Block; index: number; total: number;
    onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void; directory: string;
}) {
    return (
        <div className={cn(
            "group flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm",
            block.type === "upload" ? "border-emerald-500/30 bg-emerald-500/5" : "border-blue-500/30 bg-blue-500/5"
        )}>
            <TypeBadge type={block.type} />
            <span className="flex-1 truncate font-mono text-xs text-slate-300">
                {block.type === "upload"
                    ? `${directory || "~"}/${(block as UploadBlock).filename}`
                    : (block as CommandBlock).command}
            </span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={onMoveUp} disabled={index === 0}
                    className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
                    <ArrowUp className="size-3" />
                </button>
                <button onClick={onMoveDown} disabled={index === total - 1}
                    className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
                    <ArrowDown className="size-3" />
                </button>
                <button onClick={onDelete}
                    className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400">
                    <Trash2 className="size-3" />
                </button>
            </div>
        </div>
    );
}

function AssetResult({ ip, asset, blocks, results }: {
    ip: string; asset: Asset | undefined; blocks: Block[]; results: BlockResult[];
}) {
    const [open, setOpen] = useState(true);
    const allDone = results.every(r => r.status !== "pending" && r.status !== "running");
    const hasError = results.some(r => r.status === "error");

    return (
        <div className="border border-slate-800 rounded-xl overflow-hidden">
            <button onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/70 hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-2">
                    {open ? <ChevronDown className="size-4 text-slate-500" /> : <ChevronRight className="size-4 text-slate-500" />}
                    <span className="text-sm font-medium text-white">{asset?.name || ip}</span>
                    <span className="text-xs text-slate-500 font-mono">{ip}</span>
                </div>
                {allDone ? (
                    !hasError
                        ? <span className="text-xs font-bold text-emerald-400 flex items-center gap-1"><CheckCircle2 className="size-3.5" />전체 성공</span>
                        : <span className="text-xs font-bold text-red-400 flex items-center gap-1"><XCircle className="size-3.5" />오류 발생</span>
                ) : (
                    <span className="text-xs text-blue-400 flex items-center gap-1"><Loader2 className="size-3.5 animate-spin" />실행 중...</span>
                )}
            </button>
            {open && (
                <div className="divide-y divide-slate-800/50">
                    {blocks.map((block, idx) => {
                        const res = results[idx] || { status: "pending" as BlockStatus };
                        return (
                            <div key={block.id} className="px-4 py-2.5">
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 shrink-0"><StatusIcon status={res.status} /></div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <TypeBadge type={block.type} />
                                            <span className="text-xs font-mono text-slate-300 truncate">
                                                {block.type === "upload" ? (block as UploadBlock).filename : (block as CommandBlock).command}
                                            </span>
                                            {res.path && <span className="text-xs text-slate-500">→ {res.path}</span>}
                                        </div>
                                        {res.error && <p className="mt-1 text-xs text-red-400 font-mono">{res.error}</p>}
                                        {res.stderr && <p className="mt-1 text-xs text-red-300/70 font-mono whitespace-pre-wrap">{res.stderr}</p>}
                                        {res.stdout && <p className="mt-1 text-xs text-slate-400 font-mono whitespace-pre-wrap">{res.stdout}</p>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Modal components ───────────────────────────────────────────────────────────
function SaveModal({ currentName, onSave, onClose }: {
    currentName: string; onSave: (name: string) => void; onClose: () => void;
}) {
    const [name, setName] = useState(currentName);
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-80 shadow-2xl">
                <h2 className="text-sm font-bold text-white mb-4">플레이북 저장</h2>
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="플레이북 이름"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && name.trim()) onSave(name.trim()); if (e.key === "Escape") onClose(); }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50"
                />
                <div className="flex gap-2 mt-4">
                    <button onClick={onClose}
                        className="flex-1 py-2 rounded-lg border border-slate-700 text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                        취소
                    </button>
                    <button onClick={() => name.trim() && onSave(name.trim())} disabled={!name.trim()}
                        className="flex-1 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-semibold transition-colors">
                        저장
                    </button>
                </div>
            </div>
        </div>
    );
}

function LoadModal({ playbooks, onLoad, onDelete, onRefresh, onClose }: {
    playbooks: PlaybookSummary[]; loading?: boolean;
    onLoad: (id: number) => void; onDelete: (id: number) => void;
    onRefresh: () => void; onClose: () => void;
}) {
    const fmt = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    };
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-[480px] max-h-[70vh] flex flex-col shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                    <h2 className="text-sm font-bold text-white">저장된 플레이북</h2>
                    <div className="flex items-center gap-2">
                        <button onClick={onRefresh} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors">
                            <RefreshCw className="size-3.5" />
                        </button>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors">
                            <X className="size-3.5" />
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                    {playbooks.length === 0 ? (
                        <div className="text-center py-10 text-slate-600">
                            <BookOpen className="size-8 mx-auto mb-2 opacity-40" />
                            <p className="text-xs">저장된 플레이북이 없습니다</p>
                        </div>
                    ) : playbooks.map(p => (
                        <div key={p.id}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900/50 group">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{p.name}</p>
                                <p className="text-[10px] text-slate-500">
                                    {p.block_count}개 블럭 · {fmt(p.updated_at)}
                                </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <button onClick={() => onLoad(p.id)}
                                    className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 text-xs font-medium transition-colors">
                                    불러오기
                                </button>
                                <button onClick={() => onDelete(p.id)}
                                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all">
                                    <Trash2 className="size-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="px-5 py-3 border-t border-slate-800">
                    <button onClick={onClose}
                        className="w-full py-2 rounded-lg border border-slate-700 text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function NoAnsiblePage() {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
    const [directories, setDirectories] = useState<Record<string, string>>({});
    const [mirrorDir, setMirrorDir] = useState(true);
    const [blocks, setBlocks] = useState<Block[]>([]);
    const [addMode, setAddMode] = useState<"command" | "upload">("command");
    const [commandInput, setCommandInput] = useState("");
    const [aiInput, setAiInput] = useState("");
    const [aiLoading, setAiLoading] = useState(false);
    const [deploying, setDeploying] = useState(false);
    const [executionState, setExecutionState] = useState<ExecutionState | null>(null);

    // Playbook state
    const [currentPlaybookId, setCurrentPlaybookId] = useState<number | null>(null);
    const [currentPlaybookName, setCurrentPlaybookName] = useState("");
    const [savedPlaybooks, setSavedPlaybooks] = useState<PlaybookSummary[]>([]);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showLoadModal, setShowLoadModal] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const importRef = useRef<HTMLInputElement>(null);

    // ── Data loading ──────────────────────────────────────────────────────────
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

    const refreshPlaybooks = useCallback(() => {
        fetch("/api/playbooks")
            .then(r => r.json())
            .then(data => { if (Array.isArray(data)) setSavedPlaybooks(data); })
            .catch(console.error);
    }, []);

    useEffect(() => { refreshPlaybooks(); }, [refreshPlaybooks]);

    // ── Asset helpers ─────────────────────────────────────────────────────────
    const toggleAsset = (ip: string) =>
        setSelectedAssets(prev => prev.includes(ip) ? prev.filter(x => x !== ip) : [...prev, ip]);

    const toggleSelectAll = () =>
        setSelectedAssets(prev => prev.length === assets.length ? [] : assets.map(a => a.ip));

    const handleDirChange = (ip: string, value: string) => {
        if (mirrorDir) {
            const updated: Record<string, string> = {};
            assets.forEach(a => (updated[a.ip] = value));
            setDirectories(updated);
        } else {
            setDirectories(prev => ({ ...prev, [ip]: value }));
        }
    };

    // ── Block helpers ─────────────────────────────────────────────────────────
    const addCommandBlock = () => {
        if (!commandInput.trim()) return;
        setBlocks(prev => [...prev, { type: "command", id: crypto.randomUUID(), command: commandInput.trim() }]);
        setCommandInput("");
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const b64 = (reader.result as string).split(",")[1];
            setBlocks(prev => [...prev, { type: "upload", id: crypto.randomUUID(), filename: file.name, contentB64: b64 }]);
        };
        reader.readAsDataURL(file);
        e.target.value = "";
    };

    const deleteBlock = (id: string) => setBlocks(prev => prev.filter(b => b.id !== id));

    const moveBlock = (index: number, direction: "up" | "down") => {
        setBlocks(prev => {
            const next = [...prev];
            const target = direction === "up" ? index - 1 : index + 1;
            if (target < 0 || target >= next.length) return prev;
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const clearBlocks = () => {
        if (!confirm("블럭을 모두 삭제하시겠습니까?")) return;
        setBlocks([]);
        setCurrentPlaybookId(null);
        setCurrentPlaybookName("");
    };

    // ── AI command help ───────────────────────────────────────────────────────
    const handleAiHelp = async () => {
        if (!aiInput.trim()) return;
        setAiLoading(true);
        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [{ role: "user", content: `다음 작업을 수행하는 Linux shell 명령어 한 줄만 출력해줘. 설명이나 JSON 없이 명령어만: ${aiInput}` }],
                }),
            });
            const raw = await res.text();
            const assembled = raw
                .split("\n")
                .filter(line => line.startsWith("0:"))
                .map(line => { try { return JSON.parse(line.slice(2)); } catch { return ""; } })
                .join("")
                .replace(/\[THOUGHT\][\s\S]*?\[\/THOUGHT\]/gi, "")
                .trim();

            const codeMatch = assembled.match(/```(?:bash|sh|shell)?\n?([\s\S]+?)```/);
            if (codeMatch) { setCommandInput(codeMatch[1].trim()); setAiInput(""); return; }

            try {
                const jsonMatch = assembled.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    const cmd = parsed?.args?.command ?? parsed?.command ?? null;
                    if (cmd) { setCommandInput(cmd.trim()); setAiInput(""); return; }
                }
            } catch { /* not JSON */ }

            const firstLine = assembled.split("\n").map(l => l.trim()).find(l => l && !l.startsWith("{") && !l.startsWith("#"));
            if (firstLine) { setCommandInput(firstLine); setAiInput(""); }
        } catch (e) {
            console.error("AI help failed:", e);
        } finally {
            setAiLoading(false);
        }
    };

    // ── Deployment ────────────────────────────────────────────────────────────
    const updateBlock = (ip: string, idx: number, result: BlockResult, prev: ExecutionState): ExecutionState => {
        const next = { ...prev };
        next[ip] = [...(next[ip] || [])];
        next[ip][idx] = result;
        return next;
    };

    const handleDeploy = async () => {
        const init: ExecutionState = {};
        for (const ip of selectedAssets) init[ip] = blocks.map(() => ({ status: "pending" }));
        setExecutionState(init);
        setDeploying(true);

        await Promise.all(
            selectedAssets.map(async ip => {
                for (let i = 0; i < blocks.length; i++) {
                    setExecutionState(prev => updateBlock(ip, i, { status: "running" }, prev!));
                    try {
                        const block = blocks[i];
                        const dir = directories[ip] || "~";
                        let resData: Record<string, unknown>;

                        if (block.type === "command") {
                            const r = await fetch("/api/execute", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ toolName: "execute_host_command", toolArgs: { target: ip, command: `cd ${dir} && ${block.command}` } }),
                            });
                            resData = await r.json();
                            setExecutionState(prev => updateBlock(ip, i, {
                                status: resData.status === "success" ? "success" : "error",
                                stdout: resData.stdout as string,
                                stderr: resData.stderr as string,
                                error: resData.message as string,
                            }, prev!));
                        } else {
                            const r = await fetch("/api/execute", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ toolName: "upload_file_to_host", toolArgs: { target: ip, remote_path: `${dir}/${block.filename}`, content_b64: block.contentB64 } }),
                            });
                            resData = await r.json();
                            setExecutionState(prev => updateBlock(ip, i, {
                                status: resData.status === "success" ? "success" : "error",
                                path: resData.path as string,
                                error: resData.message as string,
                            }, prev!));
                        }

                        if (resData.status !== "success") {
                            setExecutionState(prev => {
                                let state = prev!;
                                for (let j = i + 1; j < blocks.length; j++)
                                    state = updateBlock(ip, j, { status: "skipped" }, state);
                                return state;
                            });
                            break;
                        }
                    } catch (e) {
                        setExecutionState(prev => {
                            let state = updateBlock(ip, i, { status: "error", error: String(e) }, prev!);
                            for (let j = i + 1; j < blocks.length; j++)
                                state = updateBlock(ip, j, { status: "skipped" }, state);
                            return state;
                        });
                        break;
                    }
                }
            })
        );
        setDeploying(false);
    };

    // ── Playbook operations ───────────────────────────────────────────────────
    const handleSave = async (name: string) => {
        const url = currentPlaybookId ? `/api/playbooks/${currentPlaybookId}` : "/api/playbooks";
        const method = currentPlaybookId ? "PATCH" : "POST";
        try {
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, blocks }),
            });
            const data = await res.json();
            if (data.id) {
                setCurrentPlaybookId(data.id);
                setCurrentPlaybookName(name);
                setShowSaveModal(false);
                refreshPlaybooks();
            }
        } catch (e) { console.error("Save failed:", e); }
    };

    const loadPlaybook = async (id: number) => {
        try {
            const res = await fetch(`/api/playbooks/${id}`);
            const data = await res.json();
            if (data.blocks) {
                setBlocks(data.blocks);
                setCurrentPlaybookId(id);
                setCurrentPlaybookName(data.name);
                setShowLoadModal(false);
                setExecutionState(null);
            }
        } catch (e) { console.error("Load failed:", e); }
    };

    const deletePlaybook = async (id: number) => {
        if (!confirm("플레이북을 삭제하시겠습니까?")) return;
        try {
            await fetch(`/api/playbooks/${id}`, { method: "DELETE" });
            setSavedPlaybooks(prev => prev.filter(p => p.id !== id));
            if (currentPlaybookId === id) { setCurrentPlaybookId(null); setCurrentPlaybookName(""); }
        } catch (e) { console.error("Delete failed:", e); }
    };

    const handleDownload = () => {
        const name = currentPlaybookName || "playbook";
        const payload = { name, version: 1, blocks };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${name.replace(/[^a-zA-Z0-9가-힣_-]/g, "_")}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result as string);
                if (Array.isArray(data.blocks)) {
                    setBlocks(data.blocks.map((b: Block) => ({ ...b, id: crypto.randomUUID() })));
                    setCurrentPlaybookId(null);
                    setCurrentPlaybookName(data.name || file.name.replace(/\.json$/, ""));
                    setExecutionState(null);
                }
            } catch { alert("올바른 플레이북 파일이 아닙니다."); }
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    // ── Derived ───────────────────────────────────────────────────────────────
    const canDeploy = selectedAssets.length > 0 && blocks.length > 0
        && selectedAssets.every(ip => !!directories[ip]?.trim()) && !deploying;
    const mirrorValue = mirrorDir ? directories[assets[0]?.ip] || "" : "";
    const allSelected = assets.length > 0 && selectedAssets.length === assets.length;

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl shrink-0 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="size-9 rounded-xl bg-purple-600/20 flex items-center justify-center shrink-0">
                        <Rocket className="size-5 text-purple-400" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-lg font-bold text-white leading-none">No-Ansible Deployment</h1>
                        {currentPlaybookName ? (
                            <p className="text-xs text-purple-400 mt-0.5 truncate font-medium">
                                📋 {currentPlaybookName}
                                {currentPlaybookId ? "" : " (미저장)"}
                            </p>
                        ) : (
                            <p className="text-xs text-slate-500 mt-0.5">SSH 기반 다중 자산 배포</p>
                        )}
                    </div>
                </div>

                {/* Playbook actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <button
                        onClick={() => setShowSaveModal(true)}
                        disabled={blocks.length === 0}
                        title="플레이북 저장"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <Save className="size-3.5" />
                        저장
                    </button>
                    <button
                        onClick={() => { refreshPlaybooks(); setShowLoadModal(true); }}
                        title="저장된 플레이북 불러오기"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        <BookOpen className="size-3.5" />
                        불러오기
                        {savedPlaybooks.length > 0 && (
                            <span className="bg-purple-600/40 text-purple-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                                {savedPlaybooks.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={handleDownload}
                        disabled={blocks.length === 0}
                        title="JSON으로 내보내기"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <Download className="size-3.5" />
                        내보내기
                    </button>
                    <button
                        onClick={() => importRef.current?.click()}
                        title="JSON 파일 가져오기"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        <FolderInput className="size-3.5" />
                        가져오기
                    </button>
                    <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
                </div>

                <button
                    onClick={handleDeploy}
                    disabled={!canDeploy}
                    className={cn(
                        "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0",
                        canDeploy
                            ? "bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30"
                            : "bg-slate-800 text-slate-500 cursor-not-allowed"
                    )}
                >
                    {deploying ? <><Loader2 className="size-4 animate-spin" />배포 중...</>
                        : <><Rocket className="size-4" />Deploy</>}
                </button>
            </div>

            {/* ── Body ── */}
            <div className="flex flex-1 overflow-hidden divide-x divide-slate-800/50">
                {/* Column 1: Asset Selection */}
                <div className="w-56 shrink-0 flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800/50 flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">자산 선택</p>
                        {assets.length > 1 && (
                            <button onClick={toggleSelectAll}
                                className="text-[10px] text-slate-500 hover:text-purple-400 transition-colors">
                                {allSelected ? "해제" : "전체"}
                            </button>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                        {assets.length === 0 ? (
                            <p className="text-xs text-slate-600 px-1 py-4 text-center">
                                자산이 없습니다.<br />Settings에서 추가하세요.
                            </p>
                        ) : assets.map(asset => {
                            const selected = selectedAssets.includes(asset.ip);
                            return (
                                <button key={asset.ip} onClick={() => toggleAsset(asset.ip)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all border",
                                        selected
                                            ? "border-purple-500/40 bg-purple-500/10 text-white"
                                            : "border-transparent hover:border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800/50"
                                    )}
                                >
                                    <div className={cn("size-3 rounded-full shrink-0 border-2 transition-all",
                                        selected ? "bg-purple-500 border-purple-400" : "border-slate-600"
                                    )} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold truncate">{asset.name}</p>
                                        <p className="text-[10px] text-slate-500 font-mono">{asset.ip}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Column 2: Deploy Directory */}
                <div className="w-56 shrink-0 flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800/50">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">배포 디렉토리</p>
                    </div>
                    <div className="px-4 py-3 border-b border-slate-800/30">
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
                            <input type="checkbox" checked={mirrorDir} onChange={e => setMirrorDir(e.target.checked)} className="accent-purple-500 size-3" />
                            전체 동일 경로 사용
                        </label>
                        {mirrorDir && (
                            <input
                                type="text"
                                placeholder="/opt/deploy"
                                value={mirrorValue}
                                onChange={e => handleDirChange(assets[0]?.ip || "", e.target.value)}
                                className="mt-2 w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
                            />
                        )}
                    </div>
                    {!mirrorDir && (
                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {selectedAssets.length === 0 ? (
                                <p className="text-xs text-slate-600 text-center py-4">먼저 자산을 선택하세요</p>
                            ) : selectedAssets.map(ip => {
                                const asset = assets.find(a => a.ip === ip);
                                return (
                                    <div key={ip}>
                                        <p className="text-[10px] text-slate-500 mb-1 font-mono truncate">{asset?.name || ip}</p>
                                        <input
                                            type="text"
                                            placeholder="/opt/deploy"
                                            value={directories[ip] || ""}
                                            onChange={e => handleDirChange(ip, e.target.value)}
                                            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Column 3: Blocks / Results */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {executionState ? (
                        <div className="flex flex-col h-full">
                            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/50">
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">배포 진행 현황</p>
                                {!deploying && (
                                    <button onClick={() => setExecutionState(null)}
                                        className="text-xs text-slate-500 hover:text-white px-3 py-1 rounded-lg hover:bg-slate-800 transition-colors">
                                        닫기
                                    </button>
                                )}
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {Object.entries(executionState).map(([ip, results]) => (
                                    <AssetResult key={ip} ip={ip} asset={assets.find(a => a.ip === ip)} blocks={blocks} results={results} />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full">
                            <div className="px-5 py-3 border-b border-slate-800/50 flex items-center justify-between">
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                    실행 블럭 {blocks.length > 0 && <span className="text-purple-400 ml-1">({blocks.length})</span>}
                                </p>
                                {blocks.length > 0 && (
                                    <button onClick={clearBlocks}
                                        className="text-[10px] text-slate-600 hover:text-red-400 transition-colors flex items-center gap-1">
                                        <Trash2 className="size-3" />전체 삭제
                                    </button>
                                )}
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                {blocks.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-40 text-center">
                                        <FolderOpen className="size-8 text-slate-700 mb-2" />
                                        <p className="text-sm text-slate-600">블럭을 추가하세요</p>
                                        <p className="text-xs text-slate-700 mt-1">파일 업로드 또는 명령어 실행</p>
                                    </div>
                                ) : blocks.map((block, idx) => (
                                    <BlockItem
                                        key={block.id}
                                        block={block}
                                        index={idx}
                                        total={blocks.length}
                                        onDelete={() => deleteBlock(block.id)}
                                        onMoveUp={() => moveBlock(idx, "up")}
                                        onMoveDown={() => moveBlock(idx, "down")}
                                        directory={mirrorDir ? directories[assets[0]?.ip] || "~" : directories[selectedAssets[0]] || "~"}
                                    />
                                ))}
                            </div>

                            {/* Block adder */}
                            <div className="border-t border-slate-800/50 p-4 space-y-3 shrink-0">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { setAddMode("upload"); fileInputRef.current?.click(); }}
                                        className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                                            addMode === "upload"
                                                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                                                : "border-slate-700 text-slate-500 hover:text-white hover:bg-slate-800"
                                        )}
                                    >
                                        <Upload className="size-3.5" />파일 업로드
                                    </button>
                                    <button
                                        onClick={() => setAddMode("command")}
                                        className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                                            addMode === "command"
                                                ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                                                : "border-slate-700 text-slate-500 hover:text-white hover:bg-slate-800"
                                        )}
                                    >
                                        <Terminal className="size-3.5" />명령어
                                    </button>
                                </div>

                                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />

                                {addMode === "command" && (
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="명령어 입력 (예: chmod +x deploy.sh)"
                                                value={commandInput}
                                                onChange={e => setCommandInput(e.target.value)}
                                                onKeyDown={e => e.key === "Enter" && addCommandBlock()}
                                                className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                                            />
                                            <button onClick={addCommandBlock} disabled={!commandInput.trim()}
                                                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-colors">
                                                <Plus className="size-4" />
                                            </button>
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="AI 도움: 자연어로 설명 (예: nginx 재시작)"
                                                value={aiInput}
                                                onChange={e => setAiInput(e.target.value)}
                                                onKeyDown={e => e.key === "Enter" && handleAiHelp()}
                                                className="flex-1 bg-slate-900/50 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-400 placeholder-slate-700 focus:outline-none focus:border-purple-500/30"
                                            />
                                            <button onClick={handleAiHelp} disabled={!aiInput.trim() || aiLoading}
                                                className="px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 disabled:opacity-40 text-purple-400 rounded-lg transition-colors flex items-center gap-1.5 text-xs">
                                                {aiLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                                                AI
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Modals ── */}
            {showSaveModal && (
                <SaveModal
                    currentName={currentPlaybookName}
                    onSave={handleSave}
                    onClose={() => setShowSaveModal(false)}
                />
            )}
            {showLoadModal && (
                <LoadModal
                    playbooks={savedPlaybooks}
                    onLoad={loadPlaybook}
                    onDelete={deletePlaybook}
                    onRefresh={refreshPlaybooks}
                    onClose={() => setShowLoadModal(false)}
                />
            )}
        </div>
    );
}
