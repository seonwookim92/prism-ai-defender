"use client";

import React from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MoreVertical,
  ShieldAlert,
  ShieldCheck,
  LayoutDashboard,
  Zap,
  Server,
  Activity,
  ArrowUpRight,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardStats {
  asset_count: number;
  monitoring: {
    total_tasks: number;
    summary: { green: number; amber: number; red: number; error: number };
  };
  alerts: Array<{
    id: number;
    task_title: string;
    timestamp: string;
    message: string;
  }>;
  integrations: {
    wazuh: string;
    falcon: string;
    velociraptor: string;
  };
}

const DEMO_STATS: DashboardStats = {
  asset_count: 12,
  monitoring: {
    total_tasks: 45,
    summary: { green: 38, amber: 4, red: 3, error: 0 }
  },
  alerts: [
    { id: 101, task_title: "SSH Brute Force Detection", timestamp: new Date().toISOString(), message: "Multiple failed login attempts detected from 192.31.2.11" },
    { id: 102, task_title: "Unauthorized Process Started", timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), message: "Suspicious process 'xmrig' detected on production-api-01" },
    { id: 103, task_title: "Wazuh Integrity Check", timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(), message: "Critical system file /etc/shadow modified on database-primary" },
    { id: 104, task_title: "Falcon IOC Match", timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(), message: "Potential data exfiltration to unrecognized IP 45.12.88.2" },
  ],
  integrations: {
    wazuh: "online",
    falcon: "online",
    velociraptor: "online"
  }
};

export default function Dashboard() {
  const [mounted, setMounted] = React.useState(false);
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isDemoMode, setIsDemoMode] = React.useState(false);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error("Failed to fetch dashboard stats", e);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    setMounted(true);
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!mounted || loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="size-12 bg-blue-600/20 rounded-xl flex items-center justify-center">
            <LayoutDashboard className="size-6 text-blue-500/50" />
          </div>
          <div className="h-4 w-32 bg-slate-800 rounded" />
        </div>
      </div>
    );
  }

  const activeStats = isDemoMode ? DEMO_STATS : stats;
  const healthScore = activeStats ? Math.round((activeStats.monitoring.summary.green / (activeStats.monitoring.total_tasks || 1)) * 100) : 0;

  return (
    <div className="flex flex-col h-screen w-full animate-in fade-in slide-in-from-bottom-4 duration-1000 overflow-hidden">
      <header className="px-8 py-5 border-b border-slate-800/50 bg-slate-950/50 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="size-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <LayoutDashboard className="size-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">Dashboard</h2>
            <p className="text-xs text-slate-500">Real-time security operations monitoring</p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-slate-900/50 p-1 rounded-full border border-slate-800/50 px-3 py-1.5">
          <span className={cn("text-[10px] font-bold uppercase tracking-widest transition-colors", isDemoMode ? "text-slate-500" : "text-blue-400")}>Live</span>
          <button
            onClick={() => setIsDemoMode(!isDemoMode)}
            className={cn(
              "relative w-8 h-4 rounded-full transition-colors duration-200 outline-none",
              isDemoMode ? "bg-purple-600" : "bg-slate-700"
            )}
          >
            <div className={cn(
              "absolute top-0.5 left-0.5 size-3 bg-white rounded-full transition-transform duration-200",
              isDemoMode ? "translate-x-4" : "translate-x-0"
            )} />
          </button>
          <span className={cn("text-[10px] font-bold uppercase tracking-widest transition-colors", isDemoMode ? "text-purple-400" : "text-slate-500")}>Demo</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8 custom-scrollbar">
        {isDemoMode && (
          <div className="bg-purple-600/10 border border-purple-500/20 rounded-xl p-3 flex items-center justify-between animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-purple-500 animate-pulse" />
              <span className="text-[10px] font-bold text-purple-300 uppercase tracking-widest">Demo Mode is Currently Active</span>
            </div>
            <p className="text-[9px] text-purple-400/80 font-medium">Dashboard visual mockups are being displayed based on simulated security events.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Overall Health Card */}
          <Card className="md:col-span-1 bg-slate-900/40 border-slate-800/50 backdrop-blur-sm p-6 flex flex-col items-center justify-center text-center group relative overflow-hidden">
            {isDemoMode && <div className="absolute top-0 right-0 bg-purple-600 text-white text-[8px] font-black px-2 py-0.5 rotate-45 translate-x-3 translate-y-1">DEMO</div>}
            <div className="relative size-32 mb-4">
              <svg className="size-full -rotate-90">
                <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-800" />
                <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent"
                  strokeDasharray={364}
                  strokeDashoffset={364 - (364 * healthScore) / 100}
                  className={cn(
                    "transition-all duration-1000",
                    healthScore > 80 ? "text-emerald-500" : healthScore > 50 ? "text-amber-500" : "text-red-500"
                  )}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-white">{healthScore}%</span>
                <span className="text-[10px] text-slate-500 uppercase font-black tracking-tighter">Security Score</span>
              </div>
            </div>
            <p className="text-xs text-slate-400">Total {activeStats?.monitoring.total_tasks} Active Monitors</p>
          </Card>

          {/* Monitoring Status Summary */}
          <Card className="md:col-span-3 bg-slate-900/40 border-slate-800/50 backdrop-blur-sm overflow-hidden">
            <CardHeader className="border-b border-slate-800/50 py-4 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <Activity className="size-4 text-blue-400" /> Monitoring Health
              </CardTitle>
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-xs text-slate-400">Green: {activeStats?.monitoring.summary.green}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="size-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                  <span className="text-xs text-slate-400">Amber: {activeStats?.monitoring.summary.amber}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="size-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                  <span className="text-xs text-slate-400">Red: {activeStats?.monitoring.summary.red}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-1 md:grid-cols-3 divide-x divide-slate-800/50 h-full">
                <div className="p-6 space-y-2">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Asset Inventory</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-white">{activeStats?.asset_count}</span>
                    <span className="text-xs text-slate-500">Nodes</span>
                  </div>
                </div>
                <div className="p-6 md:col-span-2 space-y-4">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Service Integrations</p>
                  <div className="grid grid-cols-3 gap-4">
                    {Object.entries(activeStats?.integrations || {}).map(([name, status]) => (
                      <div key={name} className="bg-slate-950/50 border border-slate-800/50 rounded-xl p-3 flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <Server className="size-3 text-slate-500" />
                          <div className={cn(
                            "size-1.5 rounded-full",
                            status === "online" ? "bg-emerald-500" : "bg-slate-700"
                          )} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">{name}</span>
                        <span className={cn(
                          "text-[9px] font-medium",
                          status === "online" ? "text-emerald-400/70" : "text-slate-600"
                        )}>
                          {status === "online" ? "ONLINE" : "OFFLINE"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Alerts Timeline */}
          <Card className="lg:col-span-2 bg-slate-900/40 border-slate-800/50 backdrop-blur-sm overflow-hidden flex flex-col h-[400px]">
            <CardHeader className="border-b border-slate-800/50 py-4 shrink-0">
              <CardTitle className="text-sm font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <ShieldAlert className="size-4 text-red-500" /> Live Alert Log
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-y-auto custom-scrollbar">
              {activeStats?.alerts && activeStats.alerts.length > 0 ? (
                <div className="divide-y divide-slate-800/30">
                  {activeStats.alerts.map((alert) => (
                    <div key={alert.id} className="p-4 flex gap-4 hover:bg-slate-800/20 transition-colors group">
                      <div className="mt-1 size-2 rounded-full bg-red-500 shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse" />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-slate-200 group-hover:text-red-400 transition-colors uppercase tracking-tight">{alert.task_title}</h4>
                          <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                            <Clock className="size-3" /> {new Date(alert.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed font-mono bg-slate-950/50 p-2 rounded-lg border border-slate-800/30 mt-2">
                          {alert.message}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-30 gap-3 grayscale">
                  <ShieldCheck className="size-12" />
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">No active threats detected</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions / Summary Card */}
          <div className="space-y-6">
            <Card className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 border-blue-500/20 backdrop-blur-sm p-6 relative overflow-hidden group">
              <Zap className="absolute -top-4 -right-4 size-32 text-blue-500/10 group-hover:scale-110 transition-transform duration-700" />
              <h4 className="text-sm font-bold text-blue-300 uppercase mb-4">Prism AI Agent</h4>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                현재 {activeStats?.monitoring.total_tasks}개의 감시봇이 실시간으로 보안 위협을 탐지하고 있습니다.
                AI 빌더를 사용하여 보안 정책을 더 강화해보세요.
              </p>
              <Button onClick={() => window.location.href = '/builder'} className="w-full bg-blue-600 hover:bg-blue-500 text-[11px] font-black uppercase tracking-widest py-1 h-8">
                새 정책 설계하기 <ArrowUpRight className="ml-1 size-3" />
              </Button>
            </Card>

            <Card className="bg-slate-900/40 border-slate-800/50 backdrop-blur-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase">System Integrity</span>
                <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Operational</Badge>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Uptime</span>
                  <span className="font-mono text-slate-200">24d 14h 22m</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Database</span>
                  <span className="text-emerald-400 font-bold uppercase tracking-tighter">Connected</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
