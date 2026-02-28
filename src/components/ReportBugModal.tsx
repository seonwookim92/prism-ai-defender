"use client";

import React, { useState } from "react";
import { X, Bug, Send, Loader2, CheckCircle2, AlertCircle, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
    screenshot: string | null;
    currentPage: string;
    onClose: () => void;
}

const CATEGORIES = [
    "UI/UX 문제",
    "MCP 도구 오류",
    "AI 응답 문제",
    "연결 오류",
    "보안 감사 오류",
    "Ops Chat 오류",
    "기타",
];

const SEVERITIES = [
    { id: "critical", label: "Critical", desc: "서비스 불능", color: "text-red-400 border-red-500/40 bg-red-500/10" },
    { id: "high",     label: "High",     desc: "주요 기능 불가", color: "text-orange-400 border-orange-500/40 bg-orange-500/10" },
    { id: "medium",   label: "Medium",   desc: "부분 이상",    color: "text-amber-400 border-amber-500/40 bg-amber-500/10" },
    { id: "low",      label: "Low",      desc: "경미한 문제",  color: "text-blue-400 border-blue-500/40 bg-blue-500/10" },
];

export function ReportBugModal({ screenshot, currentPage, onClose }: Props) {
    const [category, setCategory] = useState(CATEGORIES[0]);
    const [severity, setSeverity] = useState("medium");
    const [description, setDescription] = useState("");
    const [steps, setSteps] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

    const handleSubmit = () => {
        if (!description.trim()) return;
        setSubmitting(true);
        try {
            const timestamp = new Date().toISOString();
            const sevColor: Record<string, string> = {
                critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#3b82f6",
            };
            const color = sevColor[severity] ?? "#94a3b8";

            const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<title>PRISM Bug Report – ${timestamp}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0c12; color: #e2e8f0; margin: 0; padding: 32px; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #fff; }
  .sub { font-size: 12px; color: #64748b; margin-bottom: 32px; font-family: monospace; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; border: 1px solid; }
  .section { margin-bottom: 24px; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: .1em; font-weight: 700; color: #64748b; margin-bottom: 6px; }
  .value { font-size: 14px; color: #cbd5e1; white-space: pre-wrap; background: #0f1117; border: 1px solid #1e293b; border-radius: 8px; padding: 12px 14px; }
  img { width: 100%; border-radius: 8px; border: 1px solid #1e293b; margin-top: 8px; }
  hr { border: none; border-top: 1px solid #1e293b; margin: 24px 0; }
</style>
</head>
<body>
<h1>🔴 PRISM Bug Report</h1>
<div class="sub">Generated: ${timestamp}</div>

<div class="section">
  <div class="label">심각도</div>
  <span class="badge" style="color:${color};border-color:${color}33;background:${color}18">${severity.toUpperCase()}</span>
</div>

<div class="section">
  <div class="label">오류 유형</div>
  <div class="value">${category}</div>
</div>

<div class="section">
  <div class="label">발생 페이지</div>
  <div class="value">${currentPage}</div>
</div>

<div class="section">
  <div class="label">증상 설명</div>
  <div class="value">${description.trim().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
</div>

${steps.trim() ? `<div class="section">
  <div class="label">재현 단계</div>
  <div class="value">${steps.trim().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
</div>` : ""}

<hr />

<div class="section">
  <div class="label">화면 캡처</div>
  ${screenshot ? `<img src="${screenshot}" alt="Screenshot" />` : `<div class="value" style="color:#475569">캡처 없음</div>`}
</div>
</body>
</html>`;

            const blob = new Blob([html], { type: "text/html;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `prism-bug-${timestamp.replace(/[:.]/g, "-")}.html`;
            a.click();
            URL.revokeObjectURL(url);

            setResult({ ok: true, message: "리포트 파일이 다운로드되었습니다. 공유하거나 이메일로 전달해 주세요." });
        } catch {
            setResult({ ok: false, message: "리포트 생성 실패: 다시 시도해 주세요." });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative z-10 w-full max-w-2xl bg-[#0f1117] border border-slate-700/60 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="size-9 rounded-xl bg-red-500/15 flex items-center justify-center">
                            <Bug className="size-4 text-red-400" />
                        </div>
                        <div>
                            <p className="text-[13px] font-bold text-slate-100">오류 제보</p>
                            <p className="text-[10px] text-slate-500 font-mono">{currentPage}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors">
                        <X className="size-4" />
                    </button>
                </div>

                {result ? (
                    /* Success / Error state */
                    <div className="flex flex-col items-center justify-center gap-4 py-16 px-8">
                        {result.ok
                            ? <CheckCircle2 className="size-12 text-emerald-400" />
                            : <AlertCircle className="size-12 text-red-400" />
                        }
                        <p className="text-[13px] text-slate-200 text-center">{result.message}</p>
                        <button onClick={onClose} className="mt-2 px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm transition-colors">
                            닫기
                        </button>
                    </div>
                ) : (
                    <div className="overflow-y-auto custom-scrollbar flex-1">
                        {/* Screenshot preview */}
                        <div className="px-6 pt-5 pb-4">
                            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-2">화면 캡처</p>
                            <div className="rounded-xl overflow-hidden border border-slate-700/50 bg-slate-900/50 aspect-video flex items-center justify-center">
                                {screenshot
                                    ? <img src={screenshot} alt="Screenshot" className="w-full h-full object-contain" />
                                    : (
                                        <div className="flex flex-col items-center gap-2 text-slate-600">
                                            <ImageOff className="size-8" />
                                            <p className="text-xs">캡처 실패</p>
                                        </div>
                                    )
                                }
                            </div>
                        </div>

                        <div className="px-6 pb-6 space-y-5">
                            {/* Category */}
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2">오류 유형</label>
                                <select
                                    value={category}
                                    onChange={e => setCategory(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/60"
                                >
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            {/* Severity */}
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2">심각도</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {SEVERITIES.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => setSeverity(s.id)}
                                            className={cn(
                                                "px-3 py-2.5 rounded-xl border text-center transition-all",
                                                severity === s.id ? s.color : "border-slate-700 text-slate-500 hover:border-slate-600"
                                            )}
                                        >
                                            <p className="text-[11px] font-bold">{s.label}</p>
                                            <p className="text-[9px] mt-0.5 opacity-70">{s.desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2">
                                    증상 설명 <span className="text-red-400">*</span>
                                </label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="어떤 문제가 발생했는지 설명해 주세요."
                                    rows={4}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/60 resize-none custom-scrollbar"
                                />
                            </div>

                            {/* Steps */}
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2">
                                    재현 단계 <span className="text-slate-600">(선택)</span>
                                </label>
                                <textarea
                                    value={steps}
                                    onChange={e => setSteps(e.target.value)}
                                    placeholder={"1. 어디서\n2. 무엇을\n3. 어떻게 했을 때 발생했는지"}
                                    rows={3}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/60 resize-none custom-scrollbar"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer */}
                {!result && (
                    <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3 shrink-0">
                        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
                            취소
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={!description.trim() || submitting}
                            className={cn(
                                "px-5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all",
                                description.trim() && !submitting
                                    ? "bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30"
                                    : "bg-slate-800 text-slate-600 cursor-not-allowed"
                            )}
                        >
                            {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                            {submitting ? "생성 중..." : "리포트 다운로드"}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
