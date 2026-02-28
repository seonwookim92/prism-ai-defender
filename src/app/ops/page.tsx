"use client";

import React, { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, User, Send, Terminal, Loader2, ChevronDown, ChevronRight, Wrench, Sparkles, Square, Server, MessageSquare, Layers, X, ArrowLeft, Database, Brain, RotateCcw, Paperclip, FileText, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownText } from "@/components/MarkdownText";

// Sub-component: auto-executes a command and shows result
function ToolCallRenderer({ jsonStr }: { jsonStr: string }) {
    const [isOpen, setIsOpen] = React.useState(false);
    let data: Record<string, unknown> = {};
    try {
        data = JSON.parse(jsonStr);
    } catch {
        return null; // Silently skip malformed blocks (can happen mid-stream)
    }

    const toolName = (data.tool || data.tool_name || "unknown_tool") as string;
    const args = (data.args || {}) as Record<string, unknown>;

    // Unwrap JSON-RPC envelope that Wazuh/Falcon MCP servers return
    const rawResult = (data.result || {}) as Record<string, unknown>;
    let result: Record<string, unknown> = rawResult;
    let isError = false;
    let errorMessage = "";
    if (rawResult.jsonrpc !== undefined) {
        if (rawResult.error) {
            isError = true;
            const err = rawResult.error as Record<string, unknown>;
            errorMessage = String(err.message || JSON.stringify(rawResult.error));
            result = {};
        } else if (rawResult.result) {
            result = rawResult.result as Record<string, unknown>;
            if (result.isError) isError = true;
        }
    } else if (rawResult.isError) {
        isError = true;
    }

    // Extract displayable text from the MCP result
    let displayResult = errorMessage;
    if (!displayResult) {
        if (typeof result === "string") {
            displayResult = result;
        } else if (result.content && Array.isArray(result.content)) {
            displayResult = (result.content as Array<Record<string, unknown>>).map((c) => {
                return (c.text as string) || JSON.stringify(c);
            }).join("\n");
        } else if (result.stdout !== undefined || result.stderr !== undefined) {
            displayResult = [result.stdout, result.stderr].filter(Boolean).join("\n");
        } else if (result.message) {
            displayResult = String(result.message);
        } else {
            displayResult = JSON.stringify(result, null, 2);
        }
    }

    const borderColor = isError ? "border-red-500/30 bg-red-500/5 hover:border-red-500/50" : "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50";
    const iconBg = isError ? "bg-red-500/20" : "bg-emerald-500/20";
    const iconColor = isError ? "text-red-400" : "text-emerald-400";
    const labelColor = isError ? "text-red-500/60" : "text-emerald-500/60";
    const badgeBg = isError ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400";
    const chevronColor = isError ? "text-red-500/50" : "text-emerald-500/50";

    return (
        <div className={cn("my-4 border rounded-2xl overflow-hidden shadow-sm transition-all", borderColor)}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors text-xs font-mono group"
            >
                <div className="flex items-center gap-3">
                    <div className={cn("size-8 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform", iconBg)}>
                        <Wrench className={cn("size-4", iconColor)} />
                    </div>
                    <div className="text-left">
                        <p className={cn("text-[10px] uppercase font-bold tracking-widest", labelColor)}>Tool Result</p>
                        <p className={cn("font-bold", iconColor)}>{toolName}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold", badgeBg)}>
                        {isError ? "ERROR" : "SUCCESS"}
                    </span>
                    <ChevronDown className={cn("size-4 transition-transform duration-300", chevronColor, isOpen ? "rotate-180" : "")} />
                </div>
            </button>
            {isOpen && (
                <div className="p-5 border-t border-white/5 space-y-4 bg-slate-950/40 animate-in slide-in-from-top-2 duration-300">
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <Sparkles className="size-3 text-emerald-500/70" />
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Arguments</span>
                        </div>
                        <pre className="p-3 bg-slate-900/80 text-emerald-300/90 rounded-xl overflow-x-auto border border-emerald-500/10 text-[11px] font-mono custom-scrollbar whitespace-pre-wrap">
                            {JSON.stringify(args, null, 2)}
                        </pre>
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <Terminal className="size-3 text-slate-500/70" />
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Output</span>
                        </div>
                        <pre className="p-3 bg-slate-950 text-slate-300 rounded-xl overflow-x-auto border border-white/5 text-[11px] font-mono custom-scrollbar max-h-96 whitespace-pre-wrap">
                            {displayResult || "(no output)"}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}

function MessageRenderer({ content, isLoading }: { content: string; isLoading?: boolean }) {
    const [isThoughtOpen, setIsThoughtOpen] = React.useState(false);

    const renderContent = (text: string) => {
        // Detect MCP_TOOL_CALL blocks
        const toolCallRegex = /\[MCP_TOOL_CALL\]([\s\S]*?)\[\/MCP_TOOL_CALL\]/g;
        const parts: (string | { type: 'tool_call', content: string })[] = [];
        let lastIndex = 0;
        let match;

        while ((match = toolCallRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push(text.slice(lastIndex, match.index));
            }
            parts.push({ type: 'tool_call', content: match[1] });
            lastIndex = toolCallRegex.lastIndex;
        }
        if (lastIndex < text.length) {
            parts.push(text.slice(lastIndex));
        }

        return parts.map((part, index) => {
            if (typeof part === 'object' && part.type === 'tool_call') {
                return <ToolCallRenderer key={index} jsonStr={part.content} />;
            }

            const textPart = part as string;
            const subParts = textPart.split(/(```[\s\S]*?```)/g);
            return subParts.map((subPart: string, subIndex: number) => {
                if (subPart.startsWith("```") && subPart.endsWith("```")) {
                    const lines = subPart.slice(3, -3).trim().split('\n');
                    const lang = lines[0].trim();
                    const code = lines.length > 1 ? lines.slice(1).join('\n') : lang;
                    const hasLang = lines.length > 1 && lang.length > 0 && !lang.includes(' ');

                    return (
                        <div key={`${index}-${subIndex}`} className="my-3 bg-slate-950 border border-slate-700/50 rounded-xl overflow-hidden shadow-sm">
                            {hasLang && (
                                <div className="bg-slate-800/80 px-4 py-2 border-b border-slate-700/50 flex items-center">
                                    <span className="text-[10px] uppercase tracking-widest text-blue-400 font-bold">{lang}</span>
                                </div>
                            )}
                            <div className="p-4 overflow-x-auto custom-scrollbar">
                                <pre className="text-xs font-mono text-slate-300 leading-relaxed">
                                    <code>{hasLang ? code : (lines.length > 1 ? lines.join('\n') : lang)}</code>
                                </pre>
                            </div>
                        </div>
                    );
                }
                return <MarkdownText key={`${index}-${subIndex}`} text={subPart} />;
            });
        });
    };

    // Try to parse inline tool call JSON from LLM body (for display cleaning)
    let inlineToolCall: Record<string, unknown> | null = null;
    try {
        const cleanContent = content
            .replace(/\[THOUGHT\][\s\S]*?\[\/THOUGHT\]/g, "")
            .replace(/\[MCP_TOOL_CALL\][\s\S]*?\[\/MCP_TOOL_CALL\]/g, "")
            .replace(/\[SYSTEM\].*?\n/g, "");

        let depth = 0, start = -1;
        for (let i = 0; i < cleanContent.length; i++) {
            if (cleanContent[i] === "{") { if (depth === 0) start = i; depth++; }
            else if (cleanContent[i] === "}") {
                depth--;
                if (depth === 0 && start !== -1) {
                    const candidate = cleanContent.slice(start, i + 1);
                    try { const parsed = JSON.parse(candidate); if (parsed.tool || parsed.tool_name) { inlineToolCall = parsed; } } catch { /* ignore */ }
                    start = -1;
                }
            }
        }
    } catch { /* ignore */ }

    let displayContent = content.replace(/\[SYSTEM\][\s\S]*?\n/g, "");

    // Shorten [FILE_UPLOAD] blocks for UI display
    displayContent = displayContent.replace(/\[FILE_UPLOAD: (.*?)\][\s\S]*?(\n\n|$)/g, (match, filename) => {
        return `> 📎 **파일 업로드됨: ${filename}**\n\n`;
    });

    const thoughts: string[] = [];

    displayContent = displayContent.replace(/\[THOUGHT\]([\s\S]*?)\[\/THOUGHT\]/g, (match, p1) => {
        if (p1.trim()) thoughts.push(p1.trim());
        return "";
    }).trim();

    if (isLoading && displayContent.includes("[THOUGHT]")) {
        const parts = displayContent.split("[THOUGHT]");
        const lastPart = parts.pop();
        if (lastPart !== undefined) thoughts.push(lastPart.trim());
        displayContent = parts.join("").trim();
    }

    const thoughtText = thoughts.join("\n\n");

    // Clean up displayed text
    let finalText = displayContent;
    if (inlineToolCall) {
        finalText = finalText.replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/g, "");

        // Temporarily replace MCP blocks with placeholders so the depth-tracker
        // doesn't accidentally eat the JSON payload inside [MCP_TOOL_CALL] tags.
        const mcpBlocks: string[] = [];
        finalText = finalText.replace(/\[MCP_TOOL_CALL\][\s\S]*?\[\/MCP_TOOL_CALL\]/g, (m) => {
            mcpBlocks.push(m);
            return `\x00MCP${mcpBlocks.length - 1}\x00`;
        });

        let depth2 = 0, start2 = -1;
        const arr2 = finalText.split("");
        for (let i = 0; i < arr2.length; i++) {
            if (arr2[i] === "{") { if (depth2 === 0) start2 = i; depth2++; }
            else if (arr2[i] === "}") {
                depth2--;
                if (depth2 === 0 && start2 !== -1) {
                    const block = finalText.slice(start2, i + 1);
                    try { JSON.parse(block); finalText = finalText.slice(0, start2) + finalText.slice(i + 1); break; } catch { /* ignore */ }
                }
            }
        }

        // Restore MCP blocks
        mcpBlocks.forEach((block, i) => {
            finalText = finalText.replace(`\x00MCP${i}\x00`, block);
        });

        finalText = finalText.replace(/^```[\w]*$/gm, "").trim();
        const responseField = String(inlineToolCall.response ?? "");
        if (responseField && !finalText.includes(responseField)) {
            finalText = responseField + (finalText ? "\n" + finalText : "");
        }
    }

    return (
        <div className="space-y-2">
            {thoughtText && (
                <div className="mb-2">
                    <button
                        onClick={() => setIsThoughtOpen(!isThoughtOpen)}
                        className="flex items-center gap-2 text-[11px] text-slate-500 hover:text-blue-400 transition-colors font-bold uppercase tracking-wider mb-2"
                    >
                        <Sparkles className="size-3.5 text-blue-500" />
                        Show thinking
                        <ChevronDown className={cn("size-3.5 transition-transform duration-200", isThoughtOpen ? "rotate-180" : "")} />
                    </button>
                    {isThoughtOpen && (
                        <div className="pl-3 border-l border-slate-700/50 py-1 mb-4">
                            <p className="text-xs text-slate-500 italic whitespace-pre-wrap leading-relaxed">
                                {thoughtText}
                            </p>
                        </div>
                    )}
                </div>
            )}
            <div className="leading-relaxed text-[13px] text-slate-200">
                {finalText ? renderContent(finalText.trim()) : (isLoading && (
                    <div className="space-y-2 py-2">
                        <div className="h-3 bg-slate-800/50 rounded w-3/4 animate-pulse" />
                        <div className="h-3 bg-slate-800/50 rounded w-1/2 animate-pulse" />
                    </div>
                ))}
            </div>
        </div>
    );
}


const TEMPLATES = [
    {
        id: "agent_health",
        name: "에이전트 헬스체크",
        description: "대상 단말의 현재 상태를 즉시 확인합니다.",
        prompt: "Check the health status of agent {agent_id}. Respond with a summary of its connection status and last keep-alive time.",
        fields: [{ id: "agent_id", label: "Agent ID", placeholder: "e.g. 001", type: "text" }]
    },
    {
        id: "vuln_scan",
        name: "취약점 스캔",
        description: "단말의 긴급 취약점 리스트를 조회합니다.",
        prompt: "List the top critical vulnerabilities for agent {agent_id}. If no agent is specified, show general high-severity vulnerabilities.",
        fields: [{ id: "agent_id", label: "Agent ID (Optional)", placeholder: "e.g. 002", type: "text" }]
    },
    {
        id: "failed_logins",
        name: "로그인 실패 분석",
        description: "최근 발생한 무단 로그인 시도를 추적합니다.",
        prompt: "Show me all SSH login failures in the last {minutes} minutes for {agent_id}.",
        fields: [
            { id: "minutes", label: "조회 범위(분)", placeholder: "10", type: "number" },
            { id: "agent_id", label: "Agent ID (Optional)", placeholder: "all", type: "text" }
        ]
    }
];

export default function OpsChatPage() {
    const { messages, input, setInput, handleInputChange, handleSubmit, isLoading, stop, setMessages, append } = useChat({
        api: "/api/chat",
    });

    const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const [showTemplates, setShowTemplates] = React.useState(false);
    const [selectedTemplate, setSelectedTemplate] = React.useState<typeof TEMPLATES[0] | null>(null);
    const [templateData, setTemplateData] = React.useState<Record<string, string>>({});
    const [assets, setAssets] = React.useState<{ name: string; ip: string }[]>([]);
    const [mcpTools, setMcpTools] = React.useState<any[]>([]);
    const [mcpExplorerOpen, setMcpExplorerOpen] = React.useState(false);
    const [mcpExplorerProvider, setMcpExplorerProvider] = React.useState("");
    const [mcpExplorerSelectedTool, setMcpExplorerSelectedTool] = React.useState<any | null>(null);
    const [toolFilter, setToolFilter] = React.useState("");

    // Auto-scroll ref
    const messagesEndRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isLoading]);

    React.useEffect(() => {
        async function fetchAssets() {
            try {
                const res = await fetch("/api/onboarding/status");
                const data = await res.json();
                if (data.config && data.config.assets) {
                    setAssets(data.config.assets);
                }
            } catch (error) {
                console.error("Failed to fetch assets", error);
            }
        }
        fetchAssets();
        fetch("/api/mcp/tools").then(r => r.json()).then(data => {
            if (data.tools) setMcpTools(data.tools);
        }).catch(() => { });
    }, []);

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

    const handleTemplateSelect = (template: typeof TEMPLATES[0]) => {
        setSelectedTemplate(template);
        setShowTemplates(false);
        setTemplateData({});
    };

    const handleTemplateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTemplate) return;

        let finalPrompt = selectedTemplate.prompt;
        Object.entries(templateData).forEach(([key, val]) => {
            finalPrompt = finalPrompt.replace(`{${key}}`, val || "default");
        });

        setInput(finalPrompt);
        setTimeout(() => {
            handleSubmit();
            setSelectedTemplate(null);
            setTemplateData({});
        }, 10);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target?.result as string;
                setAttachedFile({ name: file.name, content: text });
            };
            reader.readAsText(file);
        }
        // Reset input so the same file can be selected again
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleReset = () => {
        if (window.confirm("대화 내역을 초기화하시겠습니까?")) {
            setMessages([]);
            setAttachedFile(null);
        }
    };

    const onFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() && !attachedFile) return;

        let finalPrompt = input;
        if (attachedFile) {
            finalPrompt = `[FILE_UPLOAD: ${attachedFile.name}]\n${attachedFile.content}\n\n${input}`;
        }

        // Use append to send the message and reset state
        append({ role: "user", content: finalPrompt });
        setInput("");
        setAttachedFile(null);
    };

    return (
        <div className="flex h-screen w-full animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden font-sans">
            <div className="flex-1 flex flex-col relative border-r border-slate-800/50">
                <header className="px-8 py-5 border-b border-slate-800/50 bg-slate-950/50 backdrop-blur-md flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="size-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                            <MessageSquare className="size-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold tracking-tight text-white">Ops Chat</h2>
                            <p className="text-xs text-slate-500">Security operation center collaboration</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors text-xs font-semibold"
                            title="Reset Chat"
                        >
                            <RotateCcw className="size-3.5" /> Reset
                        </button>
                        <button
                            onClick={openMcpExplorer}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-xs font-semibold"
                        >
                            <Layers className="size-3.5" /> MCP Tools
                        </button>
                    </div>
                </header>

                {/* MCP Explorer Drawer */}
                {mcpExplorerOpen && (
                    <div className="absolute inset-0 z-50 flex flex-col bg-slate-950 animate-in slide-in-from-right duration-200">
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

                        {mcpExplorerSelectedTool ? (
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
                                            setInput(`${mcpExplorerSelectedTool.name} 도구를 사용해서 분석해줘.`);
                                            setMcpExplorerOpen(false);
                                        }}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-blue-400 border border-blue-500/30 bg-blue-500/10 rounded-xl hover:bg-blue-500/20 transition-colors"
                                    >
                                        <Brain className="size-4" /> 이 도구로 질문하기
                                    </button>
                                </div>
                            </div>
                        ) : (
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
                                                            {Object.keys(tool.inputSchema.properties).slice(0, 4).map((arg: string) => (
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

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 scroll-smooth custom-scrollbar flex flex-col">
                    <div className="space-y-6 w-full pb-4">
                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                                <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                                    <Bot className="size-12 text-blue-500" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-bold text-slate-200">How can I help you today?</h3>
                                    <p className="text-slate-500 max-w-sm">
                                        I can help you analyze security logs, detect threats, and manage your endpoint agents.
                                    </p>
                                </div>
                            </div>
                        )}

                        {messages.map((m) => (
                            <div
                                key={m.id}
                                className={cn(
                                    "flex gap-4",
                                    m.role === "user" ? "flex-row-reverse" : "flex-row"
                                )}
                            >
                                <div className={cn(
                                    "size-10 shrink-0 rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-105",
                                    m.role === "user"
                                        ? "bg-slate-800 border border-slate-700 mt-1"
                                        : "bg-blue-600 shadow-blue-500/20 mt-1"
                                )}>
                                    {m.role === "user" ? (
                                        <User className="size-5 text-slate-300" />
                                    ) : (
                                        <Bot className="size-5 text-white" />
                                    )}
                                </div>
                                <div
                                    className={cn(
                                        "max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm",
                                        m.role === "user"
                                            ? "bg-slate-800 text-slate-100 rounded-tr-none border border-slate-700/50"
                                            : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none"
                                    )}
                                >
                                    <MessageRenderer
                                        content={m.content}
                                        isLoading={isLoading && m.id === messages[messages.length - 1]?.id}
                                    />
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex gap-4 items-center">
                                <div className="size-10 shrink-0 rounded-2xl flex items-center justify-center bg-blue-600 shadow-lg shadow-blue-500/20">
                                    <Loader2 className="size-5 text-white animate-spin" />
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
                        <div ref={messagesEndRef} className="h-4" />
                    </div>
                </div>

                {/* Template Selection Overlay */}
                {showTemplates && (
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-20 flex items-center justify-center p-6 animate-in fade-in duration-200">
                        <Card className="w-full max-w-lg bg-slate-900 border-slate-800 shadow-2xl">
                            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                                <h3 className="font-bold flex items-center gap-2">
                                    <Wrench className="size-4 text-blue-500" />
                                    Expert Templates
                                </h3>
                                <Button variant="ghost" size="sm" onClick={() => setShowTemplates(false)}>Close</Button>
                            </div>
                            <ScrollArea className="max-h-[60vh]">
                                <div className="p-4 space-y-3">
                                    {TEMPLATES.map(t => (
                                        <button
                                            key={t.id}
                                            onClick={() => handleTemplateSelect(t)}
                                            className="w-full text-left p-4 rounded-xl border border-slate-800 bg-slate-950/50 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
                                        >
                                            <p className="font-bold text-slate-200 group-hover:text-blue-400">{t.name}</p>
                                            <p className="text-xs text-slate-500 mt-1">{t.description}</p>
                                        </button>
                                    ))}
                                </div>
                            </ScrollArea>
                        </Card>
                    </div>
                )}

                {/* Template Content Form */}
                {selectedTemplate && (
                    <div className="p-6 border-t border-slate-800 bg-slate-950/90 animate-in slide-in-from-bottom-2">
                        <div className="max-w-5xl mx-auto">
                            <header className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="size-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                                        <Wrench className="size-4 text-blue-400" />
                                    </div>
                                    <h3 className="font-bold text-slate-100">{selectedTemplate.name}</h3>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => setSelectedTemplate(null)}>취소</Button>
                            </header>
                            <form onSubmit={handleTemplateSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                                {selectedTemplate.fields.map(f => (
                                    <div key={f.id} className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{f.label}</label>
                                        <Input
                                            type={f.type}
                                            placeholder={f.placeholder}
                                            value={templateData[f.id] || ""}
                                            onChange={(e) => setTemplateData({ ...templateData, [f.id]: e.target.value })}
                                            className="bg-slate-900 border-slate-800 h-10 rounded-xl"
                                        />
                                    </div>
                                ))}
                                <Button type="submit" className="bg-blue-600 hover:bg-blue-500 h-10 rounded-xl font-bold">
                                    실행하기
                                </Button>
                            </form>
                        </div>
                    </div>
                )}

                <div className="p-6 border-t border-slate-800/50 bg-slate-900/50">
                    {attachedFile && (
                        <div className="mx-4 lg:mx-8 mb-4 px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center justify-between animate-in slide-in-from-bottom-2">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <FileText className="size-4 text-blue-400 shrink-0" />
                                <span className="text-xs text-blue-300 truncate font-mono">{attachedFile.name}</span>
                                <span className="text-[10px] text-blue-500/70">({(attachedFile.content.length / 1024).toFixed(1)} KB)</span>
                            </div>
                            <button
                                onClick={() => setAttachedFile(null)}
                                className="size-6 flex items-center justify-center rounded-lg text-blue-400 hover:bg-blue-500/20 transition-colors"
                            >
                                <X className="size-4" />
                            </button>
                        </div>
                    )}
                    <form
                        onSubmit={onFormSubmit}
                        className="w-full px-4 lg:px-8 flex gap-4"
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className="hidden"
                        />
                        <div className="flex shrink-0 gap-2">
                            <Button
                                type="button"
                                onClick={() => setShowTemplates(!showTemplates)}
                                className={cn(
                                    "size-12 rounded-2xl transition-all active:scale-95 border border-slate-800",
                                    showTemplates ? "bg-blue-600 text-white" : "bg-slate-950 text-slate-400 hover:text-white"
                                )}
                            >
                                <Wrench className="size-5" />
                            </Button>
                            <Button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className={cn(
                                    "size-12 rounded-2xl transition-all active:scale-95 border border-slate-800 bg-slate-950 text-slate-400 hover:text-white",
                                    attachedFile && "text-blue-400 border-blue-500/30 bg-blue-500/5"
                                )}
                                title="Attach File"
                            >
                                <Paperclip className="size-5" />
                            </Button>
                        </div>
                        <div className="flex-1 relative group">
                            <Input
                                value={input}
                                onChange={handleInputChange}
                                placeholder={attachedFile ? `Discussing ${attachedFile.name}...` : "Type a security command or question..."}
                                className="bg-slate-950 border-slate-800 h-12 pr-12 text-slate-200 focus:ring-blue-600 transition-all rounded-2xl"
                            />
                            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity">
                                <Terminal className="size-4 text-slate-400" />
                            </div>
                        </div>
                        {isLoading ? (
                            <Button
                                type="button"
                                onClick={() => stop()}
                                className="bg-red-600 hover:bg-red-500 text-white size-12 rounded-2xl shadow-lg shadow-red-900/40 transition-all active:scale-95"
                            >
                                <Square className="size-4 fill-white" />
                            </Button>
                        ) : (
                            <Button
                                type="submit"
                                disabled={!input && !attachedFile}
                                className="bg-blue-600 hover:bg-blue-500 text-white size-12 rounded-2xl shadow-lg shadow-blue-900/40 transition-all active:scale-95 disabled:grayscale"
                            >
                                <Send className="size-5" />
                            </Button>
                        )}
                    </form>
                </div>
            </div>

            {/* Right Panel: Ops Context */}
            <div className="w-[380px] bg-slate-950/40 backdrop-blur-xl p-6 space-y-6 overflow-y-auto hidden lg:block shrink-0 custom-scrollbar">
                <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Operation Context</h3>
                    <p className="text-[10px] text-slate-600 leading-relaxed">Live system and execution state.</p>
                </div>

                <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl space-y-4 shadow-inner">
                    <div className="space-y-1 pb-3 border-b border-slate-800/50">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">LLM Engine</span>
                        <div className="flex items-center gap-2 mt-1">
                            <div className="size-2 rounded-full bg-emerald-500/80 animate-pulse" />
                            <span className="text-xs font-mono text-emerald-400">Connected & Ready</span>
                        </div>
                    </div>

                    <div className="space-y-2 pb-3 border-b border-slate-800/50">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tools Configured</span>
                            <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">3 MCP</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <div className="p-2 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between group">
                                <div className="flex items-center gap-2">
                                    <Wrench className="size-3 text-blue-500" />
                                    <span className="text-[10px] font-mono text-slate-400 group-hover:text-blue-400 transition-colors">Wazuh</span>
                                </div>
                                <div className="size-1.5 rounded-full bg-emerald-500" />
                            </div>
                            <div className="p-2 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between group">
                                <div className="flex items-center gap-2">
                                    <Wrench className="size-3 text-red-500" />
                                    <span className="text-[10px] font-mono text-slate-400 group-hover:text-red-400 transition-colors">Falcon</span>
                                </div>
                                <div className="size-1.5 rounded-full bg-emerald-500" />
                            </div>
                            <div className="p-2 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between group">
                                <div className="flex items-center gap-2">
                                    <Wrench className="size-3 text-purple-500" />
                                    <span className="text-[10px] font-mono text-slate-400 group-hover:text-purple-400 transition-colors">Velociraptor</span>
                                </div>
                                <div className="size-1.5 rounded-full bg-emerald-500" />
                            </div>
                            <div className="p-2 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between group">
                                <div className="flex items-center gap-2">
                                    <Server className="size-3 text-slate-400" />
                                    <span className="text-[10px] font-mono text-slate-400 group-hover:text-slate-200 transition-colors">SSH Exec</span>
                                </div>
                                <div className="size-1.5 rounded-full bg-emerald-500" />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Managed Assets</span>
                        <div className="bg-slate-950 border border-slate-800/80 rounded-xl overflow-hidden divide-y divide-slate-800/50 mt-1">
                            {assets.length === 0 ? (
                                <div className="p-3 text-center">
                                    <span className="text-[10px] text-slate-500">No assets loaded</span>
                                </div>
                            ) : (
                                assets.map(a => (
                                    <div key={a.ip} className="p-2.5 flex items-center justify-between hover:bg-slate-900 transition-colors">
                                        <div className="flex items-center gap-2">
                                            <div className="size-2 rounded-full bg-emerald-500/80" />
                                            <span className="text-[10px] font-bold text-slate-300">{a.name}</span>
                                        </div>
                                        <span className="text-[9px] font-mono text-slate-500">{a.ip}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Action Log</span>
                        <div className="size-2 rounded-full bg-blue-500 animate-pulse" />
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-2xl h-64 overflow-hidden relative group">
                        <div className="p-3 space-y-2 overflow-y-auto h-full text-[10px] font-mono custom-scrollbar">
                            {messages.map(m => {
                                if (m.role === 'user') {
                                    return (
                                        <div key={m.id + '-log'} className="text-slate-500">
                                            <span className="text-blue-500 mr-2">[{new Date().toLocaleTimeString()}]</span>
                                            User executed query
                                        </div>
                                    );
                                } else {
                                    return (
                                        <div key={m.id + '-log'} className="text-slate-500">
                                            <span className="text-emerald-500 mr-2">[{new Date().toLocaleTimeString()}]</span>
                                            AI generated response
                                        </div>
                                    );
                                }
                            })}
                            {messages.length === 0 && (
                                <div className="text-slate-600 italic">Waiting for activity...</div>
                            )}
                        </div>
                        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none" />
                    </div>
                </div>
            </div>
        </div >
    );
}
