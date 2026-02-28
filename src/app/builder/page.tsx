"use client";

import React from "react";
import { useChat } from "ai/react";
import {
    Bot, ChevronDown, Square, Send, Play, Save, CheckCircle2,
    Loader2, RefreshCw, Clock, Server, AlertTriangle,
    Wrench, Brain, Search, Info, RotateCcw, ChevronRight,
    Database, Zap, Filter, Activity, Settings2, Plus,
    SlidersHorizontal, Shield, X, ArrowLeft, Layers
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkdownText } from "@/components/MarkdownText";

// ─── Types ───────────────────────────────────────────────────────────────────
interface BlueprintMonitor {
    tool_name: string;
    args: Record<string, unknown>;
}
interface BlueprintParser {
    [varName: string]: string;
}
interface BlueprintThreshold {
    mode: "structured" | "contains" | "ai" | "variable";
    [key: string]: unknown;
}
interface BlueprintAction {
    action_tool_name: string;
    action_tool_args: Record<string, unknown> | string;
}
interface Blueprint {
    monitor: BlueprintMonitor | null;
    parser: BlueprintParser | null;
    threshold: BlueprintThreshold | null;
    action: BlueprintAction | null;
}

// ─── MessageRenderer ─────────────────────────────────────────────────────────
const BLUEPRINT_BLOCK_TYPES: Record<string, { label: string; accent: string }> = {
    monitor: { label: "수집 설계 (Monitor)", accent: "text-blue-400" },
    parser: { label: "파싱 설계 (Parser)", accent: "text-cyan-400" },
    threshold: { label: "임계치 설정 (Threshold)", accent: "text-amber-400" },
    action: { label: "자동 조치 (Action)", accent: "text-purple-400" },
};

const MessageRenderer = ({ content, isLoading }: { content: string; isLoading?: boolean }) => {
    const renderContent = (text: string) => {
        const parts = text.split(/(```[\s\S]*?```)/g);
        return parts.map((part, index) => {
            if (!part.startsWith("```") || !part.endsWith("```")) {
                return <MarkdownText key={index} text={part} />;
            }
            const inner = part.slice(3, -3);
            const firstNewline = inner.indexOf('\n');
            const lang = (firstNewline === -1 ? inner : inner.slice(0, firstNewline)).trim();
            const code = firstNewline === -1 ? "" : inner.slice(firstNewline + 1).trim();
            const blueprintInfo = BLUEPRINT_BLOCK_TYPES[lang];

            return (
                <div key={index} className="my-3 bg-slate-950 border border-slate-700/50 rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-slate-800/80 px-4 py-2 border-b border-slate-700/50 flex items-center justify-between">
                        <span className={cn("text-[10px] uppercase tracking-widest font-bold", blueprintInfo?.accent || "text-slate-400")}>
                            {blueprintInfo?.label || (lang || "code")}
                        </span>
                        {blueprintInfo && (
                            <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                ✓ Blueprint 자동 반영
                            </span>
                        )}
                    </div>
                    <div className="p-4 overflow-x-auto custom-scrollbar">
                        <pre className="text-xs font-mono text-slate-300 leading-relaxed">
                            <code>{code || lang}</code>
                        </pre>
                    </div>
                </div>
            );
        });
    };

    const displayText = content
        .replace(/\[MCP_TOOL_CALL\][\s\S]*?\[\/MCP_TOOL_CALL\]/g, "")
        .replace(/\[SYSTEM\][\s\S]*?\n/g, "")
        .replace(/\[STEP:.*?\]/g, "")
        .trim();

    return (
        <div className="leading-relaxed text-sm text-slate-200">
            {displayText ? renderContent(displayText) : (isLoading && (
                <div className="space-y-2 py-2">
                    <div className="h-4 bg-slate-800/50 rounded w-3/4 animate-pulse" />
                    <div className="h-4 bg-slate-800/50 rounded w-1/2 animate-pulse" />
                </div>
            ))}
        </div>
    );
};

// ─── BlueprintSection ─────────────────────────────────────────────────────────
function BlueprintSection({
    title, icon, data, onUpdate, expanded, onToggle, accent, emptyHint, template, footer
}: {
    title: string;
    icon: React.ReactNode;
    data: unknown;
    onUpdate: (val: string) => void;
    expanded: boolean;
    onToggle: () => void;
    accent: string;
    emptyHint: string;
    template: string;
    footer?: React.ReactNode;
}) {
    const [editing, setEditing] = React.useState(false);
    const [editValue, setEditValue] = React.useState("");
    const [editError, setEditError] = React.useState(false);
    const jsonStr = data ? JSON.stringify(data, null, 2) : null;

    return (
        <div className={cn(
            "rounded-xl border overflow-hidden transition-all",
            data ? "border-slate-700/80" : "border-slate-800/50"
        )}>
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/60 hover:bg-slate-800/60 transition-colors"
            >
                <div className="flex items-center gap-2">
                    {icon}
                    <span className={cn("font-semibold text-sm", data ? accent : "text-slate-600")}>{title}</span>
                </div>
                <div className="flex items-center gap-2">
                    {data
                        ? <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">설정됨</span>
                        : <span className="text-[9px] text-slate-600 italic">미설정</span>
                    }
                    <ChevronDown className={cn("size-3 text-slate-500 transition-transform", expanded ? "rotate-180" : "")} />
                </div>
            </button>
            {expanded && (
                <div className="border-t border-slate-800">
                    {editing ? (
                        <div className="p-3 space-y-2">
                            <textarea
                                value={editValue}
                                onChange={e => { setEditValue(e.target.value); setEditError(false); }}
                                rows={6}
                                className={cn(
                                    "w-full bg-slate-950 border rounded-lg p-2 text-xs font-mono text-slate-300 focus:outline-none focus:ring-1 resize-none",
                                    editError ? "border-red-500 focus:ring-red-500" : "border-slate-700 focus:ring-blue-500"
                                )}
                            />
                            {editError && <p className="text-[10px] text-red-400">유효한 JSON 형식이 아닙니다.</p>}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        try { JSON.parse(editValue); onUpdate(editValue); setEditing(false); setEditError(false); }
                                        catch { setEditError(true); }
                                    }}
                                    className="flex-1 py-1.5 text-xs text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/10 transition-colors"
                                >적용</button>
                                <button
                                    onClick={() => { setEditing(false); setEditError(false); }}
                                    className="flex-1 py-1.5 text-xs text-slate-500 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
                                >취소</button>
                            </div>
                        </div>
                    ) : (
                        <div className="p-3 space-y-2">
                            {jsonStr ? (
                                <>
                                    <pre className="text-xs font-mono text-slate-300 bg-slate-950 rounded-lg p-2.5 overflow-x-auto max-h-36 custom-scrollbar leading-relaxed">{jsonStr}</pre>
                                    <button
                                        onClick={() => { setEditValue(jsonStr); setEditing(true); }}
                                        className="text-[10px] text-slate-600 hover:text-slate-400 underline transition-colors"
                                    >직접 편집</button>
                                </>
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-xs text-slate-600 italic px-1">{emptyHint}</p>
                                    <button
                                        onClick={() => { setEditValue(template); setEditing(true); }}
                                        className="text-[10px] text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-600 px-2.5 py-1 rounded-lg transition-colors"
                                    >+ 직접 입력</button>
                                </div>
                            )}
                        </div>
                    )}
                    {footer && <div className="border-t border-slate-800/50">{footer}</div>}
                </div>
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BuilderPage() {
    const [mounted, setMounted] = React.useState(false);
    const [assets, setAssets] = React.useState<{ name: string; ip: string; port?: string }[]>([]);
    const [mcpTools, setMcpTools] = React.useState<any[]>([]);
    // MCP Explorer drawer state
    const [mcpExplorerOpen, setMcpExplorerOpen] = React.useState(false);
    const [mcpExplorerProvider, setMcpExplorerProvider] = React.useState("");
    const [mcpExplorerSelectedTool, setMcpExplorerSelectedTool] = React.useState<any | null>(null);
    const [toolFilter, setToolFilter] = React.useState("");
    const [jobTitle, setJobTitle] = React.useState("New Monitoring Job");
    const [selectedAssets, setSelectedAssets] = React.useState<string[]>([]);
    const [intervalValue, setIntervalValue] = React.useState("5");
    const [intervalUnit, setIntervalUnit] = React.useState<"minutes" | "hours">("minutes");
    const [blueprint, setBlueprint] = React.useState<Blueprint>({
        monitor: null, parser: null, threshold: null, action: null
    });
    const [expandedSections, setExpandedSections] = React.useState<Set<string>>(new Set(["monitor"]));
    // Step-by-step run states
    const [monitorResult, setMonitorResult] = React.useState<unknown>(null);
    const [monitorLoading, setMonitorLoading] = React.useState(false);
    const [parsedVars, setParsedVars] = React.useState<Record<string, unknown> | null>(null);
    const [parserLoading, setParserLoading] = React.useState(false);
    const [thresholdStatus, setThresholdStatus] = React.useState<string | null>(null); // 'green'|'amber'|'red'
    // AI sub-panel (dedicated Parser / Threshold design assistant)
    const [aiPanelType, setAiPanelType] = React.useState<"parser" | "threshold" | null>(null);
    const [aiPanelInput, setAiPanelInput] = React.useState("");
    const [aiPanelResponse, setAiPanelResponse] = React.useState("");
    const [aiPanelLoading, setAiPanelLoading] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [saved, setSaved] = React.useState(false);

    const chat = useChat({ api: "/api/chat", body: { mode: "builder" } });
    const messagesEndRef = React.useRef<HTMLDivElement>(null);

    const INIT_MESSAGE = "안녕하세요! **PRISM Builder**입니다 🛡️\n\n모니터링하고 싶은 항목을 알려주세요. **수집 → 파싱 → 임계치 → 자동 조치**를 단계적으로 설계해드립니다.\n\n> 💡 모니터링 **대상(자산)** 은 왼쪽 **Config** 탭에서 선택하세요. 여기서는 \"무엇을\" 모니터링할지만 얘기해주세요.";

    // Init
    React.useEffect(() => {
        setMounted(true);
        fetch("/api/onboarding/status").then(r => r.json()).then(data => {
            if (data.config?.assets) setAssets(data.config.assets);
        }).catch(() => { });
        fetch("/api/mcp/tools").then(r => r.json()).then(data => {
            if (data.tools) setMcpTools(data.tools);
        }).catch(() => { });
        setTimeout(() => {
            chat.setMessages([{ id: "init", role: "assistant", content: INIT_MESSAGE }]);
        }, 100);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-parse blueprint JSON blocks from AI responses
    React.useEffect(() => {
        const lastMsg = chat.messages[chat.messages.length - 1];
        if (!lastMsg || lastMsg.role !== "assistant" || chat.isLoading) return;
        const content = lastMsg.content;

        const tryParse = (pattern: RegExp, key: keyof Blueprint) => {
            const match = content.match(pattern);
            if (!match) return;
            try {
                const parsed = JSON.parse(match[1].trim());
                setBlueprint(prev => ({ ...prev, [key]: parsed }));
                setExpandedSections(prev => new Set([...prev, key]));
            } catch { }
        };

        tryParse(/```monitor\s*\n([\s\S]*?)\n?\s*```/, "monitor");
        tryParse(/```parser\s*\n([\s\S]*?)\n?\s*```/, "parser");
        tryParse(/```threshold\s*\n([\s\S]*?)\n?\s*```/, "threshold");
        tryParse(/```action\s*\n([\s\S]*?)\n?\s*```/, "action");
    }, [chat.messages, chat.isLoading]);

    // Scroll to bottom
    React.useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chat.messages, chat.isLoading]);

    // Auto-expand sections as workflow progresses
    React.useEffect(() => {
        if (monitorResult !== null) {
            setExpandedSections(prev => new Set([...prev, "parser"]));
        }
    }, [monitorResult]);

    React.useEffect(() => {
        if (parsedVars !== null) {
            setExpandedSections(prev => new Set([...prev, "threshold"]));
        }
    }, [parsedVars]);

    React.useEffect(() => {
        if (thresholdStatus !== null) {
            setExpandedSections(prev => new Set([...prev, "action"]));
        }
    }, [thresholdStatus]);

    const toggleSection = (key: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    // Replace {target} and any {placeholder} in string args with the actual target IP
    const resolveTemplateArgs = (args: Record<string, unknown>, target: string): Record<string, unknown> =>
        Object.fromEntries(Object.entries(args).map(([k, v]) => [
            k,
            typeof v === 'string' ? v.replace(/\{[^}]+\}/g, target) : v
        ]));

    const handleMonitorRun = async () => {
        if (!blueprint.monitor) return;
        setMonitorLoading(true);
        setMonitorResult(null);
        setParsedVars(null);
        setThresholdStatus(null);
        const toolName = blueprint.monitor.tool_name;
        const { target: _t, targets: _ts, ...baseArgs } = (blueprint.monitor.args || {}) as Record<string, unknown>;
        void _t; void _ts;

        const execOnce = async (ip?: string) => {
            const resolved = ip ? resolveTemplateArgs(baseArgs, ip) : baseArgs;
            const toolArgs = ip ? { ...resolved, target: ip } : resolved;
            const res = await fetch("/api/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ toolName, toolArgs })
            });
            return await res.json();
        };

        try {
            if (toolName === "execute_host_command" && selectedAssets.length > 0) {
                if (selectedAssets.length === 1) {
                    setMonitorResult(await execOnce(selectedAssets[0]));
                } else {
                    const results: Record<string, unknown> = {};
                    for (const ip of selectedAssets) results[ip] = await execOnce(ip);
                    setMonitorResult(results);
                }
            } else {
                setMonitorResult(await execOnce());
            }
        } catch (e) {
            setMonitorResult({ error: String(e) });
        } finally {
            setMonitorLoading(false);
        }
    };

    const handleParserRun = () => {
        if (!blueprint.parser || !monitorResult) return;
        setParserLoading(true);
        try {
            const vars: Record<string, unknown> = {};
            // Prefer stdout for text-based regex parsing
            const resultObj = monitorResult as Record<string, unknown>;
            const searchText = typeof resultObj?.stdout === 'string'
                ? resultObj.stdout
                : JSON.stringify(monitorResult);

            for (const [varName, path] of Object.entries(blueprint.parser)) {
                if (typeof path !== 'string') { vars[varName] = '(invalid)'; continue; }

                if (path.startsWith('$.')) {
                    // JSONPath: simple key traversal
                    const parts = path.slice(2).split('.');
                    let cur: unknown = monitorResult;
                    for (const p of parts) {
                        cur = (cur && typeof cur === 'object') ? (cur as Record<string, unknown>)[p] : undefined;
                    }
                    vars[varName] = cur ?? '(not found)';
                } else if (/^regex\(/.test(path)) {
                    // regex("pattern", group) evaluation
                    const m = path.match(/^regex\("((?:[^"\\]|\\.)*)",\s*(\d+)\)$/);
                    if (m) {
                        const pattern = m[1].replace(/\\"/g, '"');
                        const group = parseInt(m[2]);
                        try {
                            let finalPattern = pattern;
                            let flags = "";
                            if (finalPattern.startsWith("(?m)")) {
                                finalPattern = finalPattern.slice(4);
                                flags = "m";
                            }
                            const re = new RegExp(finalPattern, flags);
                            const match = searchText.match(re);
                            vars[varName] = match?.[group] ?? '(not found)';
                        } catch (e) {
                            vars[varName] = `(regex error: ${e})`;
                        }
                    } else {
                        vars[varName] = '(invalid regex syntax)';
                    }
                } else {
                    vars[varName] = '(unsupported expression)';
                }
            }
            setParsedVars(vars);
        } finally {
            setParserLoading(false);
        }
    };

    const handleThresholdEval = () => {
        if (!blueprint.threshold || !monitorResult) return;
        const th = blueprint.threshold;
        if (th.mode === 'contains') {
            const s = JSON.stringify(monitorResult).toLowerCase();
            const contains: string[] = (th as any).contains || [];
            const notContains: string[] = (th as any).not_contains || [];
            const matchLevel: string = (th as any).match_level || 'red';
            for (const nc of notContains) { if (s.includes(nc.toLowerCase())) { setThresholdStatus('green'); return; } }
            for (const c of contains) { if (s.includes(c.toLowerCase())) { setThresholdStatus(matchLevel); return; } }
            setThresholdStatus('green');
        } else if (th.mode === 'variable') {
            // Evaluate comparison rules against parsedVars
            if (!parsedVars) { setThresholdStatus('amber'); return; }
            const rules: { var: string; op: string; value: number | string; level?: string }[] = (th as any).rules || [];
            let status = 'green';
            for (const rule of rules) {
                const raw = parsedVars[rule.var];
                if (raw === undefined || raw === null || raw === '(not found)') continue;
                const val = parseFloat(String(raw));
                const threshold = parseFloat(String(rule.value));
                if (isNaN(val) || isNaN(threshold)) continue;
                const op = rule.op;
                const triggered = (
                    (op === '>' && val > threshold) ||
                    (op === '>=' && val >= threshold) ||
                    (op === '<' && val < threshold) ||
                    (op === '<=' && val <= threshold) ||
                    (op === '==' && val === threshold)
                );
                if (triggered) {
                    const level = rule.level || 'red';
                    if (level === 'red') { setThresholdStatus('red'); return; }
                    if (level === 'amber' && status === 'green') status = 'amber';
                }
            }
            setThresholdStatus(status);
        } else {
            setThresholdStatus('amber'); // structured/ai: cannot auto-evaluate
        }
    };

    const handleAskAI = () => {
        if (!monitorResult) return;
        chat.append({
            role: "user",
            content: `테스트 실행 결과입니다. 이 결과를 바탕으로 파싱 규칙과 임계치를 제안해주세요:\n\`\`\`json\n${JSON.stringify(monitorResult, null, 2)}\n\`\`\``
        });
    };

    const openAiPanel = (type: "parser" | "threshold") => {
        setAiPanelType(type);
        setAiPanelInput("");
        setAiPanelResponse("");
        setAiPanelLoading(false);
    };

    const handleAiPanelSubmit = async () => {
        if (!aiPanelInput.trim() || aiPanelLoading) return;
        setAiPanelLoading(true);
        setAiPanelResponse("");

        // Build focused context message
        let userMessage = "";
        if (aiPanelType === "parser") {
            const resultText = monitorResult ? JSON.stringify(monitorResult, null, 2) : "(실행 결과 없음)";
            const currentParser = blueprint.parser ? `\n현재 파서:\n${JSON.stringify(blueprint.parser, null, 2)}` : "";
            userMessage = `수집 결과를 보고 파서(Parser)를 설계해주세요.\n\n수집 결과:\n${resultText}${currentParser}\n\n요청사항: ${aiPanelInput}\n\n반드시 \`\`\`parser 코드블록으로 결과를 출력해주세요.`;
        } else {
            const parserText = blueprint.parser ? JSON.stringify(blueprint.parser, null, 2) : "(파서 없음)";
            const parsedText = parsedVars
                ? Object.entries(parsedVars).map(([k, v]) => `${k}: ${v}`).join(", ")
                : "(파싱 미실행)";
            const currentThreshold = blueprint.threshold ? `\n현재 임계치:\n${JSON.stringify(blueprint.threshold, null, 2)}` : "";
            userMessage = `파서 변수를 기반으로 임계치(Threshold)를 설계해주세요.\n\n파서 규칙:\n${parserText}\n\n파싱된 변수 값: ${parsedText}${currentThreshold}\n\n요청사항: ${aiPanelInput}\n\n반드시 \`\`\`threshold 코드블록으로 결과를 출력해주세요. variable 모드를 우선 사용하세요.`;
        }

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [{ role: "user", content: userMessage }],
                    mode: "builder"
                })
            });
            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let fullText = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const raw = decoder.decode(value, { stream: true });
                for (const line of raw.split("\n")) {
                    if (line.startsWith("0:")) {
                        try { fullText += JSON.parse(line.slice(2)); } catch { }
                    }
                }
                setAiPanelResponse(fullText);
            }
        } catch (e) {
            setAiPanelResponse(`오류: ${String(e)}`);
        } finally {
            setAiPanelLoading(false);
        }
    };

    const applyAiPanelResult = () => {
        if (!aiPanelType || !aiPanelResponse) return;
        const pattern = aiPanelType === "parser"
            ? /```parser\s*\n([\s\S]*?)\n?\s*```/
            : /```threshold\s*\n([\s\S]*?)\n?\s*```/;
        const m = aiPanelResponse.match(pattern);
        if (m) {
            try {
                const parsed = JSON.parse(m[1].trim());
                setBlueprint(prev => ({ ...prev, [aiPanelType]: parsed }));
                setExpandedSections(prev => new Set([...prev, aiPanelType!]));
                setAiPanelType(null);
            } catch { alert("JSON 파싱 실패: AI 응답 형식을 확인하세요."); }
        } else {
            alert(`\`\`\`${aiPanelType} 블록을 찾지 못했습니다. 응답을 확인하세요.`);
        }
    };

    const handleSave = async () => {
        if (!blueprint.monitor) return;
        const { target: _t, targets: _ts, ...cleanArgs } = (blueprint.monitor.args || {}) as Record<string, unknown>;
        void _t; void _ts;

        let actionToolName = null;
        let actionToolArgs = null;
        if (blueprint.action) {
            actionToolName = blueprint.action.action_tool_name;
            actionToolArgs = typeof blueprint.action.action_tool_args === "string"
                ? blueprint.action.action_tool_args
                : JSON.stringify(blueprint.action.action_tool_args || {});
        }

        const intervalMinutes = intervalUnit === "minutes" ? parseInt(intervalValue) : parseInt(intervalValue) * 60;
        setSaving(true);
        try {
            const res = await fetch("/api/monitoring/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: jobTitle,
                    toolName: blueprint.monitor.tool_name,
                    toolArgs: cleanArgs,
                    targetAgents: selectedAssets,
                    thresholdCondition: (() => {
                        if (!blueprint.threshold) return null;
                        const t = { ...blueprint.threshold } as Record<string, unknown>;
                        if (t.mode === 'variable' && blueprint.parser) {
                            t.parserRules = blueprint.parser;
                        }
                        return JSON.stringify(t);
                    })(),
                    intervalMinutes,
                    actionToolName,
                    actionToolArgs
                })
            });
            if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
            else alert("저장에 실패했습니다.");
        } catch (e) { alert(String(e)); } finally { setSaving(false); }
    };

    const updateBlueprintSection = (key: keyof Blueprint, value: string) => {
        try {
            const parsed = JSON.parse(value);
            setBlueprint(prev => ({ ...prev, [key]: parsed }));
        } catch { }
    };

    const handleReset = () => {
        chat.setMessages([{ id: "init-reset", role: "assistant", content: INIT_MESSAGE }]);
        setBlueprint({ monitor: null, parser: null, threshold: null, action: null });
        setMonitorResult(null);
        setParsedVars(null);
        setThresholdStatus(null);
        setExpandedSections(new Set(["monitor"]));
    };

    const completedCount = [blueprint.monitor, blueprint.threshold].filter(Boolean).length;

    // UX: left panel must be filled first if assets are registered
    const configReady = assets.length === 0 || selectedAssets.length > 0;

    // Workflow step index for progress bar (0-4)
    const WORKFLOW_STEPS = ["자산 선택", "도구 설계", "테스트 실행", "파서/임계치", "저장"];
    const stepIndex = !configReady ? -1 :
        !blueprint.monitor ? 0 :
            !monitorResult ? 1 :
                (!parsedVars && !thresholdStatus) ? 2 :
                    !saved ? 3 : 4;

    // Group MCP tools by provider for the explorer drawer
    const mcpProviders: Record<string, any[]> = React.useMemo(() => {
        const groups: Record<string, any[]> = {};
        for (const tool of mcpTools) {
            const p = tool.provider || "기타";
            if (!groups[p]) groups[p] = [];
            groups[p].push(tool);
        }
        return groups;
    }, [mcpTools]);

    const explorerProviderList = Object.keys(mcpProviders);
    const isProviderOffline = (mcpProviders[mcpExplorerProvider] || []).every((t: any) => t._offline);
    const currentExplorerTools = (mcpProviders[mcpExplorerProvider] || []).filter((t: any) =>
        !t._offline && (
            !toolFilter
            || t.name?.toLowerCase().includes(toolFilter.toLowerCase())
            || (t.description || "").toLowerCase().includes(toolFilter.toLowerCase())
        )
    );

    const openMcpExplorer = () => {
        if (!mcpExplorerProvider && explorerProviderList.length > 0) {
            setMcpExplorerProvider(explorerProviderList[0]);
        }
        setMcpExplorerSelectedTool(null);
        setMcpExplorerOpen(true);
    };

    if (!mounted) return null;

    return (
        <div className="flex flex-col h-screen w-full animate-in fade-in duration-500 overflow-hidden font-sans">

            {/* ── Header ───────────────────────────────────────────────────── */}
            <header className="px-6 py-4 border-b border-slate-800/50 bg-slate-950/50 backdrop-blur-md flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="size-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <Bot className="size-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold tracking-tight text-white">Builder Chat</h2>
                        <p className="text-xs text-slate-500">수집 → 파싱 → 임계치 → 조치 자동화 설계</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={openMcpExplorer}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-xs font-semibold"
                    >
                        <Layers className="size-3.5" /> MCP Tools
                    </button>
                    {completedCount > 0 && (
                        <Badge className="bg-blue-600/20 text-blue-400 border-blue-500/30 font-mono">
                            {completedCount}/2 핵심 단계 완료
                        </Badge>
                    )}
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden relative">

                {/* ── MCP EXPLORER DRAWER ──────────────────────────────────── */}
                {mcpExplorerOpen && (
                    <div className="absolute inset-0 z-50 flex flex-col bg-slate-950 animate-in slide-in-from-right duration-200">
                        {/* Drawer Header */}
                        <div className="px-5 py-4 border-b border-slate-800/50 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2">
                                <Layers className="size-4 text-emerald-400" />
                                <h3 className="text-sm font-bold text-white">MCP Tool Explorer</h3>
                                <span className="text-[10px] text-slate-500 ml-1">{mcpTools.length}개 도구</span>
                            </div>
                            <button
                                onClick={() => setMcpExplorerOpen(false)}
                                className="size-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                                <X className="size-4" />
                            </button>
                        </div>

                        {/* Provider Tabs */}
                        {explorerProviderList.length > 0 && (
                            <div className="flex border-b border-slate-800/50 overflow-x-auto shrink-0">
                                {explorerProviderList.map(p => (
                                    <button
                                        key={p}
                                        onClick={() => { setMcpExplorerProvider(p); setMcpExplorerSelectedTool(null); setToolFilter(""); }}
                                        className={cn(
                                            "flex-shrink-0 px-4 py-2.5 text-xs font-semibold transition-colors flex items-center gap-1.5",
                                            mcpExplorerProvider === p
                                                ? "text-emerald-400 border-b-2 border-emerald-500 bg-emerald-500/5"
                                                : "text-slate-500 hover:text-slate-300"
                                        )}
                                    >
                                        {(mcpProviders[p] || []).every((t: any) => t._offline)
                                            ? <span className="size-1.5 rounded-full bg-red-500 shrink-0" />
                                            : <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                                        }
                                        {p} <span className="ml-0.5 text-[10px] text-slate-600">({(mcpProviders[p] || []).filter((t: any) => !t._offline).length})</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Content: Tool List or Tool Detail */}
                        {mcpExplorerSelectedTool ? (
                            /* ── Tool Detail ── */
                            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                                <div className="p-5 flex-1 space-y-4">
                                    <button
                                        onClick={() => setMcpExplorerSelectedTool(null)}
                                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                                    >
                                        <ArrowLeft className="size-3.5" /> 목록으로
                                    </button>
                                    <div>
                                        <code className="text-sm font-bold text-white">{mcpExplorerSelectedTool.name}</code>
                                        {mcpExplorerSelectedTool.provider && (
                                            <span className="ml-2 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">{mcpExplorerSelectedTool.provider}</span>
                                        )}
                                    </div>
                                    {mcpExplorerSelectedTool.description && (
                                        <p className="text-sm text-slate-300 leading-relaxed">{mcpExplorerSelectedTool.description}</p>
                                    )}
                                    {mcpExplorerSelectedTool.inputSchema?.properties && (
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">파라미터</p>
                                            <div className="space-y-2">
                                                {Object.entries(mcpExplorerSelectedTool.inputSchema.properties as Record<string, any>).map(([k, v]) => (
                                                    <div key={k} className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <code className="text-xs font-bold text-blue-400">{k}</code>
                                                            {(mcpExplorerSelectedTool.inputSchema.required || []).includes(k) && (
                                                                <span className="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">필수</span>
                                                            )}
                                                            <span className="text-[10px] text-slate-600 font-mono">{(v as any).type}</span>
                                                        </div>
                                                        {(v as any).description && (
                                                            <p className="text-[11px] text-slate-500 leading-relaxed">{(v as any).description}</p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="p-4 border-t border-slate-800/50 shrink-0">
                                    <button
                                        onClick={() => {
                                            chat.append({
                                                role: "user",
                                                content: `**${mcpExplorerSelectedTool.name}** 도구 사용법을 알려주세요. 어떤 모니터링에 활용할 수 있나요?`
                                            });
                                            setMcpExplorerOpen(false);
                                        }}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-purple-400 border border-purple-500/30 bg-purple-500/10 rounded-xl hover:bg-purple-500/20 transition-colors"
                                    >
                                        <Brain className="size-4" /> 사용법 질문하기
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* ── Tool List ── */
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <div className="p-4 space-y-3">
                                    <input
                                        value={toolFilter}
                                        onChange={e => setToolFilter(e.target.value)}
                                        placeholder="도구 검색..."
                                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    />
                                    {isProviderOffline ? (
                                        <div className="py-16 text-center space-y-2">
                                            <div className="size-10 mx-auto mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
                                                <Server className="size-5 text-red-500/60" />
                                            </div>
                                            <p className="text-xs font-semibold text-red-400/80">Service Unreachable</p>
                                            <p className="text-[10px] text-slate-600 max-w-[200px] mx-auto">
                                                {(mcpProviders[mcpExplorerProvider]?.[0] as any)?.description || "MCP 서버에 연결할 수 없습니다."}
                                            </p>
                                        </div>
                                    ) : currentExplorerTools.length === 0 ? (
                                        <div className="py-16 text-center">
                                            <Database className="size-10 mx-auto mb-3 text-slate-800" />
                                            <p className="text-xs text-slate-600">
                                                {mcpTools.length === 0 ? "MCP 도구 연결 없음" : "검색 결과 없음"}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {currentExplorerTools.map(tool => (
                                                <button
                                                    key={tool.name}
                                                    onClick={() => setMcpExplorerSelectedTool(tool)}
                                                    className="w-full text-left p-3 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all group"
                                                >
                                                    <div className="flex items-start justify-between mb-1">
                                                        <code className="text-[11px] font-bold text-white group-hover:text-emerald-400 transition-colors leading-tight">{tool.name}</code>
                                                        <ChevronRight className="size-3 text-slate-600 group-hover:text-emerald-500 mt-0.5 shrink-0 ml-1" />
                                                    </div>
                                                    {tool.description && (
                                                        <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2 mb-1.5">{tool.description}</p>
                                                    )}
                                                    {tool.inputSchema?.properties && (
                                                        <div className="flex flex-wrap gap-1">
                                                            {Object.keys(tool.inputSchema.properties).filter((k: string) => !["target", "targets"].includes(k)).slice(0, 4).map((arg: string) => (
                                                                <span key={arg} className="text-[9px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">{arg}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── AI SUB-PANEL (Parser / Threshold design) ─────────────── */}
                {aiPanelType && (
                    <div className="absolute inset-0 z-50 flex flex-col bg-slate-950 animate-in slide-in-from-right duration-200">
                        {/* Header */}
                        <div className="px-5 py-4 border-b border-slate-800/50 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2">
                                <Brain className="size-4 text-purple-400" />
                                <h3 className="text-sm font-bold text-white">
                                    {aiPanelType === "parser" ? "Parser AI 설계" : "Threshold AI 설계"}
                                </h3>
                            </div>
                            <button
                                onClick={() => setAiPanelType(null)}
                                className="size-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                                <X className="size-4" />
                            </button>
                        </div>

                        {/* Context summary */}
                        <div className="px-5 py-3 border-b border-slate-800/50 shrink-0 space-y-2">
                            {aiPanelType === "parser" ? (
                                !!monitorResult && (
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-500 mb-1">수집 결과 (참고용)</p>
                                        <pre className="text-[10px] font-mono text-slate-400 bg-slate-900 rounded-lg p-2 max-h-56 overflow-y-auto custom-scrollbar whitespace-pre-wrap">{JSON.stringify(monitorResult, null, 2).replace(/\\n/g, '\n').replace(/\\t/g, '\t')}</pre>
                                    </div>
                                )
                            ) : (
                                parsedVars ? (
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-500 mb-1.5">파서 변수 (파싱 결과)</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {Object.entries(parsedVars).map(([k, v]) => (
                                                <span key={k} className="text-[10px] font-mono bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-cyan-400">
                                                    {k}: <span className="text-slate-300">{String(v)}</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-[10px] text-slate-600">Parser를 먼저 실행하면 추출된 변수를 참고할 수 있습니다.</p>
                                )
                            )}
                        </div>

                        {/* AI Response (streaming) */}
                        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                            {aiPanelResponse ? (
                                <div className="text-sm text-slate-200 leading-relaxed">
                                    <MessageRenderer content={aiPanelResponse} isLoading={aiPanelLoading} />
                                </div>
                            ) : !aiPanelLoading ? (
                                <div className="h-full flex items-center justify-center text-center px-4">
                                    <p className="text-sm text-slate-600 leading-relaxed">
                                        {aiPanelType === "parser"
                                            ? "어떤 변수를 추출하고 싶은지 입력하세요.\n예: \"stdout에서 패킷 손실률과 평균 지연시간 추출해줘\""
                                            : "어떤 기준으로 판단할지 입력하세요.\n예: \"LAN 환경, rtt_avg 20ms 초과 시 경고, 100ms 초과 시 위험\""
                                        }
                                    </p>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-xs text-purple-400 p-2">
                                    <Loader2 className="size-3.5 animate-spin" /> AI 분석 중...
                                </div>
                            )}
                        </div>

                        {/* Input + Action buttons */}
                        <div className="p-4 border-t border-slate-800/50 space-y-2 shrink-0">
                            <textarea
                                value={aiPanelInput}
                                onChange={e => setAiPanelInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAiPanelSubmit(); }}
                                placeholder={aiPanelType === "parser" ? "추출할 변수 및 조건 입력... (Cmd+Enter로 전송)" : "임계치 조건 입력... (Cmd+Enter로 전송)"}
                                rows={3}
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                            />
                            <div className="flex gap-2">
                                <Button
                                    onClick={handleAiPanelSubmit}
                                    disabled={!aiPanelInput.trim() || aiPanelLoading}
                                    className="flex-1 bg-purple-600 hover:bg-purple-500 font-bold gap-2 disabled:opacity-40"
                                >
                                    {aiPanelLoading ? <Loader2 className="size-4 animate-spin" /> : <Brain className="size-4" />}
                                    AI 분석 요청
                                </Button>
                                {!!aiPanelResponse && !aiPanelLoading && (
                                    <Button
                                        onClick={applyAiPanelResult}
                                        variant="outline"
                                        className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 gap-1.5"
                                    >
                                        <CheckCircle2 className="size-4" /> 적용
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── LEFT PANEL: Job Config ───────────────────────────────── */}
                <div className={cn(
                    "w-[260px] shrink-0 border-r flex flex-col bg-slate-950/30 relative transition-all duration-500",
                    !configReady && assets.length > 0
                        ? "border-blue-500/70 shadow-[0_0_24px_rgba(59,130,246,0.18)]"
                        : "border-slate-800/50"
                )}>
                    <div className="px-4 py-3 border-b border-slate-800/50 shrink-0 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Settings2 className="size-3.5 text-blue-400" />
                            <span className="text-xs font-bold text-slate-300">Job Config</span>
                        </div>
                        {!configReady && assets.length > 0 && (
                            <span className="text-[9px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full animate-pulse">
                                START
                            </span>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
                        {/* Job Title */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Job 이름</label>
                            <input
                                value={jobTitle}
                                onChange={e => setJobTitle(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="New Monitoring Job"
                            />
                        </div>

                        {/* Monitoring Interval */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                <Clock className="size-3" /> 모니터링 주기
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="number" min={1} value={intervalValue}
                                    onChange={e => setIntervalValue(e.target.value)}
                                    className="w-20 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <select
                                    value={intervalUnit}
                                    onChange={e => setIntervalUnit(e.target.value as "minutes" | "hours")}
                                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                    <option value="minutes">분 (min)</option>
                                    <option value="hours">시간 (hr)</option>
                                </select>
                            </div>
                        </div>

                        {/* Target Assets */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                <Server className="size-3" /> 모니터링 대상 (자산)
                            </label>
                            {!configReady && assets.length > 0 && (
                                <div className="flex items-center gap-1.5 text-[10px] text-blue-400 font-bold animate-bounce">
                                    <ChevronDown className="size-3.5" />
                                    대상을 하나 이상 선택하세요
                                </div>
                            )}
                            <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/15 flex items-start gap-2">
                                <Info className="size-3 text-blue-400 mt-0.5 shrink-0" />
                                <p className="text-[10px] text-slate-500 leading-relaxed">
                                    선택한 IP는 {'{target}'} 플레이스홀더로 자동 치환됩니다.
                                </p>
                            </div>
                            {assets.length === 0 ? (
                                <p className="text-xs text-slate-600 italic p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                                    Settings에서 Asset을 등록하면 여기서 선택할 수 있습니다.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {assets.map(a => {
                                        const checked = selectedAssets.includes(a.ip);
                                        return (
                                            <button
                                                key={a.ip}
                                                onClick={() => setSelectedAssets(prev =>
                                                    prev.includes(a.ip) ? prev.filter(x => x !== a.ip) : [...prev, a.ip]
                                                )}
                                                className={cn(
                                                    "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                                                    checked ? "border-blue-500/50 bg-blue-500/10 text-blue-300" : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700"
                                                )}
                                            >
                                                <div className={cn("size-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors", checked ? "border-blue-500 bg-blue-500" : "border-slate-600")}>
                                                    {checked && <CheckCircle2 className="size-3 text-white" />}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold">{a.name}</p>
                                                    <p className="text-[10px] font-mono text-slate-500">{a.ip}{a.port ? `:${a.port}` : ""}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            {selectedAssets.length > 0 && (
                                <p className="text-[10px] text-blue-400 font-bold">{selectedAssets.length}개 자산 선택됨</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── CENTER: CHAT ─────────────────────────────────────────── */}
                <div className="flex-1 flex flex-col overflow-hidden relative">
                    {/* Overlay when assets registered but none selected */}
                    {!configReady && assets.length > 0 && (
                        <div className="absolute inset-0 z-10 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center">
                            <div className="text-center px-8">
                                <div className="size-16 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/10">
                                    <ArrowLeft className="size-7 text-blue-400" />
                                </div>
                                <p className="text-sm font-bold text-white mb-2">먼저 왼쪽 패널을 설정하세요</p>
                                <p className="text-xs text-slate-500 leading-relaxed">
                                    모니터링 대상(자산)을 하나 이상 선택한 후<br />AI와 대화를 시작할 수 있습니다.
                                </p>
                            </div>
                        </div>
                    )}
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                        {chat.messages.map(m => (
                            <div key={m.id} className={cn("flex gap-3", m.role === "user" ? "justify-end" : "justify-start")}>
                                {m.role === "assistant" && (
                                    <div className="size-8 shrink-0 rounded-xl flex items-center justify-center bg-blue-600 shadow-md shadow-blue-500/20 mt-1">
                                        <Bot className="size-4 text-white" />
                                    </div>
                                )}
                                <div className={cn(
                                    "max-w-[85%] p-4 rounded-2xl",
                                    m.role === "user"
                                        ? "bg-slate-800 text-slate-100 rounded-tr-none border border-slate-700/50"
                                        : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none"
                                )}>
                                    <MessageRenderer
                                        content={m.content}
                                        isLoading={chat.isLoading && m.id === chat.messages[chat.messages.length - 1]?.id}
                                    />
                                </div>
                                {m.role === "user" && (
                                    <div className="size-8 shrink-0 rounded-xl flex items-center justify-center bg-slate-700 mt-1">
                                        <Server className="size-4 text-slate-300" />
                                    </div>
                                )}
                            </div>
                        ))}

                        {chat.isLoading && (
                            <div className="flex gap-3 items-center">
                                <div className="size-8 shrink-0 rounded-xl flex items-center justify-center bg-blue-600 shadow-md shadow-blue-500/20">
                                    <Loader2 className="size-4 text-white animate-spin" />
                                </div>
                                <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl rounded-tl-none">
                                    <div className="flex gap-1">
                                        <div className="size-1.5 rounded-full bg-blue-500/50 animate-bounce" />
                                        <div className="size-1.5 rounded-full bg-blue-500/50 animate-bounce [animation-delay:0.2s]" />
                                        <div className="size-1.5 rounded-full bg-blue-500/50 animate-bounce [animation-delay:0.4s]" />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} className="h-2" />
                    </div>

                    {/* Quick Prompt Suggestions (empty/initial state) */}
                    {chat.messages.length <= 1 && !chat.isLoading && configReady && (
                        <div className="px-6 pb-3">
                            <p className="text-[10px] text-slate-600 mb-2 font-semibold uppercase tracking-widest">빠른 시작</p>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    "Wazuh 에이전트 상태를 모니터링하고 싶어",
                                    "CPU 사용량이 높은 프로세스를 감시하고 싶어",
                                    "로그 파일에서 ERROR를 탐지하고 싶어",
                                    "보안 취약점이 있는 호스트를 주기적으로 체크하고 싶어",
                                ].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => chat.append({ role: "user", content: s })}
                                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-full text-xs text-slate-300 transition-colors flex items-center gap-1.5"
                                    >
                                        <ChevronRight className="size-3 text-blue-400" /> {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Input Area */}
                    <div className="border-t border-slate-800/50 bg-slate-900/30 p-4 shrink-0">
                        {/* Workflow Step Progress */}
                        <div className="flex items-center gap-0.5 mb-3 overflow-x-auto pb-1">
                            {WORKFLOW_STEPS.map((step, i) => (
                                <React.Fragment key={step}>
                                    <div className={cn(
                                        "flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold transition-all shrink-0",
                                        i === stepIndex
                                            ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                                            : i < stepIndex
                                                ? "text-emerald-500"
                                                : "text-slate-700"
                                    )}>
                                        {i < stepIndex
                                            ? <CheckCircle2 className="size-2.5" />
                                            : i === stepIndex
                                                ? <div className="size-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
                                                : null}
                                        {step}
                                    </div>
                                    {i < WORKFLOW_STEPS.length - 1 && (
                                        <ChevronRight className={cn("size-2.5 shrink-0", i < stepIndex ? "text-emerald-700" : "text-slate-800")} />
                                    )}
                                </React.Fragment>
                            ))}
                        </div>
                        <form
                            onSubmit={e => {
                                e.preventDefault();
                                if (!chat.input.trim() || chat.isLoading) return;
                                chat.append({ role: "user", content: chat.input });
                                chat.setInput("");
                            }}
                            className="flex gap-3"
                        >
                            <input
                                value={chat.input}
                                onChange={e => chat.setInput(e.target.value)}
                                disabled={!configReady && assets.length > 0}
                                placeholder={!configReady && assets.length > 0 ? "왼쪽 패널에서 모니터링 대상을 먼저 선택하세요..." : "어떤 항목을 모니터링하고 싶으신가요? 자산(대상)은 왼쪽 Config 탭에서 선택하세요."}
                                className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            {chat.isLoading ? (
                                <Button type="button" onClick={chat.stop} className="bg-red-600 hover:bg-red-500 size-12 rounded-2xl shrink-0">
                                    <Shield className="size-4 fill-white" />
                                </Button>
                            ) : (
                                <Button type="submit" disabled={!chat.input.trim() || (!configReady && assets.length > 0)} className="bg-blue-600 hover:bg-blue-500 size-12 rounded-2xl shrink-0 disabled:opacity-40">
                                    <Send className="size-5" />
                                </Button>
                            )}
                        </form>
                        <div className="mt-2 flex items-center justify-end">
                            <button
                                onClick={handleReset}
                                className="text-[10px] text-slate-600 hover:text-red-400 flex items-center gap-1 transition-colors"
                            >
                                <RotateCcw className="size-3" /> 초기화
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── RIGHT: BLUEPRINT ─────────────────────────────────────── */}
                <div className={cn(
                    "w-[360px] shrink-0 border-l border-slate-800/50 flex flex-col bg-slate-950/30 transition-opacity duration-300",
                    !configReady && assets.length > 0 && "opacity-40 pointer-events-none"
                )}>
                    {/* Blueprint Header */}
                    <div className="px-5 py-4 border-b border-slate-800/50 shrink-0">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                    <SlidersHorizontal className="size-4 text-slate-400" />
                                    Live Blueprint
                                </h3>
                                <p className="text-[10px] text-slate-600 mt-0.5">AI 자동 반영 · 직접 편집 가능</p>
                            </div>
                            {/* Status dots */}
                            <div className="flex items-center gap-1.5">
                                <div className={cn("size-2 rounded-full transition-all", blueprint.monitor ? "bg-blue-500 shadow-[0_0_6px_#3b82f6]" : "bg-slate-800")} title="Monitor" />
                                <div className={cn("size-2 rounded-full transition-all", blueprint.parser ? "bg-cyan-500 shadow-[0_0_6px_#06b6d4]" : "bg-slate-800")} title="Parser" />
                                <div className={cn("size-2 rounded-full transition-all", blueprint.threshold ? "bg-amber-500 shadow-[0_0_6px_#f59e0b]" : "bg-slate-800")} title="Threshold" />
                                <div className={cn("size-2 rounded-full transition-all", blueprint.action ? "bg-purple-500 shadow-[0_0_6px_#a855f7]" : "bg-slate-800")} title="Action" />
                            </div>
                        </div>
                    </div>

                    {/* Blueprint Sections */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar">
                        <BlueprintSection
                            title="1. 수집 (Monitor)"
                            icon={<Activity className="size-4 text-blue-400" />}
                            data={blueprint.monitor}
                            onUpdate={v => updateBlueprintSection("monitor", v)}
                            expanded={expandedSections.has("monitor")}
                            onToggle={() => toggleSection("monitor")}
                            accent="text-blue-400"
                            emptyHint="AI와 대화하면 수집 설계가 자동으로 나타납니다."
                            template={`{\n  "tool_name": "execute_host_command",\n  "args": {\n    "command": ""\n  }\n}`}
                            footer={
                                <div className="p-3 space-y-2">
                                    <button
                                        onClick={handleMonitorRun}
                                        disabled={!blueprint.monitor || monitorLoading}
                                        className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-emerald-400 border border-emerald-500/30 bg-emerald-500/5 rounded-lg hover:bg-emerald-500/15 transition-colors disabled:opacity-40"
                                    >
                                        {monitorLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                                        테스트 실행
                                    </button>
                                    {monitorLoading && (
                                        <div className="flex items-center gap-2 text-xs text-blue-400 py-1">
                                            <RefreshCw className="size-3 animate-spin" /> 실행 중...
                                        </div>
                                    )}
                                    {!monitorLoading && !!monitorResult && (
                                        <pre className="text-xs font-mono text-slate-300 bg-slate-950 rounded-lg p-2.5 overflow-x-auto max-h-40 custom-scrollbar leading-relaxed">{JSON.stringify(monitorResult, null, 2)}</pre>
                                    )}
                                </div>
                            }
                        />
                        <BlueprintSection
                            title="2. 파싱 (Parser)"
                            icon={<Filter className="size-4 text-cyan-400" />}
                            data={blueprint.parser}
                            onUpdate={v => updateBlueprintSection("parser", v)}
                            expanded={expandedSections.has("parser")}
                            onToggle={() => toggleSection("parser")}
                            accent="text-cyan-400"
                            emptyHint="Raw Output에서 변수 추출이 필요한 경우 자동으로 나타납니다."
                            template={`{\n  "variable_name": "$.path.to.value"\n}`}
                            footer={
                                <div className="p-3 space-y-2">
                                    <button
                                        onClick={handleParserRun}
                                        disabled={!blueprint.parser || !monitorResult || parserLoading}
                                        className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-cyan-400 border border-cyan-500/30 bg-cyan-500/5 rounded-lg hover:bg-cyan-500/15 transition-colors disabled:opacity-40"
                                    >
                                        {parserLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Filter className="size-3.5" />}
                                        Parser 적용
                                    </button>
                                    {!monitorResult && (
                                        <p className="text-[10px] text-slate-600 text-center">먼저 수집 테스트를 실행하세요</p>
                                    )}
                                    {parsedVars && (
                                        <div className="bg-slate-950 rounded-lg p-2.5 space-y-1.5">
                                            {Object.entries(parsedVars).map(([k, v]) => (
                                                <div key={k} className="flex items-start gap-2 text-xs">
                                                    <span className="font-mono text-cyan-400 shrink-0">{k}:</span>
                                                    <span className="font-mono text-slate-300 break-all">{String(v)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => openAiPanel("parser")}
                                        disabled={!monitorResult}
                                        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-bold text-purple-400 border border-purple-500/30 bg-purple-500/5 rounded-lg hover:bg-purple-500/15 transition-colors disabled:opacity-40"
                                    >
                                        <Brain className="size-3" /> AI에게 Parser 설계 요청
                                    </button>
                                </div>
                            }
                        />
                        <BlueprintSection
                            title="3. 임계치 (Threshold)"
                            icon={<AlertTriangle className="size-4 text-amber-400" />}
                            data={blueprint.threshold}
                            onUpdate={v => updateBlueprintSection("threshold", v)}
                            expanded={expandedSections.has("threshold")}
                            onToggle={() => toggleSection("threshold")}
                            accent="text-amber-400"
                            emptyHint="위험 감지 조건을 AI와 논의하면 자동으로 나타납니다."
                            template={`{\n  "mode": "structured",\n  "green": "정상 조건",\n  "amber": "경고 조건",\n  "red": "위험 조건"\n}`}
                            footer={
                                <div className="p-3 space-y-2">
                                    {blueprint.threshold?.mode === 'variable' && !parsedVars && !!monitorResult && (
                                        <p className="text-[10px] text-amber-500/80 text-center">variable 모드: 먼저 Parser를 실행하세요</p>
                                    )}
                                    <button
                                        onClick={handleThresholdEval}
                                        disabled={!blueprint.threshold || !monitorResult || (blueprint.threshold?.mode === 'variable' && !parsedVars)}
                                        className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-amber-400 border border-amber-500/30 bg-amber-500/5 rounded-lg hover:bg-amber-500/15 transition-colors disabled:opacity-40"
                                    >
                                        <AlertTriangle className="size-3.5" /> 임계치 평가
                                    </button>
                                    {!monitorResult && (
                                        <p className="text-[10px] text-slate-600 text-center">먼저 수집 테스트를 실행하세요</p>
                                    )}
                                    {thresholdStatus && (
                                        <div className={cn(

                                            "flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold border",
                                            thresholdStatus === "green" ? "bg-green-500/10 text-green-400 border-green-500/30" :
                                                thresholdStatus === "amber" ? "bg-amber-500/10 text-amber-400 border-amber-500/30" :
                                                    "bg-red-500/10 text-red-400 border-red-500/30"
                                        )}>
                                            {thresholdStatus === "green" ? "✓ 정상 (Green)" :
                                                thresholdStatus === "amber" ? "⚠ 검토 필요 (Amber)" :
                                                    "⛔ 경고 발생 (Red)"}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => openAiPanel("threshold")}
                                        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-bold text-purple-400 border border-purple-500/30 bg-purple-500/5 rounded-lg hover:bg-purple-500/15 transition-colors"
                                    >
                                        <Brain className="size-3" /> AI에게 Threshold 설계 요청
                                    </button>
                                </div>
                            }
                        />
                        <BlueprintSection
                            title="4. 자동 조치 (Action)"
                            icon={<Zap className="size-4 text-purple-400" />}
                            data={blueprint.action}
                            onUpdate={v => updateBlueprintSection("action", v)}
                            expanded={expandedSections.has("action")}
                            onToggle={() => toggleSection("action")}
                            accent="text-purple-400"
                            emptyHint="위험 감지 시 자동으로 수행할 조치를 설정하면 나타납니다."
                            template={`{\n  "action_tool_name": "execute_host_command",\n  "action_tool_args": {\n    "command": ""\n  }\n}`}
                            footer={
                                <div className="p-3">
                                    {blueprint.action ? (
                                        <div className="bg-slate-950 rounded-lg p-2.5 space-y-1.5">
                                            <p className="text-[10px] text-slate-500 font-semibold">threshold=red 시 자동 실행:</p>
                                            <p className="text-xs font-mono text-purple-400">{blueprint.action.action_tool_name}</p>
                                            <pre className="text-[10px] font-mono text-slate-400 leading-relaxed overflow-x-auto custom-scrollbar">{JSON.stringify(blueprint.action.action_tool_args, null, 2)}</pre>
                                        </div>
                                    ) : (
                                        <p className="text-[10px] text-slate-600 text-center py-1">조치 설정 후 내용을 확인할 수 있습니다</p>
                                    )}
                                </div>
                            }
                        />

                        {/* Template Variable Guide */}
                        {blueprint.parser !== null && blueprint.action !== null && (
                            <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/15">
                                <p className="text-[10px] font-bold text-purple-400 mb-1.5 flex items-center gap-1">
                                    <Zap className="size-3" /> Pipe Variable 연결됨
                                </p>
                                <p className="text-[10px] text-slate-500 leading-relaxed">
                                    Parser의 변수({Object.keys(blueprint.parser || {}).map(k => `{${k}}`).join(", ")})가
                                    Action에서 자동으로 치환됩니다.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="p-4 border-t border-slate-800/50 space-y-2 shrink-0">
                        <Button
                            onClick={handleSave}
                            disabled={saving || !blueprint.monitor || (assets.length > 0 && selectedAssets.length === 0)}
                            className="w-full bg-blue-600 hover:bg-blue-500 font-bold gap-2 shadow-lg shadow-blue-900/40 disabled:opacity-40"
                        >
                            {saving ? <Loader2 className="size-4 animate-spin" /> : saved ? <CheckCircle2 className="size-4" /> : <Save className="size-4" />}
                            {saved ? "저장 완료!" : "Save as Monitoring Job"}
                        </Button>
                        {!blueprint.monitor ? (
                            <p className="text-[10px] text-slate-600 text-center">AI와 대화하여 수집 설계를 완성하면 저장 가능</p>
                        ) : (assets.length > 0 && selectedAssets.length === 0) ? (
                            <p className="text-[10px] text-amber-500 font-bold text-center animate-pulse">
                                ⚠ 왼쪽 Config에서 실행 대상(자산)을 선택하세요
                            </p>
                        ) : null}
                    </div>
                </div>

            </div>
        </div>
    );
}
