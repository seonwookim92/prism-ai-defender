"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Terminal, Server, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";

const TerminalWindow = dynamic(() => import("@/components/TerminalWindow"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full bg-slate-950 border border-slate-800 rounded-2xl">
            <Loader2 className="size-8 animate-spin text-blue-500" />
        </div>
    )
});

interface Asset {
    name: string;
    ip: string;
    user: string;
    pass: string;
    category?: "defense" | "security";
    sector?: string;
}

export default function TerminalPage() {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeAsset, setActiveAsset] = useState<Asset | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [sectorFilter, setSectorFilter] = useState<string>("all");

    useEffect(() => {
        async function fetchAssets() {
            try {
                const res = await fetch("/api/onboarding/status");
                const data = await res.json();
                if (data.config && data.config.assets) {
                    setAssets(data.config.assets);
                }
            } catch (error) {
                console.error("Failed to fetch assets", error);
            } finally {
                setLoading(false);
            }
        }
        fetchAssets();
    }, []);

    const filteredAssets = assets.filter(asset => {
        const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            asset.ip.includes(searchTerm);
        const matchesCategory = categoryFilter === "all" || asset.category === categoryFilter;
        const matchesSector = sectorFilter === "all" || asset.sector === sectorFilter;
        return matchesSearch && matchesCategory && matchesSector;
    });

    const sectors = ["DMZ", "BEG", "BAF", "BPS"];

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
                        <Terminal className="size-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-white">Terminal</h2>
                        <p className="text-xs text-slate-500">Fast SSH access to categorized infrastructure assets.</p>
                    </div>
                </div>

                {!activeAsset && (
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search by name or IP..."
                                className="w-64 bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all pl-10"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <svg className="absolute left-3 top-2.5 size-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                    </div>
                )}
            </header>

            <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar bg-slate-950/20">
                {!activeAsset ? (
                    <div className="space-y-8">
                        {/* Filters */}
                        <div className="flex flex-wrap items-center gap-6 pb-2">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category</label>
                                <div className="flex bg-slate-900/50 p-1 rounded-lg border border-slate-800/50">
                                    {["all", "defense", "security"].map((cat) => (
                                        <button
                                            key={cat}
                                            onClick={() => setCategoryFilter(cat)}
                                            className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${categoryFilter === cat
                                                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                                                    : "text-slate-400 hover:text-slate-200"
                                                }`}
                                        >
                                            {cat === "all" ? "All" : cat === "defense" ? "Defense Asset" : "Security System"}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Network Sector</label>
                                <div className="flex bg-slate-900/50 p-1 rounded-lg border border-slate-800/50">
                                    {["all", ...sectors].map((sec) => (
                                        <button
                                            key={sec}
                                            onClick={() => setSectorFilter(sec)}
                                            className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${sectorFilter === sec
                                                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                                                    : "text-slate-400 hover:text-slate-200"
                                                }`}
                                        >
                                            {sec}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {filteredAssets.length === 0 ? (
                            <Card className="py-12 flex flex-col items-center justify-center bg-slate-900/20 border-slate-800 border-dashed">
                                <Server className="size-12 text-slate-700 mb-4" />
                                <p className="text-slate-400">No assets matching those criteria.</p>
                            </Card>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                                {filteredAssets.map((asset) => (
                                    <div
                                        key={asset.ip}
                                        className="group relative bg-slate-900/40 border border-slate-800/50 rounded-xl p-4 hover:border-blue-500/50 hover:bg-slate-900/60 transition-all cursor-pointer overflow-hidden"
                                        onClick={() => setActiveAsset(asset)}
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <div className={`p-2 rounded-lg ${asset.category === 'defense' ? 'bg-amber-500/10' : 'bg-blue-500/10'}`}>
                                                <Server className={`size-4 ${asset.category === 'defense' ? 'text-amber-500' : 'text-blue-400'}`} />
                                            </div>
                                            {asset.sector && (
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                                    {asset.sector}
                                                </span>
                                            )}
                                        </div>

                                        <div className="space-y-0.5">
                                            <h3 className="text-sm font-bold text-slate-200 truncate group-hover:text-blue-400 transition-colors">{asset.name}</h3>
                                            <p className="text-[11px] font-mono text-slate-500 truncate">{asset.user}@{asset.ip}</p>
                                        </div>

                                        <div className="mt-4 flex items-center justify-between">
                                            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${asset.category === 'defense' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-400'
                                                }`}>
                                                {asset.category === 'defense' ? 'Defense' : 'Sec System'}
                                            </span>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <span className="text-[10px] text-blue-400 font-medium">Connect</span>
                                                <Terminal className="size-3 text-blue-400" />
                                            </div>
                                        </div>

                                        {/* Hover glow effect */}
                                        <div className="absolute -inset-px rounded-xl border-blue-500/0 group-hover:border-blue-500/30 pointer-events-none" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="h-[calc(100vh-160px)] min-h-[500px]">
                        <TerminalWindow
                            ip={activeAsset.ip}
                            name={activeAsset.name}
                            onClose={() => setActiveAsset(null)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
