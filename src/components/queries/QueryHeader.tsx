import { ToolHelp } from "@/components/ToolHelp";
import React from "react";

interface QueryHeaderProps {
    title: string;
    description: string;
    toolId?: string;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
}

export function QueryHeader({ title, description, toolId, icon, actions }: QueryHeaderProps) {
    return (
        <div className="flex justify-between items-start mb-6 border-b border-[rgba(255,255,255,0.05)] pb-4 flex-wrap gap-4">
            <div>
                <h1 className="flex items-center gap-3 text-[2.2rem] font-[900] mb-2 leading-tight">
                    {icon && <span className="text-accent-primary flex items-center">{icon}</span>}
                    {title}
                    {toolId && <ToolHelp toolId={toolId} iconSize={24} />}
                </h1>
                <p className="text-text-secondary text-[0.95rem] max-w-[800px]">{description}</p>
            </div>
            {actions && (
                <div className="flex items-center gap-3">
                    {actions}
                </div>
            )}
        </div>
    );
}
