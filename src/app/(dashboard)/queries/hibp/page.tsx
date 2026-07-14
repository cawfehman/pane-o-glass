import Link from "next/link";
import { Lock } from "lucide-react";
import { QueryHeader } from "@/components/queries/QueryHeader";

export default function HIBPQueryPage() {
    return (
        <div className="internal-scroll-layout">
            <div className="shrink-0 flex flex-col gap-4">
                <QueryHeader
                    title="Have I Been Pwned Utilities"
                    description="Check if your accounts, passwords, or company domains have been compromised in data breaches."
                    icon={<Lock size={32} />}
                />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 pb-6">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-8">
                <Link href="/queries/hibp/account" className="no-underline">
                    <div className="glass-card h-full cursor-pointer transition-colors duration-200 border border-transparent">
                        <div className="flex items-center mb-4 gap-3">
                            <div className="bg-blue-500/10 p-3 rounded-full">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                    <polyline points="22,6 12,13 2,6"></polyline>
                                </svg>
                            </div>
                            <h3 className="m-0">Account Security</h3>
                        </div>
                        <p className="text-text-muted">
                            Contains the Email & Account Check as well as the Secure Password Risk Check (using k-Anonymity privacy protocols) for individual monitoring.
                        </p>
                    </div>
                </Link>

                <Link href="/queries/hibp/domain" className="no-underline">
                    <div className="glass-card h-full cursor-pointer transition-colors duration-200 border border-transparent">
                        <div className="flex items-center mb-4 gap-3">
                            <div className="bg-blue-500/10 p-3 rounded-full">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                                    <line x1="8" y1="21" x2="16" y2="21"></line>
                                    <line x1="12" y1="17" x2="12" y2="21"></line>
                                </svg>
                            </div>
                            <h3 className="m-0">Domain Security</h3>
                        </div>
                        <p className="text-text-muted">
                            Aggregate tools for corporate domains. Features the complete Domain Breach Check and a targeted Breach Name reverse search.
                        </p>
                    </div>
                </Link>
                </div>
            </div>
        </div>
    );
}
