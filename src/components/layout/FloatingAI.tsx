"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, X } from "lucide-react";
import { BuilderChat } from "@/components/BuilderChat";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

export function FloatingAI() {
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();

    if (pathname === "/builder" || pathname === "/ops") return null;

    return (
        <>
            {/* Floating Button */}
            <div className="fixed bottom-8 right-8 z-50">
                <Button
                    onClick={() => setIsOpen(!isOpen)}
                    className="size-14 rounded-full bg-blue-600 hover:bg-blue-500 shadow-2xl shadow-blue-500/40 p-0 border-4 border-slate-900 group"
                >
                    {isOpen ? (
                        <X className="size-6 text-white" />
                    ) : (
                        <div className="relative">
                            <Bot className="size-7 text-white" />
                            <div className="absolute -top-1 -right-1 size-3 bg-emerald-500 rounded-full border-2 border-slate-900" />
                        </div>
                    )}
                </Button>
            </div>

            {/* Chat Window Overlay */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed bottom-28 right-8 z-50 w-[440px] h-[600px] shadow-3xl overflow-hidden rounded-3xl border border-slate-800/50 flex flex-col"
                    >
                        <BuilderChat onClose={() => setIsOpen(false)} />
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
