"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders LLM markdown output with proper styling for the dark UI.
 * Handles: bold, italic, inline code, lists, headings, blockquotes, tables, links.
 * Does NOT handle fenced code blocks — those are handled by the caller's custom renderer.
 */
export function MarkdownText({ text }: { text: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                p: ({ children }) => (
                    <p className="mb-2 last:mb-0 leading-relaxed font-normal">{children}</p>
                ),
                strong: ({ children }) => (
                    <strong className="font-bold text-white">{children}</strong>
                ),
                em: ({ children }) => (
                    <em className="italic text-slate-300">{children}</em>
                ),
                del: ({ children }) => (
                    <del className="line-through text-slate-500">{children}</del>
                ),
                // Inline code only — fenced code blocks handled upstream
                code: ({ children, className }) => {
                    if (!className) {
                        return (
                            <code className="px-1.5 py-0.5 bg-slate-800 rounded text-[11px] font-mono text-blue-300 border border-slate-700/50">
                                {children}
                            </code>
                        );
                    }
                    return <code className={className}>{children}</code>;
                },
                ul: ({ children }) => (
                    <ul className="list-disc list-outside ml-6 space-y-1 mb-4 text-slate-200">
                        {children}
                    </ul>
                ),
                ol: ({ children }) => (
                    <ol className="list-decimal list-outside ml-6 space-y-1 mb-4 text-slate-200">
                        {children}
                    </ol>
                ),
                li: ({ children }) => (
                    <li className="text-slate-200 leading-relaxed mb-1 last:mb-0">
                        {React.Children.map(children, child => {
                            if (React.isValidElement(child) && child.type === 'p') {
                                return (child.props as any).children;
                            }
                            return child;
                        })}
                    </li>
                ),
                h1: ({ children }) => (
                    <h1 className="text-base font-bold text-white mt-4 mb-2 pb-1 border-b border-slate-700/50">
                        {children}
                    </h1>
                ),
                h2: ({ children }) => (
                    <h2 className="text-sm font-bold text-white mt-3 mb-1.5">{children}</h2>
                ),
                h3: ({ children }) => (
                    <h3 className="text-[13px] font-bold text-slate-100 mt-2 mb-1">{children}</h3>
                ),
                h4: ({ children }) => (
                    <h4 className="text-[13px] font-semibold text-slate-200 mt-2 mb-1">{children}</h4>
                ),
                a: ({ href, children }) => (
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                    >
                        {children}
                    </a>
                ),
                blockquote: ({ children }) => (
                    <blockquote className="pl-3 border-l-2 border-slate-600 text-slate-400 italic my-2">
                        {children}
                    </blockquote>
                ),
                hr: () => <hr className="border-slate-700 my-3" />,
                table: ({ children }) => (
                    <div className="overflow-x-auto my-2">
                        <table className="text-xs border-collapse border border-slate-700 w-full">
                            {children}
                        </table>
                    </div>
                ),
                thead: ({ children }) => (
                    <thead className="bg-slate-800/80">{children}</thead>
                ),
                th: ({ children }) => (
                    <th className="border border-slate-700 px-3 py-1.5 text-left font-bold text-slate-300">
                        {children}
                    </th>
                ),
                td: ({ children }) => (
                    <td className="border border-slate-700 px-3 py-1.5 text-slate-300">
                        {children}
                    </td>
                ),
            }}
        >
            {text}
        </ReactMarkdown>
    );
}
