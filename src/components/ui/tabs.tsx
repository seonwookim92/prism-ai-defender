"use client";

import * as React from "react"
import { cn } from "@/lib/utils"

const TabsContext = React.createContext<{
    value: string;
    onValueChange: (value: string) => void;
} | null>(null);

function Tabs({
    defaultValue,
    value: controlledValue,
    onValueChange: controlledOnValueChange,
    className,
    children,
    ...props
}: {
    defaultValue?: string;
    value?: string;
    onValueChange?: (value: string) => void;
    className?: string;
    children: React.ReactNode;
}) {
    const [internalValue, setInternalValue] = React.useState(defaultValue || "");
    const value = controlledValue !== undefined ? controlledValue : internalValue;
    const onValueChange = controlledOnValueChange || setInternalValue;

    return (
        <TabsContext.Provider value={{ value, onValueChange }}>
            <div className={cn("w-full", className)} {...props}>
                {children}
            </div>
        </TabsContext.Provider>
    )
}

function TabsList({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            className={cn(
                "inline-flex h-10 items-center justify-center rounded-md bg-slate-100 p-1 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                className
            )}
            {...props}
        />
    )
}

function TabsTrigger({
    value,
    className,
    ...props
}: React.ComponentProps<"button"> & { value: string }) {
    const context = React.useContext(TabsContext);
    if (!context) return null;

    const isActive = context.value === value;

    return (
        <button
            onClick={() => context.onValueChange(value)}
            className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:ring-offset-slate-950 dark:focus-visible:ring-slate-300",
                isActive
                    ? "bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-slate-50"
                    : "hover:text-slate-900 dark:hover:text-slate-100",
                className
            )}
            {...props}
        />
    )
}

function TabsContent({
    value,
    className,
    ...props
}: React.ComponentProps<"div"> & { value: string }) {
    const context = React.useContext(TabsContext);
    if (!context || context.value !== value) return null;

    return (
        <div
            className={cn(
                "mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 dark:ring-offset-slate-950 dark:focus-visible:ring-slate-300",
                className
            )}
            {...props}
        />
    )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
