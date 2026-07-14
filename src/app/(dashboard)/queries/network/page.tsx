import Link from "next/link";

export default function NetworkToolsPage() {
    return (
        <div className="internal-scroll-layout">
            <div className="shrink-0 flex flex-col gap-4">
                <div className="mb-8">
                    <h1>Network Tools</h1>
                    <p className="text-text-secondary">Centralized utilities for interacting with your network infrastructure.</p>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 pb-6">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-8">
                    <Link href="/queries/firewall" className="no-underline">
                        <div className="glass-card h-full cursor-pointer transition-colors duration-200 border border-transparent">
                            <div className="flex items-center mb-4 gap-3">
                                <div className="bg-blue-500/10 p-3 rounded-full">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                                        <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                                        <line x1="6" y1="6" x2="6" y2="6"></line>
                                        <line x1="6" y1="18" x2="6" y2="18"></line>
                                    </svg>
                                </div>
                                <h3 className="m-0">Cisco Firewall Utilities</h3>
                            </div>
                            <p className="text-text-muted">
                                Securely query and remove IPv4 shuns across your configured Cisco Firewalls directly from the dashboard.
                            </p>
                        </div>
                    </Link>
                </div>
            </div>
        </div>
    );
}
