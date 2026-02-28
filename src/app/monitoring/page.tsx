"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Activity,
    Trash2,
    Settings2,
    ChevronRight,
    ChevronDown,
    Clock,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    XCircle,
    User,
    Loader2,
    Edit,
    Save,
    X
} from "lucide-react";
import { clsx } from "clsx";

interface MonitoringTask {
    id: number;
    title: string;
    toolName: string;
    toolArgs: any;
    thresholdCondition: string | null;
    intervalMinutes: number;
    enabled: boolean;
    status: string;
    lastRun: string | null;
    targetAgents: string[];
    actionToolName?: string | null;
    actionToolArgs?: string | null;
}

const parseArgs = (args: any) => {
    if (typeof args === 'string') {
        try { return JSON.parse(args); } catch { return {}; }
    }
    return args || {};
};

const stringifyArgs = (args: any) => {
    if (typeof args === 'string') return args;
    try { return JSON.stringify(args, null, 2); } catch { return String(args); }
};

const highlightColors = (text: string) => {
    if (typeof text !== 'string') return text;
    const parts = text.split(/\b(red|green|amber)\b/i);
    return parts.map((p, i) => {
        const l = p.toLowerCase();
        if (l === 'red') return <span key={i} className="text-red-400 font-bold bg-red-500/20 px-1.5 py-0.5 rounded border border-red-500/30 uppercase tracking-widest">{p}</span>;
        if (l === 'green') return <span key={i} className="text-emerald-400 font-bold bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/30 uppercase tracking-widest">{p}</span>;
        if (l === 'amber') return <span key={i} className="text-amber-400 font-bold bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30 uppercase tracking-widest">{p}</span>;
        return p;
    });
};

interface MonitoringResult {
    id: number;
    status: string;
    resultData: any;
    timestamp: string;
}

export default function MonitoringPage() {
    const [tasks, setTasks] = useState<MonitoringTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
    const [results, setResults] = useState<MonitoringResult[]>([]);
    const [resultsLoading, setResultsLoading] = useState(false);
    const [userTimezone, setUserTimezone] = useState("Europe/Tallinn");
    const [availableAssets, setAvailableAssets] = useState<{ name: string; ip: string }[]>([]);
    const [editingTask, setEditingTask] = useState<MonitoringTask | null>(null);
    const [savingId, setSavingId] = useState<number | null>(null);

    // Format time in both user TZ and KST
    const formatDualTime = (isoStr: string) => {
        const d = new Date(isoStr);
        const opts: Intl.DateTimeFormatOptions = { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
        const userTime = d.toLocaleString('en-US', { ...opts, timeZone: userTimezone });
        const kstTime = d.toLocaleString('en-US', { ...opts, timeZone: 'Asia/Seoul' });
        const tzShort = userTimezone.split('/').pop()?.replace('_', ' ') || userTimezone;
        return { userTime, kstTime, tzShort };
    };

    const fetchTasks = async () => {
        try {
            const res = await fetch("/api/monitoring/tasks");
            const data = await res.json();
            setTasks(data);
        } catch (error) {
            console.error("Failed to fetch monitoring tasks", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchResults = async (taskId: number) => {
        setResultsLoading(true);
        try {
            const res = await fetch(`/api/monitoring/results/${taskId}`);
            const data = await res.json();
            setResults(data);
        } catch (error) {
            console.error("Failed to fetch results", error);
        } finally {
            setResultsLoading(false);
        }
    };

    const toggleExpand = (taskId: number) => {
        if (expandedTaskId === taskId) {
            setExpandedTaskId(null);
            setResults([]);
        } else {
            setExpandedTaskId(taskId);
            fetchResults(taskId);
        }
    };

    const fetchAssets = async () => {
        try {
            const res = await fetch("/api/onboarding/status");
            const data = await res.json();
            if (data.config?.assets) setAvailableAssets(data.config.assets);
        } catch (e) { console.error("Failed to fetch assets", e); }
    };

    const handleSaveTask = async () => {
        if (!editingTask) return;
        setSavingId(editingTask.id);
        try {
            // Helper to ensure toolArgs is an object
            const toolArgs = typeof editingTask.toolArgs === 'string'
                ? JSON.parse(editingTask.toolArgs)
                : editingTask.toolArgs;

            const res = await fetch(`/api/monitoring/tasks/${editingTask.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: editingTask.title,
                    intervalMinutes: editingTask.intervalMinutes,
                    targetAgents: editingTask.targetAgents,
                    toolArgs: toolArgs,
                    thresholdCondition: editingTask.thresholdCondition,
                    actionToolName: editingTask.actionToolName,
                    actionToolArgs: editingTask.actionToolArgs
                })
            });
            if (res.ok) {
                setTasks(tasks.map(t => t.id === editingTask.id ? editingTask : t));
                setEditingTask(null);
            } else {
                alert("Failed to save task. Check JSON formatting.");
            }
        } catch (e) {
            alert("Error saving task: " + e);
        } finally {
            setSavingId(null);
        }
    };

    const deleteTask = async (taskId: number) => {
        if (!confirm("Are you sure you want to delete this monitoring task?")) return;
        try {
            const res = await fetch(`/api/monitoring/tasks/${taskId}`, { method: "DELETE" });
            if (res.ok) {
                setTasks(tasks.filter(t => t.id !== taskId));
                if (expandedTaskId === taskId) setExpandedTaskId(null);
            }
        } catch (error) {
            console.error("Delete failed", error);
        }
    };

    useEffect(() => {
        fetchTasks();
        fetchAssets();
        const savedTz = localStorage.getItem('prism-timezone');
        if (savedTz) setUserTimezone(savedTz);
        const interval = setInterval(fetchTasks, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex flex-col h-screen w-full animate-in fade-in slide-in-from-bottom-4 duration-700 overflow-hidden">
            <header className="px-8 py-5 border-b border-slate-800/50 bg-slate-950/50 backdrop-blur-md flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <div className="size-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <Activity className="size-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-white">Monitoring</h2>
                        <p className="text-xs text-slate-500">Real-time status of your automated security tasks.</p>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={fetchTasks} className="bg-slate-900 border-slate-800">
                    <RefreshCw className={clsx("size-4 mr-2", loading && "animate-spin")} />
                    Refresh
                </Button>
            </header>

            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-2 custom-scrollbar">
                {tasks.length === 0 && !loading ? (
                    <Card className="py-20 flex flex-col items-center justify-center bg-slate-900/40 border-slate-800 border-dashed">
                        <Activity className="size-12 text-slate-700 mb-4 opacity-20" />
                        <p className="text-slate-400">No monitoring tasks registered yet.</p>
                        <p className="text-xs text-slate-600 mt-2 text-center max-w-xs">
                            Use the Builder Chat to design and deploy monitoring tasks.
                        </p>
                    </Card>
                ) : (
                    tasks.map((task) => (
                        <Card key={task.id} className={clsx(
                            "bg-slate-900/40 border-slate-800/50 backdrop-blur-sm overflow-hidden transition-all",
                            expandedTaskId === task.id ? "ring-1 ring-blue-500/30" : "hover:border-slate-700"
                        )}>
                            <div
                                className="px-4 py-2.5 flex items-center justify-between cursor-pointer group"
                                onClick={() => toggleExpand(task.id)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={clsx(
                                        "size-3 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]",
                                        (task as any).status === "green" && "bg-emerald-500 shadow-emerald-500/50",
                                        (task as any).status === "red" && "bg-red-500 shadow-red-500/50 animate-pulse",
                                        (task as any).status === "amber" && "bg-amber-500 shadow-amber-500/50",
                                        (task as any).status === "error" && "bg-red-400 shadow-red-400/50",
                                        (task as any).status === "unknown" && "bg-slate-500 shadow-slate-500/50",
                                    )} />
                                    <div>
                                        <h3 className="font-bold text-slate-100 group-hover:text-blue-400 transition-colors uppercase tracking-tight">{task.title}</h3>
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                            <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20 font-bold uppercase tracking-wider flex items-center gap-1">
                                                <Settings2 className="size-2.5" />
                                                {task.toolName}
                                            </span>
                                            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-bold uppercase tracking-wider flex items-center gap-1">
                                                <Clock className="size-2.5" />
                                                {task.intervalMinutes}M
                                            </span>
                                            <span className="text-[10px] bg-slate-800 text-emerald-400/80 px-2 py-0.5 rounded border border-slate-700 font-bold uppercase tracking-wider flex items-center gap-1">
                                                <User className="size-2.5" />
                                                {task.targetAgents?.length > 0
                                                    ? task.targetAgents.join(", ")
                                                    : "All"}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="text-right hidden sm:block">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase">Last Run</p>
                                        {task.lastRun ? (() => {
                                            const t = formatDualTime(task.lastRun);
                                            return (
                                                <div className="space-y-0">
                                                    <p className="text-[10px] text-blue-400 font-mono" title={userTimezone}>
                                                        {t.userTime} <span className="text-slate-600">{t.tzShort}</span>
                                                    </p>
                                                    <p className="text-[10px] text-emerald-400/70 font-mono">
                                                        {t.kstTime} <span className="text-slate-600">KST</span>
                                                    </p>
                                                </div>
                                            );
                                        })() : (
                                            <p className="text-xs text-slate-500 font-mono">Never</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-8 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingTask(task);
                                                if (expandedTaskId !== task.id) toggleExpand(task.id);
                                            }}
                                        >
                                            <Edit className="size-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-8 text-slate-500 hover:text-red-400 hover:bg-red-400/10"
                                            onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                        {expandedTaskId === task.id ? <ChevronDown className="size-5 text-slate-400" /> : <ChevronRight className="size-5 text-slate-400" />}
                                    </div>
                                </div>
                            </div>

                            {expandedTaskId === task.id && (
                                <div className="border-t border-slate-800/50 bg-slate-950/30 p-4 animate-in slide-in-from-top-2 duration-300">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Configuration</h4>
                                                {editingTask?.id === task.id && (
                                                    <div className="flex gap-2">
                                                        <Button
                                                            size="sm"
                                                            className="h-7 bg-blue-600 hover:bg-blue-500 text-xs text-white"
                                                            onClick={handleSaveTask}
                                                            disabled={savingId === task.id}
                                                        >
                                                            {savingId === task.id ? <Loader2 className="size-3 animate-spin mr-1" /> : <Save className="size-3 mr-1" />}
                                                            Save
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 border-slate-700 bg-slate-900 text-xs text-slate-400"
                                                            onClick={() => setEditingTask(null)}
                                                        >
                                                            <X className="size-3 mr-1" />
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="space-y-4 bg-slate-950 border border-slate-800 p-4 rounded-xl">
                                                {editingTask?.id === task.id ? (
                                                    // Editable Fields
                                                    <>
                                                        <div>
                                                            <label className="text-[10px] text-slate-600 font-bold uppercase mb-1 block">Title & Interval (min)</label>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white flex-1"
                                                                    value={editingTask.title}
                                                                    onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
                                                                />
                                                                <input
                                                                    type="number"
                                                                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white w-20"
                                                                    value={editingTask.intervalMinutes}
                                                                    onChange={e => setEditingTask({ ...editingTask, intervalMinutes: parseInt(e.target.value) })}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-slate-600 font-bold uppercase mb-1 block">Targets</label>
                                                            <div className="flex flex-wrap gap-2 mb-2 p-2 border border-slate-800 rounded-lg bg-slate-900/50">
                                                                {availableAssets.map(asset => {
                                                                    const isSelected = editingTask.targetAgents.includes(asset.ip);
                                                                    return (
                                                                        <button
                                                                            key={asset.ip}
                                                                            onClick={() => {
                                                                                const newTargets = isSelected
                                                                                    ? editingTask.targetAgents.filter(ip => ip !== asset.ip)
                                                                                    : [...editingTask.targetAgents, asset.ip];
                                                                                setEditingTask({ ...editingTask, targetAgents: newTargets });
                                                                            }}
                                                                            className={clsx(
                                                                                "text-[10px] px-2 py-0.5 rounded border transition-colors",
                                                                                isSelected ? "bg-blue-600/20 border-blue-500/50 text-blue-400" : "bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300"
                                                                            )}
                                                                        >
                                                                            {asset.name} ({asset.ip})
                                                                        </button>
                                                                    );
                                                                })}
                                                                {availableAssets.length === 0 && <span className="text-[10px] text-slate-600">No assets available</span>}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-slate-600 font-bold uppercase mb-1 block">Tool Name & Args (JSON)</label>
                                                            <input
                                                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-blue-400 font-mono mb-2"
                                                                value={editingTask.toolName}
                                                                onChange={e => setEditingTask({ ...editingTask, toolName: e.target.value })}
                                                            />
                                                            <textarea
                                                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-blue-300 font-mono h-32"
                                                                value={stringifyArgs(editingTask.toolArgs)}
                                                                onChange={e => {
                                                                    try {
                                                                        setEditingTask({ ...editingTask, toolArgs: JSON.parse(e.target.value) });
                                                                    } catch {
                                                                        setEditingTask({ ...editingTask, toolArgs: e.target.value });
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-slate-600 font-bold uppercase mb-1 block">Threshold Condition (JSON)</label>
                                                            <textarea
                                                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-amber-300 font-mono h-32"
                                                                value={editingTask.thresholdCondition || ""}
                                                                onChange={e => setEditingTask({ ...editingTask, thresholdCondition: e.target.value })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-slate-600 font-bold uppercase mb-1 block">Action Tool & Args</label>
                                                            <input
                                                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-purple-400 font-mono mb-2"
                                                                value={editingTask.actionToolName || ""}
                                                                placeholder="Action Tool (e.g. execute_host_command)"
                                                                onChange={e => setEditingTask({ ...editingTask, actionToolName: e.target.value })}
                                                            />
                                                            <textarea
                                                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-purple-300 font-mono h-24"
                                                                value={editingTask.actionToolArgs || ""}
                                                                placeholder="Action Args JSON"
                                                                onChange={e => setEditingTask({ ...editingTask, actionToolArgs: e.target.value })}
                                                            />
                                                        </div>
                                                    </>
                                                ) : (
                                                    // View Mode
                                                    <>
                                                        <div>
                                                            <p className="text-[10px] text-slate-600 font-bold uppercase mb-1">Targets</p>
                                                            {task.targetAgents?.length > 0 ? (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {task.targetAgents.map(t => (
                                                                        <span key={t} className="text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded">{t}</span>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <code className="text-xs font-mono text-slate-500">All</code>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] text-slate-600 font-bold uppercase mb-1">Arguments</p>
                                                            <pre className="text-xs font-mono text-blue-400 overflow-auto max-h-64">
                                                                {stringifyArgs(task.toolArgs)}
                                                            </pre>
                                                        </div>
                                                        {task.actionToolName && (
                                                            <div>
                                                                <p className="text-[10px] text-slate-600 font-bold uppercase mb-1">Auto Action (on Red)</p>
                                                                <code className="text-xs font-mono text-purple-400">{task.actionToolName}</code>
                                                                {task.actionToolArgs && (
                                                                    <pre className="text-[10px] font-mono text-purple-300/70 mt-1 overflow-auto max-h-40 whitespace-pre-wrap">{task.actionToolArgs}</pre>
                                                                )}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <p className="text-[10px] text-slate-600 font-bold uppercase mb-1">Threshold Condition</p>
                                                            {task.thresholdCondition ? (() => {
                                                                try {
                                                                    const parsed = JSON.parse(task.thresholdCondition);
                                                                    const mode = parsed.mode || "?";
                                                                    const summary = parsed.criteria || parsed.red || parsed.contains?.join(", ") || JSON.stringify(parsed, null, 2);
                                                                    return (
                                                                        <div className="space-y-1">
                                                                            <span className="text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">{mode}</span>
                                                                            <p className="text-xs font-mono text-amber-300/80 leading-snug whitespace-pre-wrap">{highlightColors(summary)}</p>
                                                                        </div>
                                                                    );
                                                                } catch {
                                                                    return <p className="text-xs font-mono text-amber-400 whitespace-pre-wrap">{highlightColors(task.thresholdCondition)}</p>;
                                                                }
                                                            })() : (
                                                                <code className="text-xs font-mono text-slate-500">None (Always Green)</code>
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Execution Logs</h4>
                                                <div className="flex items-center gap-2">
                                                    {resultsLoading && <Loader2 className="size-3 animate-spin text-slate-500" />}
                                                    <Button variant="ghost" size="sm" onClick={() => fetchResults(task.id)} className="text-[10px] text-slate-500 hover:text-slate-300 h-6 px-2">
                                                        <RefreshCw className="size-3 mr-1" /> Refresh
                                                    </Button>
                                                </div>
                                            </div>
                                            <ScrollArea className="h-[450px] rounded-xl border border-slate-800 bg-slate-950">
                                                <div className="p-3 space-y-3">
                                                    {results.length === 0 && !resultsLoading ? (
                                                        <p className="text-xs text-slate-600 text-center py-10 italic">No execution data yet. waiting for next scheduled run...</p>
                                                    ) : (
                                                        results.map((res) => {
                                                            const data = res.resultData || {};
                                                            const thresholdEval = data.threshold_eval || {};
                                                            const rawOutput = data.raw_output;
                                                            const toolArgsSent = data.tool_args_sent;
                                                            const errorMsg = data.error;
                                                            const tracebackMsg = data.traceback;

                                                            return (
                                                                <div key={res.id} className="rounded-xl bg-slate-900/70 border border-slate-800/60 overflow-hidden">
                                                                    {/* Header */}
                                                                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/40">
                                                                        <div className="flex items-center gap-2">
                                                                            {res.status === "green" && <CheckCircle2 className="size-3.5 text-emerald-500" />}
                                                                            {res.status === "amber" && <AlertCircle className="size-3.5 text-amber-500" />}
                                                                            {res.status === "red" && <XCircle className="size-3.5 text-red-500" />}
                                                                            {res.status === "error" && <XCircle className="size-3.5 text-red-400" />}
                                                                            <Badge variant="outline" className={clsx(
                                                                                "text-[9px] font-bold uppercase px-2 py-0",
                                                                                res.status === "green" && "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
                                                                                res.status === "amber" && "text-amber-400 border-amber-500/30 bg-amber-500/10",
                                                                                res.status === "red" && "text-red-400 border-red-500/30 bg-red-500/10",
                                                                                res.status === "error" && "text-red-300 border-red-500/30 bg-red-500/10",
                                                                            )}>
                                                                                {res.status === "green" ? "OK" : res.status === "red" ? "ALERT" : res.status.toUpperCase()}
                                                                            </Badge>
                                                                        </div>
                                                                        {(() => {
                                                                            const t = formatDualTime(res.timestamp);
                                                                            return (
                                                                                <div className="text-right space-y-0">
                                                                                    <p className="text-[10px] text-blue-400 font-mono">
                                                                                        {t.userTime} <span className="text-slate-600">{t.tzShort}</span>
                                                                                    </p>
                                                                                    <p className="text-[10px] text-emerald-400/60 font-mono">
                                                                                        {t.kstTime} <span className="text-slate-600">KST</span>
                                                                                    </p>
                                                                                </div>
                                                                            );
                                                                        })()}
                                                                    </div>

                                                                    <div className="p-4 space-y-3">
                                                                        {/* Threshold Evaluation */}
                                                                        {thresholdEval.condition !== undefined && (
                                                                            <div className="space-y-1">
                                                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Threshold Check</p>
                                                                                <div className={clsx(
                                                                                    "px-3 py-2 rounded-lg border text-xs font-mono",
                                                                                    thresholdEval.triggered ? "bg-red-500/5 border-red-500/20 text-red-400" :
                                                                                        thresholdEval.error ? "bg-amber-500/5 border-amber-500/20 text-amber-400" :
                                                                                            "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                                                                                )}>
                                                                                    <div className="flex items-center gap-2">
                                                                                        {thresholdEval.triggered ? (
                                                                                            <><XCircle className="size-3 shrink-0" /> <span>⚠ TRIGGERED: <code className="text-red-300">{thresholdEval.condition}</code> → true</span></>
                                                                                        ) : thresholdEval.error ? (
                                                                                            <><AlertCircle className="size-3 shrink-0" /> <span>Eval Error: {thresholdEval.error}</span></>
                                                                                        ) : thresholdEval.condition ? (
                                                                                            <><CheckCircle2 className="size-3 shrink-0" /> <span>✓ OK: <code className="text-emerald-300">{thresholdEval.condition}</code> → false</span></>
                                                                                        ) : (
                                                                                            <span className="text-slate-500">No threshold configured</span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* Error display */}
                                                                        {errorMsg && (
                                                                            <div className="space-y-1">
                                                                                <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Error</p>
                                                                                <pre className="text-[10px] font-mono text-red-300 bg-red-950/30 border border-red-500/20 rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap">
                                                                                    {errorMsg}
                                                                                    {tracebackMsg && `\n\n${tracebackMsg}`}
                                                                                </pre>
                                                                            </div>
                                                                        )}

                                                                        {/* Tool args sent */}
                                                                        {toolArgsSent && (
                                                                            <div className="space-y-1">
                                                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tool Call Args</p>
                                                                                <pre className="text-[10px] font-mono text-blue-400 bg-blue-950/20 border border-blue-500/10 rounded-lg p-3 overflow-auto max-h-24">
                                                                                    {JSON.stringify(toolArgsSent, null, 2)}
                                                                                </pre>
                                                                            </div>
                                                                        )}

                                                                        {/* Raw tool output */}
                                                                        {rawOutput !== undefined && (
                                                                            <div className="space-y-1">
                                                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Raw Tool Output</p>
                                                                                <pre className="text-[10px] font-mono text-slate-300 bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-auto max-h-96 whitespace-pre-wrap">
                                                                                    {typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput, null, 2)}
                                                                                </pre>
                                                                            </div>
                                                                        )}

                                                                        {/* Fallback for old format results */}
                                                                        {!rawOutput && !errorMsg && !thresholdEval.condition && (
                                                                            <div className="space-y-1">
                                                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Result Data</p>
                                                                                <pre className="text-[10px] font-mono text-slate-400 bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap">
                                                                                    {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
                                                                                </pre>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </ScrollArea>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}

