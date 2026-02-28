"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    MessageSquare,
    Bot,
    Settings,
    ShieldAlert,
    Terminal as TerminalIcon,
    ChevronUp,
    Globe,
    Cpu,
    Check,
    Activity,
    PanelLeftClose,
    PanelLeftOpen,
    Loader2,
    KeyRound,
    Rocket,
    ShieldCheck,
    Bug,
    Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportBugModal } from "@/components/ReportBugModal";

const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: MessageSquare, label: "Ops Chat", href: "/ops" },
    { icon: Bot, label: "Builder Chat", href: "/builder" },
    { icon: Activity, label: "Monitoring", href: "/monitoring" },
    { icon: Rocket, label: "No-Ansible", href: "/no-ansible" },
    { icon: ShieldCheck, label: "Audit", href: "/audit" },
    { icon: TerminalIcon, label: "Terminal", href: "/terminal" },
    { icon: Settings, label: "Settings", href: "/settings" },
];

export function Sidebar() {
    const pathname = usePathname();
    const [config, setConfig] = useState<{
        llmProvider: string;
        llmModel: string;
        llmConfigs?: Record<string, unknown>;
    } | null>(null);
    const [showSwitcher, setShowSwitcher] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

    const [dynamicProviders, setDynamicProviders] = useState<{ id: string, name: string, models: string[], hasApiKey?: boolean }[]>([]);
    const [mounted, setMounted] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [configFailed, setConfigFailed] = useState(false);
    const [showReport, setShowReport] = useState(false);
    const [capturedScreenshot, setCapturedScreenshot] = useState<string | null>(null);
    const [capturing, setCapturing] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [userTimezone, setUserTimezone] = useState("UTC");

    // Update time every minute
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);

        // Load initial timezone
        const savedTz = localStorage.getItem("prism-timezone") || "UTC";
        setUserTimezone(savedTz);

        // Listen for timezone changes from Settings page
        const handleTzUpdate = () => {
            const updatedTz = localStorage.getItem("prism-timezone") || "UTC";
            setUserTimezone(updatedTz);
        };
        window.addEventListener("config-updated", handleTzUpdate);

        return () => {
            clearInterval(timer);
            window.removeEventListener("config-updated", handleTzUpdate);
        };
    }, []);

    const formatDate = (date: Date, tz: string) => {
        return new Intl.DateTimeFormat("ko-KR", {
            timeZone: tz,
            month: "2-digit",
            day: "2-digit",
            weekday: "short",
        }).format(date);
    };

    const formatTime = (date: Date, tz: string) => {
        return new Intl.DateTimeFormat("ko-KR", {
            timeZone: tz,
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        }).format(date);
    };

    const handleReportBug = async () => {
        setCapturing(true);
        try {
            const { toPng } = await import("html-to-image");
            const dataUrl = await toPng(document.documentElement, {
                quality: 0.85,
                backgroundColor: "#0a0c12",
                width: window.innerWidth,
                height: window.innerHeight,
            });
            setCapturedScreenshot(dataUrl);
        } catch (err) {
            console.error("[ReportBug] 캡처 실패:", err);
            setCapturedScreenshot(null);
        } finally {
            setCapturing(false);
            setShowReport(true);
        }
    };

    useEffect(() => {
        setMounted(true);

        function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeoutMs);
            return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(id));
        }

        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        async function fetchConfig(attempt = 0) {
            try {
                const res = await fetchWithTimeout("/api/onboarding/status");
                if (res.ok) {
                    const data = await res.json();
                    if (data.config) {
                        setConfig(data.config);
                        setConfigFailed(false);
                    } else if (attempt < 1) {
                        retryTimer = setTimeout(() => fetchConfig(attempt + 1), 8000);
                    } else {
                        setConfigFailed(true);
                    }
                } else if (attempt < 1) {
                    retryTimer = setTimeout(() => fetchConfig(attempt + 1), 8000);
                } else {
                    setConfigFailed(true);
                }
            } catch (err) {
                console.error("Failed to fetch config:", err);
                if (attempt < 1) {
                    retryTimer = setTimeout(() => fetchConfig(attempt + 1), 8000);
                } else {
                    setConfigFailed(true);
                }
            }
        }

        async function fetchProviders() {
            try {
                const res = await fetchWithTimeout("/api/llm/providers");
                if (res.ok) {
                    const data = await res.json();
                    if (data.providers) {
                        setDynamicProviders(data.providers);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch LLM providers:", error);
            }
        }

        const handleRefresh = () => {
            fetchConfig();
            fetchProviders();
        };

        window.addEventListener("config-updated", handleRefresh);

        fetchConfig();
        fetchProviders();

        return () => {
            if (retryTimer) clearTimeout(retryTimer);
            window.removeEventListener("config-updated", handleRefresh);
        };
    }, []);

    const updateProvider = async (provider: string, model: string) => {
        setIsUpdating(true);
        try {
            const res = await fetch("/api/config/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider, model })
            });
            if (res.ok) {
                setConfig({ ...config, llmProvider: provider, llmModel: model, llmConfigs: config?.llmConfigs } as any);
                setShowSwitcher(false);
                setSelectedProvider(null);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <>
            <aside className={cn(
                "border-r border-slate-800/50 bg-slate-950/50 backdrop-blur-xl flex flex-col h-screen shrink-0 transition-all duration-300 ease-in-out relative z-40",
                isCollapsed ? "w-16" : "w-64"
            )}>
                {/* Toggle Button */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="absolute -right-4 top-8 size-8 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 shadow-[0_0_15px_rgba(0,0,0,0.5)] z-50 transition-all hover:scale-110 active:scale-95 group"
                >
                    {isCollapsed ? <PanelLeftOpen className="size-4 group-hover:text-blue-400" /> : <PanelLeftClose className="size-4 group-hover:text-blue-400" />}
                </button>

                <div className={cn("p-6 flex items-center gap-3", isCollapsed && "justify-center p-4")}>
                    <div className="size-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden bg-slate-900 border border-slate-700 shadow-lg shadow-blue-500/10">
                        <Image src="/prism-logo.png" alt="PRISM Logo" width={48} height={48} className="object-cover" />
                    </div>
                    {!isCollapsed && (
                        <div className="flex flex-col">
                            <h1 className="text-lg leading-tight font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-white truncate">
                                PRISM
                            </h1>
                            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                                AI Defender
                            </p>
                        </div>
                    )}
                </div>

                <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto overflow-x-hidden custom-scrollbar">
                    {menuItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                title={isCollapsed ? item.label : ""}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all group",
                                    isActive
                                        ? "bg-blue-600/10 text-blue-400 shadow-inner"
                                        : "text-slate-400 hover:text-white hover:bg-slate-800/50",
                                    isCollapsed && "p-0 size-10 items-center justify-center mx-auto"
                                )}
                            >
                                <item.icon className={cn(
                                    "size-5 transition-transform group-hover:scale-110 shrink-0",
                                    isActive ? "text-blue-500" : "text-slate-500 group-hover:text-slate-300"
                                )} />
                                {!isCollapsed && <span className="truncate">{item.label}</span>}
                                {isActive && !isCollapsed && (
                                    <div className="ml-auto size-1.5 rounded-full bg-blue-500 shadow-lg shadow-blue-500/50" />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className={cn("p-4 border-t border-slate-800/50 space-y-4", isCollapsed && "p-2")}>
                    {/* Digital Clocks */}
                    {!isCollapsed && (
                        <div className="px-1 space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-500">
                            <div className="flex items-center justify-between text-[9px] font-bold tracking-widest text-slate-500 uppercase px-1">
                                <span className="flex items-center gap-1.5">
                                    <Clock className="size-3 text-blue-500" />
                                    <span>Realtime Clock</span>
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {/* KST Clock */}
                                <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/50 flex flex-col items-center justify-center gap-1 hover:border-blue-500/30 transition-all group overflow-hidden">
                                    <span className="text-[9px] text-slate-500 font-bold tracking-tighter uppercase whitespace-nowrap">KST (Seoul)</span>
                                    <div className="flex flex-col items-center leading-none">
                                        <span className="text-[10px] text-slate-400 font-medium mb-0.5">
                                            {mounted ? formatDate(currentTime, "Asia/Seoul") : "--/--"}
                                        </span>
                                        <span className="text-[13px] font-black text-blue-400 font-mono tracking-tighter tabular-nums">
                                            {mounted ? formatTime(currentTime, "Asia/Seoul") : "--:--"}
                                        </span>
                                    </div>
                                </div>

                                {/* User Selected Timezone Clock */}
                                <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/50 flex flex-col items-center justify-center gap-1 hover:border-purple-500/30 transition-all group overflow-hidden">
                                    <span className="text-[9px] text-slate-500 font-bold tracking-tighter uppercase whitespace-nowrap truncate w-full text-center" title={userTimezone}>
                                        {userTimezone.split("/").pop()?.replace("_", " ") || "UTC"}
                                    </span>
                                    <div className="flex flex-col items-center leading-none">
                                        <span className="text-[10px] text-slate-400 font-medium mb-0.5">
                                            {mounted ? formatDate(currentTime, userTimezone) : "--/--"}
                                        </span>
                                        <span className="text-[13px] font-black text-purple-400 font-mono tracking-tighter tabular-nums">
                                            {mounted ? formatTime(currentTime, userTimezone) : "--:--"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* LLM Switcher */}
                    <div className="relative">
                        <button
                            onClick={() => {
                                setShowSwitcher(!showSwitcher);
                                setSelectedProvider(null);
                            }}
                            className={cn(
                                "w-full rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-all flex items-center gap-3 text-left group overflow-hidden",
                                isCollapsed ? "p-2 justify-center" : "p-3"
                            )}
                            title={isCollapsed ? "Model Settings" : ""}
                        >
                            <div className="size-8 rounded-lg bg-blue-600/20 flex items-center justify-center shrink-0">
                                <Cpu className="size-4 text-blue-400" />
                            </div>
                            {!isCollapsed && (
                                <>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Active Model</p>
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-xs font-medium text-slate-200 truncate">
                                                {mounted && config
                                                    ? `${config.llmProvider} / ${config.llmModel}`
                                                    : configFailed
                                                        ? "Unavailable"
                                                        : "Loading..."}
                                            </p>
                                            {isUpdating && <Loader2 className="size-3 text-blue-500 animate-spin" />}
                                        </div>
                                    </div>
                                    <ChevronUp className={cn("size-4 text-slate-500 transition-transform", showSwitcher && "rotate-180")} />
                                </>
                            )}
                        </button>

                        {showSwitcher && (
                            <div className={cn(
                                "absolute bottom-full mb-2 p-2 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl animate-in fade-in slide-in-from-bottom-2 flex-col",
                                isCollapsed ? "left-full ml-4 w-60" : "left-0 w-full"
                            )}>
                                {!selectedProvider ? (
                                    // Step 1: Provider Selection
                                    <div>
                                        <div className="px-2 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">
                                            Select Provider
                                        </div>
                                        {dynamicProviders.map((p) => {
                                            const isEnabled = p.hasApiKey !== false;
                                            const hasValidModels = isEnabled && p.models && p.models.length > 0;
                                            return (
                                                <button
                                                    key={p.id}
                                                    disabled={!hasValidModels}
                                                    onClick={() => hasValidModels && setSelectedProvider(p.id)}
                                                    className={cn(
                                                        "w-full px-2 py-2 text-xs rounded-lg flex items-center justify-between transition-colors",
                                                        hasValidModels
                                                            ? "text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
                                                            : "text-slate-600 cursor-not-allowed opacity-50",
                                                        config?.llmProvider === p.id && hasValidModels && "bg-slate-800/50 text-blue-400 font-semibold"
                                                    )}
                                                    title={!isEnabled ? "API Key not configured — go to Settings" : !hasValidModels ? "No models available" : ""}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Globe className="size-3" />
                                                        {p.name}
                                                    </div>
                                                    {!isEnabled ? (
                                                        <KeyRound className="size-3 text-slate-600" />
                                                    ) : (
                                                        <ChevronUp className="size-3 rotate-90" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    // Step 2: Model Selection
                                    <div>
                                        <div className="flex items-center gap-2 px-1 mb-2">
                                            <button
                                                onClick={() => setSelectedProvider(null)}
                                                className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white"
                                            >
                                                <ChevronUp className="size-3 -rotate-90" />
                                            </button>
                                            <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                                                {dynamicProviders.find(p => p.id === selectedProvider)?.name} Models
                                            </div>
                                        </div>
                                        {dynamicProviders.find(p => p.id === selectedProvider)?.models.map((m) => (
                                            <button
                                                key={m}
                                                disabled={isUpdating}
                                                onClick={() => updateProvider(selectedProvider, m)}
                                                className={cn(
                                                    "w-full px-2 py-1.5 text-xs rounded-lg flex items-center justify-between transition-colors",
                                                    config?.llmProvider === selectedProvider && config?.llmModel === m
                                                        ? "bg-blue-600/20 text-blue-400"
                                                        : "text-slate-400 hover:bg-slate-800 hover:text-white",
                                                    isUpdating && "opacity-50 cursor-not-allowed"
                                                )}
                                            >
                                                <span className="truncate">{m}</span>
                                                {isUpdating && config?.llmProvider === selectedProvider && config?.llmModel === m ? (
                                                    <Loader2 className="size-3 animate-spin" />
                                                ) : (
                                                    config?.llmProvider === selectedProvider && config?.llmModel === m && <Check className="size-3 shrink-0 ml-2" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Bug report button */}
                    <button
                        onClick={handleReportBug}
                        disabled={capturing}
                        title="오류 제보하기"
                        className={cn(
                            "w-full flex items-center gap-3 rounded-xl border border-slate-700/50 hover:border-red-500/30 bg-slate-900/30 hover:bg-red-500/5 transition-all text-slate-500 hover:text-red-400",
                            isCollapsed ? "p-2 justify-center" : "px-3 py-2.5",
                            capturing && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        {capturing
                            ? <Loader2 className="size-4 animate-spin shrink-0" />
                            : <Bug className="size-4 shrink-0" />
                        }
                        {!isCollapsed && (
                            <span className="text-[11px] font-medium">
                                {capturing ? "캡처 중..." : "오류 제보하기"}
                            </span>
                        )}
                    </button>

                    <div className="text-center pb-2">
                        <p className="text-[10px] uppercase font-mono tracking-widest text-slate-500">v0.1</p>
                    </div>
                </div>
            </aside>

            {showReport && (
                <ReportBugModal
                    screenshot={capturedScreenshot}
                    currentPage={pathname}
                    onClose={() => { setShowReport(false); setCapturedScreenshot(null); }}
                />
            )}
        </>
    );
}
