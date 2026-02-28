"use client";

import { useChat } from '@ai-sdk/react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Send, Bot, User } from 'lucide-react';
import { clsx } from 'clsx';
import { MarkdownText } from "@/components/MarkdownText";

export function BuilderChat({ onClose }: { onClose: () => void }) {
    const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat();

    return (
        <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800 shadow-2xl w-[400px]">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-md">
                <div className="flex items-center gap-2">
                    <Bot className="w-5 h-5 text-indigo-400" />
                    <h2 className="font-semibold">PRISM AI Builder</h2>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
            </div>

            <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                    {messages.length === 0 && (
                        <div className="text-center py-8 px-4">
                            <Bot className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                            <p className="text-slate-400 text-sm">
                                Ask me to find logs or create dashboard widgets.
                                <br />&quot;Show me all SSH login failures in the last 10 minutes&quot;
                            </p>
                        </div>
                    )}
                    {messages.map((m) => (
                        <div key={m.id} className={clsx(
                            "flex flex-col gap-2",
                            m.role === 'user' ? "items-end" : "items-start"
                        )}>
                            <div className="flex items-center gap-2 px-1">
                                {m.role === 'user' ? (
                                    <>
                                        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">User</span>
                                        <div className="size-6 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                                            <User className="w-3 h-3 text-slate-300" />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="size-6 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                                            <Bot className="w-3 h-3 text-white" />
                                        </div>
                                        <span className="text-[10px] uppercase tracking-widest text-blue-400 font-bold">AI Response</span>
                                    </>
                                )}
                            </div>
                            <div className={clsx(
                                "p-4 rounded-2xl text-sm shadow-sm max-w-[90%]",
                                m.role === 'user'
                                    ? "bg-slate-800 text-slate-100 rounded-tr-none border border-slate-700/50"
                                    : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none"
                            )}>
                                {m.role === 'user' ? m.content : <MarkdownText text={m.content} />}
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>

            <form onSubmit={handleSubmit} className="p-4 border-t border-slate-800 bg-slate-900/50">
                <div className="relative">
                    <Input
                        value={input}
                        onChange={handleInputChange}
                        placeholder="Type a message..."
                        className="pr-12 bg-slate-950 border-slate-700 h-11 focus:ring-indigo-500"
                    />
                    <Button
                        type="submit"
                        size="icon"
                        disabled={isLoading || !input}
                        className="absolute right-1 top-1 w-9 h-9 bg-indigo-600 hover:bg-indigo-500"
                    >
                        <Send className="w-4 h-4" />
                    </Button>
                </div>
            </form>
        </div>
    );
}
