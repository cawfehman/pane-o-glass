import { Activity, ShieldAlert, CheckCircle } from "lucide-react";

export interface MapFiltersProps {
    mapFilter: "active" | "failed" | "failed-valid" | "completed";
    setMapFilter: (filter: "active" | "failed" | "failed-valid" | "completed") => void;
    securityScope: string;
    setSecurityScope: (val: string) => void;
}

export function MapFilters({ mapFilter, setMapFilter, securityScope, setSecurityScope }: MapFiltersProps) {
    return (
        <div className="flex justify-between items-center bg-bg-surface px-4 py-3 rounded-xl border border-border-color flex-wrap gap-4">
            {/* Visualizer Filters */}
            <div className="flex gap-2 flex-wrap">
                <button
                    onClick={() => setMapFilter("active")}
                    className={`flex items-center gap-1.5 text-[0.8rem] px-3 py-1.5 rounded-md ${mapFilter === "active" ? "btn-primary" : "btn-secondary"}`}
                >
                    <Activity size={14} /> Active Connections
                </button>
                <button
                    onClick={() => setMapFilter("failed")}
                    className={`flex items-center gap-1.5 text-[0.8rem] px-3 py-1.5 rounded-md ${mapFilter === "failed" ? "btn-primary" : "btn-secondary"}`}
                >
                    <ShieldAlert size={14} color="#ef4444" /> All Failed Attempts
                </button>
                <button
                    onClick={() => setMapFilter("failed-valid")}
                    className={`flex items-center gap-1.5 text-[0.8rem] px-3 py-1.5 rounded-md ${mapFilter === "failed-valid" ? "btn-primary" : "btn-secondary"}`}
                >
                    <ShieldAlert size={14} color="#f59e0b" /> Failed Valid Users
                </button>
                <button
                    onClick={() => setMapFilter("completed")}
                    className={`flex items-center gap-1.5 text-[0.8rem] px-3 py-1.5 rounded-md ${mapFilter === "completed" ? "btn-primary" : "btn-secondary"}`}
                >
                    <CheckCircle size={14} /> Completed Sessions
                </button>
            </div>

            {/* Time scope dropdown selector matching page layout */}
            <div className="flex items-center gap-2.5">
                <span className="text-[0.8rem] text-text-muted font-semibold">Time Filter:</span>
                <select
                    value={securityScope}
                    onChange={(e) => setSecurityScope(e.target.value)}
                    className="bg-black/20 border border-border-color text-text-primary px-3 py-1.5 rounded-md text-[0.8rem] outline-none cursor-pointer focus:border-accent-primary"
                >
                    <option value="last24hours">Last 24 Hours</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="last7days">Last 7 Days</option>
                    <option value="last14days">Last 14 Days</option>
                    <option value="last30days">Last 30 Days</option>
                </select>
            </div>
        </div>
    );
}
