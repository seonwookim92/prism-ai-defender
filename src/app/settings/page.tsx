"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Key, Cpu, Save, Loader2, CheckCircle2, Server, Plus, Trash2, Globe, Clock, Settings, Upload, AlertCircle, Zap, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface Asset {
    name: string;
    ip: string;
    port: string;
    user: string;
    pass: string;
    auth_mode: "password" | "key";
    key_id: string;
    os: "linux" | "windows";
    category?: "defense" | "security";
    sector?: string;
    [key: string]: any;
}

interface KeyEntry {
    id: string;
    name: string;
    private_key: string;
}

export default function SettingsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [timezone, setTimezone] = useState("Europe/Tallinn");
    const [editingAssetIndex, setEditingAssetIndex] = useState<number | null>(null);

    const [config, setConfig] = useState({
        llmProvider: "openai",
        llmModel: "",
        llmConfigs: {
            openai: { apiKey: "", model: "" } as { apiKey: string; model: string },
            anthropic: { apiKey: "", model: "" } as { apiKey: string; model: string },
            google: { apiKey: "", model: "" } as { apiKey: string; model: string },
            ollama: { endpoint: "http://localhost:11434", model: "" } as { endpoint: string; model: string }
        },
        assets: [] as Asset[],
        keystore: [] as KeyEntry[],
        wazuhConfig: {
            host: "localhost",
            port: 55000,
            user: "wazuh",
            pass: "",
            indexer_host: "",
            indexer_port: 9200,
            indexer_user: "",
            indexer_pass: ""
        },
        falconConfig: { client_id: "", client_secret: "", base_url: "https://api.crowdstrike.com" },
        velociraptorConfig: { api_config_path: "/config/api_client.yaml" },
        tavilyConfig: { api_key: "" },
        wazuhEnabled: true,
        falconEnabled: true,
        velociraptorEnabled: true,
        tavilyEnabled: true
    });

    const [availableProviders, setAvailableProviders] = useState<{ id: string, name: string, models: string[], hasApiKey?: boolean }[]>([]);

    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const applyData = (data: any, provData: any) => {
            // 1. Process Config
            if (data.config) {
                const mcpConfig = data.config.mcpConfig || {};
                const envHints = data.env_hints || {};
                const rawAssets: any[] = Array.isArray(data.config.assets) ? data.config.assets : [];

                // Merge helper: use DB value if non-empty, else fall back to env hint
                const mergeField = (dbVal: any, envVal: any) =>
                    (dbVal !== undefined && dbVal !== "" && dbVal !== null && dbVal !== 0) ? dbVal : envVal;

                const dbWazuh = mcpConfig.wazuh || {};
                const envWazuh = envHints.wazuh || {};
                const dbFalcon = mcpConfig.falcon || {};
                const envFalcon = envHints.falcon || {};
                const dbVelociraptor = mcpConfig.velociraptor || {};
                const envVelociraptor = envHints.velociraptor || {};
                const dbTavily = mcpConfig.tavily || {};
                const dbLlm = data.config.llmConfigs || {};
                const envLlm = envHints.llm_configs || {};

                setConfig(prev => ({
                    llmProvider: data.config.llmProvider || prev.llmProvider,
                    llmModel: data.config.llmModel || prev.llmModel,
                    llmConfigs: {
                        openai: {
                            apiKey: mergeField(dbLlm.openai?.apiKey, envLlm.openai?.apiKey) || "",
                            model: dbLlm.openai?.model || prev.llmConfigs.openai?.model || ""
                        },
                        anthropic: {
                            apiKey: mergeField(dbLlm.anthropic?.apiKey, envLlm.anthropic?.apiKey) || "",
                            model: dbLlm.anthropic?.model || prev.llmConfigs.anthropic?.model || ""
                        },
                        google: {
                            apiKey: mergeField(dbLlm.google?.apiKey, envLlm.google?.apiKey) || "",
                            model: dbLlm.google?.model || prev.llmConfigs.google?.model || ""
                        },
                        ollama: {
                            endpoint: mergeField(dbLlm.ollama?.endpoint, envLlm.ollama?.endpoint) || prev.llmConfigs.ollama?.endpoint || "http://localhost:11434",
                            model: dbLlm.ollama?.model || prev.llmConfigs.ollama?.model || ""
                        }
                    },
                    assets: rawAssets.map((a: any) => ({
                        ...a,
                        port: String(a.port || "22"),
                        auth_mode: a.auth_mode || "password",
                        key_id: a.key_id || "",
                        os: a.os || "linux"
                    })) as Asset[],
                    keystore: Array.isArray(data.config.keystore) ? data.config.keystore : prev.keystore,
                    wazuhConfig: {
                        host: mergeField(dbWazuh.host, envWazuh.host) || prev.wazuhConfig.host,
                        port: mergeField(dbWazuh.port, envWazuh.port) || prev.wazuhConfig.port,
                        user: mergeField(dbWazuh.user, envWazuh.user) || prev.wazuhConfig.user,
                        pass: mergeField(dbWazuh.pass, envWazuh.pass) ?? prev.wazuhConfig.pass,
                        indexer_host: mergeField(dbWazuh.indexer_host, envWazuh.indexer_host) ?? prev.wazuhConfig.indexer_host,
                        indexer_port: mergeField(dbWazuh.indexer_port, envWazuh.indexer_port) || prev.wazuhConfig.indexer_port,
                        indexer_user: mergeField(dbWazuh.indexer_user, envWazuh.indexer_user) ?? prev.wazuhConfig.indexer_user,
                        indexer_pass: mergeField(dbWazuh.indexer_pass, envWazuh.indexer_pass) ?? prev.wazuhConfig.indexer_pass,
                    },
                    falconConfig: {
                        client_id: mergeField(dbFalcon.client_id, envFalcon.client_id) ?? prev.falconConfig.client_id,
                        client_secret: mergeField(dbFalcon.client_secret, envFalcon.client_secret) ?? prev.falconConfig.client_secret,
                        base_url: mergeField(dbFalcon.base_url, envFalcon.base_url) || prev.falconConfig.base_url,
                    },
                    velociraptorConfig: {
                        api_config_path: mergeField(dbVelociraptor.api_config_path, envVelociraptor.api_config_path) || prev.velociraptorConfig.api_config_path,
                    },
                    tavilyConfig: {
                        api_key: dbTavily.api_key || prev.tavilyConfig.api_key,
                    },
                    wazuhEnabled: dbWazuh.enabled ?? true,
                    falconEnabled: dbFalcon.enabled ?? true,
                    velociraptorEnabled: dbVelociraptor.enabled ?? true,
                    tavilyEnabled: dbTavily.enabled ?? true
                }));
            } else if (data.env_hints) {
                // Fallback: populate from env hints (used when DB not yet ready)
                setConfig(prev => ({
                    ...prev,
                    llmProvider: data.env_hints.llm_provider || prev.llmProvider,
                    llmModel: data.env_hints.llm_configs?.[data.env_hints.llm_provider]?.model || prev.llmModel,
                    llmConfigs: {
                        ...prev.llmConfigs,
                        openai: { ...prev.llmConfigs.openai, apiKey: data.env_hints.llm_configs?.openai?.apiKey || "" },
                        anthropic: { ...prev.llmConfigs.anthropic, apiKey: data.env_hints.llm_configs?.anthropic?.apiKey || "" },
                        google: { ...prev.llmConfigs.google, apiKey: data.env_hints.llm_configs?.google?.apiKey || "" },
                        ollama: { ...prev.llmConfigs.ollama, endpoint: data.env_hints.llm_configs?.ollama?.endpoint || "http://localhost:11434" }
                    },
                    assets: data.env_hints.assets && data.env_hints.assets.length > 0
                        ? data.env_hints.assets.map((a: any) => ({
                            ...a,
                            port: String(a.port || "22"),
                            auth_mode: a.auth_mode || "password",
                            key_id: a.key_id || "",
                            os: a.os || "linux"
                        })) as Asset[]
                        : prev.assets,
                    wazuhConfig: data.env_hints.wazuh || prev.wazuhConfig,
                    falconConfig: data.env_hints.falcon || prev.falconConfig,
                    velociraptorConfig: data.env_hints.velociraptor || prev.velociraptorConfig,
                    wazuhEnabled: true,
                    falconEnabled: true,
                    velociraptorEnabled: true,
                    tavilyEnabled: true
                }));
            }

            // 2. Process Providers
            if (provData.providers) {
                setAvailableProviders(provData.providers);

                // Auto-select efficient models for each provider if not already set
                setConfig(prev => {
                    const newConfigs: any = { ...prev.llmConfigs };
                    let updated = false;

                    provData.providers.forEach((p: any) => {
                        if (p.models && p.models.length > 0) {
                            if (!newConfigs[p.id]?.model) {
                                const bestModel = p.models.find((m: string) =>
                                    m.toLowerCase().includes("mini") ||
                                    m.toLowerCase().includes("flash") ||
                                    m.toLowerCase().includes("haiku") ||
                                    m.toLowerCase().includes("lite")
                                ) || p.models[p.models.length - 1];

                                newConfigs[p.id] = {
                                    ...newConfigs[p.id],
                                    model: bestModel
                                };
                                updated = true;
                            }
                        }
                    });

                    if (updated) {
                        const activeModel = newConfigs[prev.llmProvider]?.model || prev.llmModel;
                        return { ...prev, llmConfigs: newConfigs, llmModel: activeModel };
                    }
                    return prev;
                });
            }
        };

        async function fetchInitialData(attempt = 0) {
            if (attempt === 0) setLoading(true);
            try {
                const [statusRes, provRes] = await Promise.all([
                    fetch("/api/onboarding/status"),
                    fetch("/api/llm/providers")
                ]);

                const data = await statusRes.json();
                const provData = await provRes.json();

                // If backend returned retryable error and we haven't exhausted retries
                if (!statusRes.ok && data.retryable && attempt < 3) {
                    // Only apply env_hints on very first attempt to fill form
                    if (attempt === 0) {
                        applyData(data, provData);
                    }
                    setLoading(false);
                    retryTimerRef.current = setTimeout(() => fetchInitialData(attempt + 1), 4000);
                    return;
                }

                if (statusRes.ok) {
                    applyData(data, provData);
                }
            } catch (error) {
                if (attempt < 3) {
                    setLoading(false);
                    retryTimerRef.current = setTimeout(() => fetchInitialData(attempt + 1), 4000);
                    return;
                }
                console.error("Failed to fetch initial data", error);
            } finally {
                if (attempt === 0) setLoading(false);
            }
        }

        fetchInitialData();

        // Load timezone from localStorage
        const savedTz = localStorage.getItem("prism-timezone");
        if (savedTz) setTimezone(savedTz);

        return () => {
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSave = async () => {
        // Validate for duplicate names or IPs
        const names = config.assets.map(a => a.name.trim()).filter(Boolean);
        const ips = config.assets.map(a => a.ip.trim()).filter(Boolean);
        const dupNames = names.filter((n, i) => names.indexOf(n) !== i);
        const dupIPs = ips.filter((ip, i) => ips.indexOf(ip) !== i);

        if (dupNames.length > 0 || dupIPs.length > 0) {
            const messages: string[] = [];
            if (dupNames.length > 0) messages.push(`중복된 Asset 이름: ${[...new Set(dupNames)].join(", ")}`);
            if (dupIPs.length > 0) messages.push(`중복된 IP 주소: ${[...new Set(dupIPs)].join(", ")}`);
            alert(`⚠️ Asset 중복 오류\n\n${messages.join("\n")}\n\n중복 항목을 수정한 후 다시 시도해 주세요.`);
            return;
        }

        setSaving(true);
        setSaved(false);
        try {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), 15000);
            const res = await fetch("/api/onboarding/setup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config),
                signal: controller.signal
            });
            clearTimeout(tid);
            if (res.ok) {
                setSaved(true);
                // Dispatch event to refresh sidebar
                window.dispatchEvent(new CustomEvent("config-updated"));
                setTimeout(() => setSaved(false), 3000);
            } else {
                const errData = await res.json().catch(() => ({}));
                alert(`저장 실패 (${res.status}): ${errData.error || errData.detail || res.statusText}`);
            }
        } catch (error) {
            console.error(error);
            const msg = error instanceof Error && error.name === "AbortError"
                ? "저장 요청이 시간 초과되었습니다. 백엔드 상태를 확인하세요."
                : "설정 저장에 실패했습니다.";
            alert(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleTimezoneChange = (tz: string) => {
        setTimezone(tz);
        localStorage.setItem("prism-timezone", tz);
        window.dispatchEvent(new CustomEvent("config-updated"));
    };

    const TIMEZONE_OPTIONS = [
        {
            group: "Common", zones: [
                { value: "UTC", label: "UTC (Coordinated Universal Time)" },
                { value: "Asia/Seoul", label: "Asia/Seoul (KST, UTC+9)" },
                { value: "Asia/Tokyo", label: "Asia/Tokyo (JST, UTC+9)" },
                { value: "Asia/Shanghai", label: "Asia/Shanghai (CST, UTC+8)" },
                { value: "Asia/Singapore", label: "Asia/Singapore (SGT, UTC+8)" },
            ]
        },
        {
            group: "Americas", zones: [
                { value: "America/New_York", label: "America/New_York (EST/EDT, UTC-5/-4)" },
                { value: "America/Chicago", label: "America/Chicago (CST/CDT, UTC-6/-5)" },
                { value: "America/Denver", label: "America/Denver (MST/MDT, UTC-7/-6)" },
                { value: "America/Los_Angeles", label: "America/Los_Angeles (PST/PDT, UTC-8/-7)" },
                { value: "America/Sao_Paulo", label: "America/Sao_Paulo (BRT, UTC-3)" },
            ]
        },
        {
            group: "Europe", zones: [
                { value: "Europe/London", label: "Europe/London (GMT/BST, UTC+0/+1)" },
                { value: "Europe/Berlin", label: "Europe/Berlin (CET/CEST, UTC+1/+2)" },
                { value: "Europe/Tallinn", label: "Europe/Tallinn (EET/EEST, UTC+2/+3) — Estonia" },
                { value: "Europe/Moscow", label: "Europe/Moscow (MSK, UTC+3)" },
            ]
        },
        {
            group: "Asia/Pacific", zones: [
                { value: "Asia/Kolkata", label: "Asia/Kolkata (IST, UTC+5:30)" },
                { value: "Asia/Dubai", label: "Asia/Dubai (GST, UTC+4)" },
                { value: "Australia/Sydney", label: "Australia/Sydney (AEST/AEDT, UTC+10/+11)" },
                { value: "Pacific/Auckland", label: "Pacific/Auckland (NZST/NZDT, UTC+12/+13)" },
            ]
        },
    ];

    const addAsset = () => {
        setConfig({
            ...config,
            assets: [...config.assets, {
                name: "New Server",
                ip: "",
                port: "22",
                user: "root",
                pass: "",
                auth_mode: "password",
                key_id: "",
                os: "linux",
                category: "security",
                sector: ""
            } as Asset]
        });
    };

    const removeAsset = (index: number) => {
        const newAssets = [...config.assets];
        newAssets.splice(index, 1);
        setConfig({ ...config, assets: newAssets });
    };

    const updateAsset = (index: number, field: string, value: string) => {
        const newAssets = [...config.assets];
        (newAssets[index] as any)[field] = value;
        setConfig({ ...config, assets: newAssets });
    };

    const addKey = () => {
        const newId = crypto.randomUUID();
        setConfig(prev => ({
            ...prev,
            keystore: [...prev.keystore, { id: newId, name: "New SSH Key", private_key: "" }]
        }));
    };

    const removeKey = (id: string) => {
        setConfig(prev => ({
            ...prev,
            keystore: prev.keystore.filter(k => k.id !== id)
        }));
    };

    const updateKey = (id: string, field: keyof KeyEntry, value: string) => {
        setConfig(prev => ({
            ...prev,
            keystore: prev.keystore.map(k => k.id === id ? { ...k, [field]: value } : k)
        }));
    };

    const importAssetsFromJson = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                let parsed = JSON.parse(ev.target?.result as string);
                // Support both flat array and nested array (old format)
                if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
                    parsed = parsed.flat();
                }
                if (!Array.isArray(parsed)) {
                    alert("올바른 JSON 형식이 아닙니다. 배열([ ]) 형태여야 합니다.");
                    return;
                }
                const imported: Asset[] = parsed.map((a: any) => ({
                    name: a.name || "Unknown",
                    ip: a.ip || "",
                    port: a.port?.toString() || "22",
                    user: a.user || "",
                    pass: a.pass || "",
                    auth_mode: a.auth_mode || "password",
                    key_id: a.key_id || "",
                    os: a.os || "linux"
                }));
                setConfig(prev => ({ ...prev, assets: [...prev.assets, ...imported] }));
                // Reset file input so same file can be re-imported if needed
                e.target.value = "";
            } catch {
                alert("JSON 파일 파싱에 실패했습니다. 파일 형식을 확인해 주세요.");
            }
        };
        reader.readAsText(file);
    };

    // Returns true if the provider is correctly configured
    const isProviderConfigured = (provider: string, details: any) => {
        if (provider === "ollama") return !!details.endpoint;
        const k = details.apiKey?.trim() || "";
        if (!k) return false;
        const lower = k.toLowerCase();
        if (lower.startsWith("your_") || lower.startsWith("your-")) return false;
        if (lower.startsWith("<") && lower.endsWith(">")) return false;
        if (["placeholder", "changeme", "example", "xxx", "sk-...", "none"].includes(lower)) return false;
        return true;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="size-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen w-full animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden">
            <header className="px-8 py-5 border-b border-slate-800/50 bg-slate-950/50 backdrop-blur-md flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <div className="size-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <Settings className="size-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-white">Settings</h2>
                        <p className="text-xs text-slate-500">Manage your AI providers, assets, and security tool integrations.</p>
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar">
                <div className="max-w-4xl mx-auto space-y-8">

                    <Tabs defaultValue="general" className="w-full">
                        <TabsList className="bg-slate-900 border border-slate-800 p-1 flex-wrap h-auto gap-1">
                            <TabsTrigger value="general" className="data-[state=active]:bg-blue-600">General</TabsTrigger>
                            <TabsTrigger value="llm" className="data-[state=active]:bg-blue-600">LLM Providers</TabsTrigger>
                            <TabsTrigger value="assets" className="data-[state=active]:bg-blue-600">Assets</TabsTrigger>
                            <TabsTrigger value="keystore" className="data-[state=active]:bg-blue-600">KeyStore</TabsTrigger>
                            <TabsTrigger value="tools" className="data-[state=active]:bg-blue-600">Tools</TabsTrigger>
                        </TabsList>

                        <TabsContent value="general" className="mt-6">
                            <Card className="bg-slate-900/40 border-slate-800/50 backdrop-blur-sm">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Globe className="size-5 text-blue-400" />
                                        General Settings
                                    </CardTitle>
                                    <CardDescription>Configure display timezone and general preferences.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="space-y-3">
                                        <Label className="flex items-center gap-2">
                                            <Clock className="size-4 text-slate-400" />
                                            Display Timezone
                                        </Label>
                                        <p className="text-xs text-slate-500 -mt-1">
                                            Monitoring logs will show times in this timezone alongside Korean Standard Time (KST).
                                        </p>
                                        <select
                                            value={timezone}
                                            onChange={(e) => handleTimezoneChange(e.target.value)}
                                            className="w-full h-10 rounded-md bg-slate-950 border border-slate-800 text-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                                        >
                                            {TIMEZONE_OPTIONS.map(group => (
                                                <optgroup key={group.group} label={group.group}>
                                                    {group.zones.map(tz => (
                                                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                        <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Preview</p>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-[10px] text-slate-400 mb-1">Selected Timezone</p>
                                                    <p className="text-sm font-mono text-blue-400">
                                                        {new Date().toLocaleString("en-US", { timeZone: timezone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                    </p>
                                                    <p className="text-[10px] text-slate-600 mt-0.5">{timezone}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-slate-400 mb-1">Korean Standard Time</p>
                                                    <p className="text-sm font-mono text-emerald-400">
                                                        {new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                    </p>
                                                    <p className="text-[10px] text-slate-600 mt-0.5">Asia/Seoul (KST)</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="llm" className="mt-6">
                            <Card className="bg-slate-900/40 border-slate-800/50 backdrop-blur-sm">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Cpu className="size-5 text-blue-400" />
                                        LLM Configuration
                                    </CardTitle>
                                    <CardDescription>Manage API keys for multiple intelligence engines.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {Object.entries(config.llmConfigs).map(([provider, details]: [string, any]) => {
                                        const provInfo = availableProviders.find(p => p.id === provider);
                                        const models = provInfo?.models || [];
                                        const configured = isProviderConfigured(provider, details);
                                        const isPrimary = config.llmProvider === provider;

                                        return (
                                            <div key={provider} className={`space-y-3 p-4 rounded-xl border transition-all ${configured ? 'bg-slate-950 border-slate-800' : 'bg-slate-950/50 border-slate-800/50 opacity-70'}`}>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <Label className="capitalize text-blue-400 font-bold">{provider}</Label>
                                                        {!configured && (
                                                            <span className="flex items-center gap-1 text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                                                                <AlertCircle className="size-2.5" /> {provider === "ollama" ? "Endpoint Required" : "API Key Required"}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {provider === "ollama" && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-6 text-[10px] gap-1 hover:bg-slate-800"
                                                                onClick={async () => {
                                                                    try {
                                                                        const res = await fetch(`/api/llm/providers?ollama_url=${encodeURIComponent(details.endpoint)}`);
                                                                        const data = await res.json();
                                                                        if (data.providers) {
                                                                            const ollama = data.providers.find((p: any) => p.id === "ollama");
                                                                            if (ollama) {
                                                                                setAvailableProviders(prev => prev.map(p => p.id === "ollama" ? ollama : p));
                                                                                if (ollama.models.length > 0 && !details.model) {
                                                                                    setConfig(c => ({
                                                                                        ...c,
                                                                                        llmConfigs: {
                                                                                            ...c.llmConfigs,
                                                                                            ollama: { ...c.llmConfigs.ollama as any, model: ollama.models[0] }
                                                                                        }
                                                                                    }));
                                                                                }
                                                                                // Notify sidebar to refresh provider/model list
                                                                                window.dispatchEvent(new CustomEvent("config-updated"));
                                                                            }
                                                                        }
                                                                    } catch (err) {
                                                                        console.error("Failed to fetch Ollama models:", err);
                                                                    }
                                                                }}
                                                            >
                                                                <Zap className="size-3" /> Fetch Models
                                                            </Button>
                                                        )}
                                                        <button
                                                            disabled={!configured}
                                                            onClick={() => configured && setConfig({ ...config, llmProvider: provider, llmModel: details.model })}
                                                            className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${isPrimary && configured ? 'bg-blue-600 border-blue-600 text-white' : configured ? 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200 cursor-pointer' : 'border-slate-800 text-slate-600 cursor-not-allowed'}`}
                                                            title={!configured ? (provider === "ollama" ? "Enter a valid endpoint first" : "Enter a valid API key first") : ""}
                                                        >
                                                            {isPrimary && configured ? "Primary" : "Set as Primary"}
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="space-y-1.5">
                                                        <Label className="text-[10px] text-slate-500 uppercase">{provider === "ollama" ? "Endpoint" : "API Key"}</Label>
                                                        <Input
                                                            type={provider === "ollama" ? "text" : "password"}
                                                            placeholder={provider === "ollama" ? "http://localhost:11434" : provider === "openai" ? "sk-..." : provider === "anthropic" ? "sk-ant-..." : "API Key"}
                                                            value={provider === "ollama" ? (details.endpoint || "") : (details.apiKey || "")}
                                                            onChange={(e) => setConfig({
                                                                ...config,
                                                                llmConfigs: {
                                                                    ...config.llmConfigs,
                                                                    [provider]: provider === "ollama"
                                                                        ? { ...details, endpoint: e.target.value }
                                                                        : { ...details, apiKey: e.target.value }
                                                                }
                                                            })}
                                                            className="bg-slate-900 border-slate-800 font-mono text-xs"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label className="text-[10px] text-slate-500 uppercase">Model</Label>
                                                        <select
                                                            disabled={!configured}
                                                            value={details.model}
                                                            onChange={(e) => setConfig({
                                                                ...config,
                                                                llmConfigs: {
                                                                    ...config.llmConfigs,
                                                                    [provider]: { ...details, model: e.target.value }
                                                                },
                                                                ...(isPrimary ? { llmModel: e.target.value } : {})
                                                            })}
                                                            className={`w-full h-10 rounded-md border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-transparent ${configured ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-slate-900/50 border-slate-800/50 text-slate-600 cursor-not-allowed'}`}
                                                        >
                                                            {models.length > 0 ? (
                                                                models.map(m => <option key={m} value={m}>{m}</option>)
                                                            ) : (
                                                                <option value={details.model}>{details.model || "No models available"}</option>
                                                            )}
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="assets" className="mt-6">
                            <Card className="bg-slate-900/40 border-slate-800/50 backdrop-blur-sm">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <div>
                                        <CardTitle className="flex items-center gap-2">
                                            <Server className="size-5 text-purple-400" />
                                            Server Assets
                                        </CardTitle>
                                        <CardDescription>Register remote servers for monitoring and terminal access.</CardDescription>
                                    </div>
                                    <div className="flex gap-2">
                                        <label
                                            htmlFor="assets-json-import"
                                            className="cursor-pointer inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                                        >
                                            <Upload className="size-4" /> Import JSON
                                        </label>
                                        <input
                                            id="assets-json-import"
                                            type="file"
                                            accept=".json,application/json"
                                            className="hidden"
                                            onChange={importAssetsFromJson}
                                        />
                                        <Button size="sm" onClick={() => { addAsset(); setEditingAssetIndex(config.assets.length); }} className="bg-blue-600 hover:bg-blue-500">
                                            <Plus className="size-4 mr-1" /> Add Asset
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {config.assets.map((asset, index) => (
                                        <div key={index} className="rounded-xl overflow-hidden border border-slate-800 transition-all bg-slate-950/50">
                                            {/* Header Section (Collapsed View) */}
                                            <div className={cn(
                                                "px-4 py-3 flex items-center justify-between transition-colors",
                                                editingAssetIndex === index ? "bg-slate-900/80 border-b border-slate-800" : "hover:bg-slate-900/40 cursor-pointer"
                                            )} onClick={() => setEditingAssetIndex(editingAssetIndex === index ? null : index)}>
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "size-8 rounded-lg flex items-center justify-center border",
                                                        asset.os === "windows" ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                                    )}>
                                                        <Server className="size-4" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-200">{asset.name || "Untitled Asset"}</p>
                                                        <p className="text-[10px] text-slate-500 font-mono">{asset.user}@{asset.ip}:{asset.port}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge className={cn("text-[9px] font-mono", asset.os === "windows" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20")}>
                                                        {asset.os === "windows" ? "Win" : "Linux"}
                                                    </Badge>
                                                    <Button variant="ghost" size="icon" className="size-8 text-slate-500" onClick={(e) => { e.stopPropagation(); setEditingAssetIndex(editingAssetIndex === index ? null : index); }}>
                                                        <Settings className={cn("size-4 transition-transform", editingAssetIndex === index ? "rotate-90 text-blue-400" : "")} />
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Edit Section (Expanded View) */}
                                            {editingAssetIndex === index && (
                                                <div className="p-4 bg-slate-950 space-y-4 animate-in slide-in-from-top-2 duration-200">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-1">
                                                            <Label className="text-[10px] uppercase font-bold text-slate-500">Name</Label>
                                                            <Input
                                                                value={asset.name || ""}
                                                                onChange={(e) => updateAsset(index, "name", e.target.value)}
                                                                className="bg-slate-900 border-slate-800 h-9"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[10px] uppercase font-bold text-slate-500">IP Address</Label>
                                                            <Input
                                                                value={asset.ip || ""}
                                                                onChange={(e) => updateAsset(index, "ip", e.target.value)}
                                                                className="bg-slate-900 border-slate-800 h-9"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[10px] uppercase font-bold text-slate-500">SSH Port</Label>
                                                            <Input
                                                                value={asset.port || "22"}
                                                                onChange={(e) => updateAsset(index, "port", e.target.value)}
                                                                className="bg-slate-900 border-slate-800 h-9"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[10px] uppercase font-bold text-slate-500">Username</Label>
                                                            <Input
                                                                value={asset.user || ""}
                                                                onChange={(e) => updateAsset(index, "user", e.target.value)}
                                                                className="bg-slate-900 border-slate-800 h-9"
                                                            />
                                                        </div>
                                                        <div className="space-y-1 col-span-2">
                                                            <Label className="text-[10px] uppercase font-bold text-slate-500">Authentication Mode</Label>
                                                            <div className="flex gap-2 p-1 bg-slate-900 border border-slate-800 rounded-lg w-fit">
                                                                <button
                                                                    onClick={() => updateAsset(index, "auth_mode", "password")}
                                                                    className={`px-3 py-1 text-[10px] rounded-md transition-all ${asset.auth_mode !== "key" ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-300"}`}
                                                                >
                                                                    Password
                                                                </button>
                                                                <button
                                                                    onClick={() => updateAsset(index, "auth_mode", "key")}
                                                                    className={`px-3 py-1 text-[10px] rounded-md transition-all ${asset.auth_mode === "key" ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-300"}`}
                                                                >
                                                                    SSH Key
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1 col-span-2">
                                                            <Label className="text-[10px] uppercase font-bold text-slate-500">Asset Category</Label>
                                                            <div className="flex gap-2 p-1 bg-slate-900 border border-slate-800 rounded-lg w-fit">
                                                                <button
                                                                    onClick={() => updateAsset(index, "category", "defense")}
                                                                    className={`px-3 py-1 text-[10px] rounded-md transition-all ${asset.category === "defense" ? "bg-amber-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-300"}`}
                                                                >
                                                                    Defense Asset
                                                                </button>
                                                                <button
                                                                    onClick={() => updateAsset(index, "category", "security")}
                                                                    className={`px-3 py-1 text-[10px] rounded-md transition-all ${asset.category !== "defense" ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-300"}`}
                                                                >
                                                                    Security System
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {asset.category === "defense" && (
                                                            <div className="space-y-1 col-span-2">
                                                                <Label className="text-[10px] uppercase font-bold text-slate-500">Network Sector</Label>
                                                                <select
                                                                    value={asset.sector || ""}
                                                                    onChange={(e) => updateAsset(index, "sector", e.target.value)}
                                                                    className="w-full h-9 rounded-md bg-slate-900 border border-slate-800 text-slate-200 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-transparent"
                                                                >
                                                                    <option value="">Select Sector...</option>
                                                                    <option value="DMZ">DMZ</option>
                                                                    <option value="BEG">BEG</option>
                                                                    <option value="BAF">BAF</option>
                                                                    <option value="BPS">BPS</option>
                                                                </select>
                                                            </div>
                                                        )}

                                                        <div className="space-y-1 col-span-2 md:col-span-1">
                                                            <Label className="text-[10px] uppercase font-bold text-slate-500">Operating System</Label>
                                                            <div className="flex gap-2 p-1 bg-slate-900 border border-slate-800 rounded-lg w-fit">
                                                                <button
                                                                    onClick={() => updateAsset(index, "os", "linux")}
                                                                    className={`px-3 py-1 text-[10px] rounded-md transition-all ${asset.os !== "windows" ? "bg-emerald-700 text-white shadow-lg" : "text-slate-400 hover:text-slate-300"}`}
                                                                >
                                                                    Linux
                                                                </button>
                                                                <button
                                                                    onClick={() => updateAsset(index, "os", "windows")}
                                                                    className={`px-3 py-1 text-[10px] rounded-md transition-all ${asset.os === "windows" ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-300"}`}
                                                                >
                                                                    Windows
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {asset.auth_mode === "key" ? (
                                                            <div className="space-y-1">
                                                                <Label className="text-[10px] uppercase font-bold text-slate-500">Select SSH Key</Label>
                                                                <select
                                                                    value={asset.key_id || ""}
                                                                    onChange={(e) => updateAsset(index, "key_id", e.target.value)}
                                                                    className="w-full h-9 rounded-md bg-slate-900 border border-slate-800 text-slate-200 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-transparent"
                                                                >
                                                                    <option value="">Select a key...</option>
                                                                    {config.keystore.map(k => (
                                                                        <option key={k.id} value={k.id}>{k.name}</option>
                                                                    ))}
                                                                </select>
                                                                {config.keystore.length === 0 && (
                                                                    <p className="text-[10px] text-amber-500 mt-1">No keys found. Add one in the KeyStore tab.</p>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-1">
                                                                <Label className="text-[10px] uppercase font-bold text-slate-500">Password</Label>
                                                                <Input
                                                                    type="password"
                                                                    value={asset.pass || ""}
                                                                    onChange={(e) => updateAsset(index, "pass", e.target.value)}
                                                                    className="bg-slate-900 border-slate-800 h-9"
                                                                    placeholder="Leave empty if not required"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="pt-2 flex justify-end">
                                                        <Button variant="ghost" size="sm" onClick={() => removeAsset(index)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                                                            <Trash2 className="size-4 mr-1" /> Delete Asset
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {config.assets.length === 0 && (
                                        <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-2xl">
                                            <div className="bg-slate-900 size-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                                <Server className="size-6 text-slate-600" />
                                            </div>
                                            <h3 className="text-sm font-medium text-slate-300">No assets registered</h3>
                                            <p className="text-xs text-slate-500 mt-1 max-w-[200px] mx-auto">
                                                Click &apos;Add Asset&apos; to begin registering your infrastructure.
                                            </p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="keystore" className="mt-6">
                            <Card className="bg-slate-900/40 border-slate-800/50 backdrop-blur-sm">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <div>
                                        <CardTitle className="flex items-center gap-2">
                                            <Key className="size-5 text-amber-400" />
                                            SSH KeyStore
                                        </CardTitle>
                                        <CardDescription>Securely store private keys for SSH authentication.</CardDescription>
                                    </div>
                                    <Button size="sm" onClick={addKey} className="bg-amber-600 hover:bg-amber-500">
                                        <Plus className="size-4 mr-1" /> Add Key
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {config.keystore.map((key) => (
                                        <div key={key.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4 relative group">
                                            <button
                                                onClick={() => removeKey(key.id)}
                                                className="absolute top-4 right-4 p-1 text-slate-600 hover:text-red-400 transition-colors"
                                            >
                                                <Trash2 className="size-4" />
                                            </button>

                                            <div className="space-y-2 max-w-md">
                                                <Label className="text-[10px] uppercase font-bold text-slate-500">Key Name</Label>
                                                <Input
                                                    value={key.name}
                                                    onChange={(e) => updateKey(key.id, "name", e.target.value)}
                                                    placeholder="e.g., Production Web Server Key"
                                                    className="bg-slate-900 border-slate-800 h-9"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-[10px] uppercase font-bold text-slate-500">Private Key (RSA, Ed25519, etc.)</Label>
                                                    <div className="flex gap-2">
                                                        <label className="cursor-pointer text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded transition-colors flex items-center gap-1">
                                                            <Upload className="size-3" /> Upload File
                                                            <input
                                                                type="file"
                                                                className="hidden"
                                                                onChange={(e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file) {
                                                                        const reader = new FileReader();
                                                                        reader.onload = (ev) => {
                                                                            updateKey(key.id, "private_key", ev.target?.result as string);
                                                                            if (key.name === "New SSH Key") {
                                                                                updateKey(key.id, "name", file.name);
                                                                            }
                                                                        };
                                                                        reader.readAsText(file);
                                                                    }
                                                                }}
                                                            />
                                                        </label>
                                                    </div>
                                                </div>
                                                <textarea
                                                    value={key.private_key}
                                                    onChange={(e) => updateKey(key.id, "private_key", e.target.value)}
                                                    className="w-full h-32 bg-slate-900 border border-slate-800 rounded-md p-3 text-xs font-mono text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-600 focus:border-transparent resize-none"
                                                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..."
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    {config.keystore.length === 0 && (
                                        <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-2xl">
                                            <div className="bg-slate-900 size-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                                <Key className="size-6 text-slate-600" />
                                            </div>
                                            <h3 className="text-sm font-medium text-slate-300">No keys in store</h3>
                                            <p className="text-xs text-slate-500 mt-1 max-w-[200px] mx-auto">
                                                Add your first private key to use SSH key authentication for your assets.
                                            </p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="tools" className="mt-6 space-y-6">
                            {/* Wazuh Card */}
                            <Card className={cn("bg-slate-900/40 border-slate-800/50 backdrop-blur-sm transition-opacity", !config.wazuhEnabled && "opacity-60")}>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                                    <div className="space-y-1">
                                        <CardTitle className="flex items-center gap-2">
                                            <Shield className="size-5 text-emerald-400" />
                                            Wazuh Manager
                                        </CardTitle>
                                        <CardDescription>Configure connection to your Wazuh instance.</CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="wazuh-enabled" className="text-xs text-slate-400">Enabled</Label>
                                        <input
                                            id="wazuh-enabled"
                                            type="checkbox"
                                            checked={config.wazuhEnabled}
                                            onChange={(e) => setConfig({ ...config, wazuhEnabled: e.target.checked })}
                                            className="size-4 rounded border-slate-700 bg-slate-950 text-emerald-600 focus:ring-emerald-600"
                                        />
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Host</Label>
                                            <Input
                                                value={config.wazuhConfig.host}
                                                disabled={!config.wazuhEnabled}
                                                onChange={(e) => setConfig({ ...config, wazuhConfig: { ...config.wazuhConfig, host: e.target.value } })}
                                                className="bg-slate-950 border-slate-800"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Port</Label>
                                            <Input
                                                type="number"
                                                value={config.wazuhConfig.port}
                                                disabled={!config.wazuhEnabled}
                                                onChange={(e) => setConfig({ ...config, wazuhConfig: { ...config.wazuhConfig, port: parseInt(e.target.value) } })}
                                                className="bg-slate-950 border-slate-800"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Username</Label>
                                            <Input
                                                value={config.wazuhConfig.user}
                                                disabled={!config.wazuhEnabled}
                                                onChange={(e) => setConfig({ ...config, wazuhConfig: { ...config.wazuhConfig, user: e.target.value } })}
                                                className="bg-slate-950 border-slate-800"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Password</Label>
                                            <Input
                                                type="password"
                                                value={config.wazuhConfig.pass}
                                                disabled={!config.wazuhEnabled}
                                                onChange={(e) => setConfig({ ...config, wazuhConfig: { ...config.wazuhConfig, pass: e.target.value } })}
                                                className="bg-slate-950 border-slate-800"
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-slate-800 mt-4">
                                        <h4 className="text-sm font-bold text-slate-400 mb-4 flex items-center gap-2">
                                            <Server className="size-4 text-emerald-500" />
                                            Wazuh Indexer (Optional - for 4.8+)
                                        </h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Indexer Host</Label>
                                                <Input
                                                    value={config.wazuhConfig.indexer_host || ""}
                                                    disabled={!config.wazuhEnabled}
                                                    onChange={(e) => setConfig({ ...config, wazuhConfig: { ...config.wazuhConfig, indexer_host: e.target.value } })}
                                                    className="bg-slate-950 border-slate-800"
                                                    placeholder="e.g. 192.168.1.100"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Indexer Port</Label>
                                                <Input
                                                    type="number"
                                                    value={config.wazuhConfig.indexer_port || 9200}
                                                    disabled={!config.wazuhEnabled}
                                                    onChange={(e) => setConfig({ ...config, wazuhConfig: { ...config.wazuhConfig, indexer_port: parseInt(e.target.value) } })}
                                                    className="bg-slate-950 border-slate-800"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 mt-4">
                                            <div className="space-y-2">
                                                <Label>Indexer Username</Label>
                                                <Input
                                                    value={config.wazuhConfig.indexer_user || ""}
                                                    disabled={!config.wazuhEnabled}
                                                    onChange={(e) => setConfig({ ...config, wazuhConfig: { ...config.wazuhConfig, indexer_user: e.target.value } })}
                                                    className="bg-slate-950 border-slate-800"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Indexer Password</Label>
                                                <Input
                                                    type="password"
                                                    value={config.wazuhConfig.indexer_pass || ""}
                                                    disabled={!config.wazuhEnabled}
                                                    onChange={(e) => setConfig({ ...config, wazuhConfig: { ...config.wazuhConfig, indexer_pass: e.target.value } })}
                                                    className="bg-slate-950 border-slate-800"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Falcon Card */}
                            <Card className={cn("bg-slate-900/40 border-slate-800/50 backdrop-blur-sm transition-opacity", !config.falconEnabled && "opacity-60")}>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                                    <div className="space-y-1">
                                        <CardTitle className="flex items-center gap-2">
                                            <Key className="size-5 text-red-400" />
                                            CrowdStrike Falcon
                                        </CardTitle>
                                        <CardDescription>API credentials for Falcon sensor management.</CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="falcon-enabled" className="text-xs text-slate-400">Enabled</Label>
                                        <input
                                            id="falcon-enabled"
                                            type="checkbox"
                                            checked={config.falconEnabled}
                                            onChange={(e) => setConfig({ ...config, falconEnabled: e.target.checked })}
                                            className="size-4 rounded border-slate-700 bg-slate-950 text-red-600 focus:ring-red-600"
                                        />
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Client ID</Label>
                                        <Input
                                            value={config.falconConfig.client_id}
                                            disabled={!config.falconEnabled}
                                            onChange={(e) => setConfig({ ...config, falconConfig: { ...config.falconConfig, client_id: e.target.value } })}
                                            className="bg-slate-950 border-slate-800"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Client Secret</Label>
                                        <Input
                                            type="password"
                                            value={config.falconConfig.client_secret}
                                            disabled={!config.falconEnabled}
                                            onChange={(e) => setConfig({ ...config, falconConfig: { ...config.falconConfig, client_secret: e.target.value } })}
                                            className="bg-slate-950 border-slate-800"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Base URL</Label>
                                        <Input
                                            value={config.falconConfig.base_url}
                                            disabled={!config.falconEnabled}
                                            onChange={(e) => setConfig({ ...config, falconConfig: { ...config.falconConfig, base_url: e.target.value } })}
                                            className="bg-slate-950 border-slate-800"
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Velociraptor Card */}
                            <Card className={cn("bg-slate-900/40 border-slate-800/50 backdrop-blur-sm transition-opacity", !config.velociraptorEnabled && "opacity-60")}>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                                    <div className="space-y-1">
                                        <CardTitle className="flex items-center gap-2">
                                            <Zap className="size-5 text-violet-400" />
                                            Velociraptor
                                        </CardTitle>
                                        <CardDescription>DFIR / EDR integration via Velociraptor gRPC API.</CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="velociraptor-enabled" className="text-xs text-slate-400">Enabled</Label>
                                        <input
                                            id="velociraptor-enabled"
                                            type="checkbox"
                                            checked={config.velociraptorEnabled}
                                            onChange={(e) => setConfig({ ...config, velociraptorEnabled: e.target.checked })}
                                            className="size-4 rounded border-slate-700 bg-slate-950 text-violet-600 focus:ring-violet-600"
                                        />
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="p-4 rounded-xl bg-slate-950 border border-violet-900/40 space-y-3">
                                        <h4 className="text-sm font-bold text-violet-400 flex items-center gap-2">
                                            <AlertCircle className="size-4" /> Setup Instructions
                                        </h4>
                                        <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
                                            <li>In your Velociraptor server, go to <span className="font-mono text-slate-300">Server Artifacts → Server.Utils.CreateCollector</span> and generate an <span className="font-mono text-violet-300">api_client.yaml</span>.</li>
                                            <li>Place the generated file in the directory specified by <span className="font-mono text-violet-300">VELOCIRAPTOR_CONFIG_DIR</span> in your <span className="font-mono text-slate-300">.env</span> file (default: <span className="font-mono text-slate-300">./velociraptor-config/</span>).</li>
                                            <li>Restart the <span className="font-mono text-slate-300">mcp-velociraptor</span> container after placing the file.</li>
                                        </ol>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>API Config Path (inside container)</Label>
                                        <Input
                                            value={config.velociraptorConfig.api_config_path}
                                            disabled={!config.velociraptorEnabled}
                                            onChange={(e) => setConfig({ ...config, velociraptorConfig: { ...config.velociraptorConfig, api_config_path: e.target.value } })}
                                            className="bg-slate-950 border-slate-800 font-mono text-sm"
                                            placeholder="/config/api_client.yaml"
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Tavily Card */}
                            <Card className={cn("bg-slate-900/40 border-slate-800/50 backdrop-blur-sm transition-opacity", !config.tavilyEnabled && "opacity-60")}>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                                    <div className="space-y-1">
                                        <CardTitle className="flex items-center gap-2">
                                            <Globe className="size-5 text-blue-400" />
                                            Web Search (Tavily)
                                        </CardTitle>
                                        <CardDescription>AI agent helps you search CVE, Vulnerability, recent security issues from the web.</CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="tavily-enabled" className="text-xs text-slate-400">Enabled</Label>
                                        <input
                                            id="tavily-enabled"
                                            type="checkbox"
                                            checked={config.tavilyEnabled}
                                            onChange={(e) => setConfig({ ...config, tavilyEnabled: e.target.checked })}
                                            className="size-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-600"
                                        />
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Tavily API Key</Label>
                                        <Input
                                            type="password"
                                            value={config.tavilyConfig.api_key}
                                            disabled={!config.tavilyEnabled}
                                            onChange={(e) => setConfig({ ...config, tavilyConfig: { ...config.tavilyConfig, api_key: e.target.value } })}
                                            className="bg-slate-950 border-slate-800 font-mono text-sm"
                                            placeholder="tvly-..."
                                        />
                                        <p className="text-[10px] text-slate-500">
                                            Get a free API key from <a href="https://app.tavily.com" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">app.tavily.com</a>.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>

                    <div className="flex justify-end pt-4 border-t border-slate-800">
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-500 min-w-[120px]"
                        >
                            {saving ? (
                                <Loader2 className="mr-2 size-4 animate-spin" />
                            ) : saved ? (
                                <CheckCircle2 className="mr-2 size-4" />
                            ) : (
                                <Save className="mr-2 size-4" />
                            )}
                            {saved ? "Saved!" : "Save Changes"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
