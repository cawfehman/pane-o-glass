import Link from "next/link";
import { Activity, Network, ShieldAlert } from "lucide-react";
import { QueryHeader } from "@/components/queries/QueryHeader";
import { auth } from "@/lib/auth";

export default async function NetworkToolsPage() {
    const session = await auth();
    const isAdmin = (session?.user as any)?.role === 'ADMIN';

    return (
        <div className="internal-scroll-layout">
            <div className="shrink-0 flex flex-col gap-4">
                <QueryHeader
                    title="Network Tools"
                    description="Centralized utilities for interacting with your network infrastructure."
                    icon={<Activity size={32} />}
                />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 pb-6">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-8">
                    <Link href="/queries/firewall" className="no-underline">
                        <div className="glass-card h-full cursor-pointer transition-colors duration-200 border border-transparent hover:border-accent-primary">
                            <div className="flex items-center mb-4 gap-3">
                                <div className="bg-blue-500/10 p-3 rounded-full">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                                        <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                                        <line x1="6" y1="6" x2="6" y2="6"></line>
                                        <line x1="6" y1="18" x2="6" y2="18"></line>
                                    </svg>
                                </div>
                                <h3 className="m-0 text-text-primary">Cisco Firewall Utilities</h3>
                            </div>
                            <p className="text-text-muted text-xs leading-relaxed">
                                Securely query and remove IPv4 shuns across your configured Cisco Firewalls directly from the dashboard.
                            </p>
                        </div>
                    </Link>

                    {isAdmin ? (
                        <Link href="/admin/crawler" className="no-underline">
                            <div className="glass-card h-full cursor-pointer transition-colors duration-200 border border-transparent hover:border-cyan-400">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-cyan-500/10 p-3 rounded-full text-cyan-400">
                                            <Network size={24} />
                                        </div>
                                        <h3 className="m-0 text-text-primary">Cisco Network Crawler & Path Tracer</h3>
                                    </div>
                                    <span className="px-2 py-0.5 rounded text-[0.65rem] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                        Admin Only
                                    </span>
                                </div>
                                <p className="text-text-muted text-xs leading-relaxed">
                                    Autonomous Cisco IOS BFS crawler, interactive multi-site topology maps, historical snapshots, and hop-by-hop packet forwarding simulator.
                                </p>
                            </div>
                        </Link>
                    ) : (
                        <div className="glass-card h-full opacity-60 border border-border-color cursor-not-allowed">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="bg-white/5 p-3 rounded-full text-text-muted">
                                        <Network size={24} />
                                    </div>
                                    <h3 className="m-0 text-text-muted">Cisco Network Crawler</h3>
                                </div>
                                <span className="px-2 py-0.5 rounded text-[0.65rem] font-bold uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/30">
                                    Restricted
                                </span>
                            </div>
                            <p className="text-text-muted text-xs leading-relaxed">
                                Cisco IOS infrastructure topology discovery and packet path simulation. Requires Administrator privileges.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
