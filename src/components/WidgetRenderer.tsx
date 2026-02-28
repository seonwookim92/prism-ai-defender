"use client";

import React, { useEffect, useState } from 'react';
// Card components removed as they were unused
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Loader2, AlertCircle } from 'lucide-react';

interface WidgetProps {
    id: string;
    title: string;
    type: string;
    toolName: string;
    toolArgs: string;
    refreshInt: number;
}

export function WidgetRenderer({ widget }: { widget: WidgetProps }) {
    const [data, setData] = useState<unknown>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    toolName: widget.toolName,
                    toolArgs: JSON.parse(widget.toolArgs)
                })
            });
            const result = await res.json();
            if (result.error) throw new Error(result.error);
            setData(result);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, widget.refreshInt * 1000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loading && !data) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-slate-500" /></div>;
    if (error) return <div className="flex items-center justify-center h-full gap-2 text-rose-500"><AlertCircle className="w-4 h-4" /> Error: {error}</div>;

    return (
        <div className="h-full flex flex-col p-4">
            <h3 className="text-lg font-semibold mb-4">{widget.title}</h3>
            <div className="flex-1 overflow-hidden">
                {widget.type === 'TABLE' && (
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-800">
                                <TableHead className="text-slate-400">Content</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {(data as any)?.content?.map((c: any, i: number) => (
                                <TableRow key={i} className="border-slate-800">
                                    <TableCell className="font-mono text-xs">{c.text}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
                {widget.type === 'LINE_CHART' && (
                    <ResponsiveContainer width="100%" height="100%">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <LineChart data={(data as any)?.content || []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} />
                            <YAxis stroke="#94a3b8" fontSize={10} />
                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }} />
                            <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                )}
                {widget.type === 'METRIC' && (
                    <div className="flex items-center justify-center h-full">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <span className="text-5xl font-mono font-bold text-indigo-400">{(data as any)?.content?.length || 0}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
