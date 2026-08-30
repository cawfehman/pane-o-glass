import re

file_path = "src/components/bec/BecDashboardClient.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Locate activeTab === "url_search" section
start_marker = '{activeTab === "url_search" ? ('
end_marker = ') : ('

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx)

if start_idx == -1 or end_idx == -1:
    print("Error: Could not locate activeTab === 'url_search' block!")
    exit(1)

new_url_search_block = '''{activeTab === "url_search" ? (
                <div className="flex flex-col gap-6">
                    {/* Search Control & Metadata Box */}
                    <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col gap-4 shadow-xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                                    <Search className="w-5 h-5 text-emerald-400" />
                                    <span>Unwrapped URL & Cisco Umbrella Domain Search</span>
                                </h3>
                                <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">
                                    Search across <strong className="text-[var(--text-primary)] font-mono">{urlSearchTotalDbCount.toLocaleString()}</strong> historical unwrapped destination URLs with Cisco Umbrella Investigate domain categorization and threat reputation analytics.
                                </p>
                            </div>

                            {urlSearchResults.length > 0 && (
                                <button
                                    onClick={exportUrlSearchResultsToCsv}
                                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors shrink-0 cursor-pointer shadow-xs"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    <span>Export CSV ({urlSearchResults.length})</span>
                                </button>
                            )}
                        </div>

                        {/* Search Input Bar & Wildcard Presets */}
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                <div className="relative flex-1">
                                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                                    <input
                                        type="text"
                                        placeholder="Search domain (e.g. *.claims, *.zip, ticketsatwork.com), full URL, MID, or recipient..."
                                        value={urlSearchQuery}
                                        onChange={(e) => setUrlSearchQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && executeUrlSearch()}
                                        className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-[var(--bg-default)] border border-[var(--border-color)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500 font-mono transition-colors"
                                    />
                                    {urlSearchQuery && (
                                        <button
                                            onClick={() => { setUrlSearchQuery(""); executeUrlSearch(""); }}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                <button
                                    onClick={() => executeUrlSearch()}
                                    disabled={urlSearchLoading}
                                    className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                                >
                                    {urlSearchLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                    <span>Search URLs</span>
                                </button>
                            </div>

                            {/* Wildcard & TLD Quick Presets */}
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                                <span className="text-[var(--text-secondary)] font-semibold flex items-center gap-1">
                                    <Filter className="w-3.5 h-3.5 text-blue-400" />
                                    <span>Wildcard Presets:</span>
                                </span>
                                {[
                                    { label: "*.claims", value: "*.claims" },
                                    { label: "*.zip", value: "*.zip" },
                                    { label: "*.top", value: "*.top" },
                                    { label: "*.xyz", value: "*.xyz" },
                                    { label: "*.ru", value: "*.ru" },
                                    { label: "*.email.*", value: "*.email.*" }
                                ].map(p => (
                                    <button
                                        key={p.value}
                                        onClick={() => {
                                            setUrlSearchQuery(p.value);
                                            executeUrlSearch(p.value);
                                        }}
                                        className="px-2.5 py-1 rounded-md bg-[var(--bg-default)] hover:bg-[var(--bg-surface-hover)] text-blue-400 border border-blue-500/20 font-mono font-bold transition-colors cursor-pointer"
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Results Summary Metadata Bar */}
                        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-mono border-t border-[var(--border-color)] pt-3 flex-wrap gap-2">
                            <div className="flex items-center gap-3 flex-wrap">
                                <span>
                                    {urlSearchQuery ? (
                                        <>Matches: <strong className="text-[var(--text-primary)] font-bold">{urlSearchTotalMatches.toLocaleString()}</strong> (Displaying top {urlSearchResults.length})</>
                                    ) : (
                                        <>Displaying <strong>500 Most Recently Unwrapped URLs</strong> (Out of <strong className="text-[var(--text-primary)] font-bold">{urlSearchTotalDbCount.toLocaleString()}</strong> total in database)</>
                                    )}
                                </span>
                            </div>

                            {urlSearchSpeedMs !== null && (
                                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                    <Zap className="w-3.5 h-3.5" />
                                    <span>Query & Cisco Umbrella Enrichment executed in {urlSearchSpeedMs}ms</span>
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Cisco Umbrella Threat Analytics Charts & Categorization Breakdown */}
                    {urlSearchUmbrellaSummary && urlSearchResults.length > 0 && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {/* Card 1: Domain Reputation Distribution */}
                            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col gap-3 shadow-xs">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                                        <ShieldAlert className="w-4 h-4 text-red-400" />
                                        Cisco Umbrella Reputation
                                    </span>
                                    <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                                        {urlSearchUmbrellaSummary.totalEvaluated} Domains Evaluated
                                    </span>
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-center my-1">
                                    <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                                        <div className="text-xl font-black text-red-400">{urlSearchUmbrellaSummary.maliciousCount}</div>
                                        <div className="text-[10px] font-bold text-red-300 uppercase">Malicious</div>
                                    </div>
                                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                        <div className="text-xl font-black text-emerald-400">{urlSearchUmbrellaSummary.benignCount}</div>
                                        <div className="text-[10px] font-bold text-emerald-300 uppercase">Benign / Safe</div>
                                    </div>
                                    <div className="p-2.5 rounded-lg bg-[var(--bg-default)] border border-[var(--border-color)]">
                                        <div className="text-xl font-black text-[var(--text-primary)]">{urlSearchUmbrellaSummary.unccategorizedCount}</div>
                                        <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Uncategorized</div>
                                    </div>
                                </div>

                                {/* Visual Proportion Bar */}
                                <div className="w-full h-2.5 rounded-full bg-[var(--bg-default)] overflow-hidden flex">
                                    {urlSearchUmbrellaSummary.totalEvaluated > 0 && (
                                        <>
                                            <div 
                                                style={{ width: `${(urlSearchUmbrellaSummary.maliciousCount / urlSearchUmbrellaSummary.totalEvaluated) * 100}%` }} 
                                                className="bg-red-500 h-full" 
                                                title="Malicious Domains"
                                            />
                                            <div 
                                                style={{ width: `${(urlSearchUmbrellaSummary.benignCount / urlSearchUmbrellaSummary.totalEvaluated) * 100}%` }} 
                                                className="bg-emerald-500 h-full" 
                                                title="Benign Domains"
                                            />
                                            <div 
                                                style={{ width: `${(urlSearchUmbrellaSummary.unccategorizedCount / urlSearchUmbrellaSummary.totalEvaluated) * 100}%` }} 
                                                className="bg-slate-600 h-full" 
                                                title="Uncategorized Domains"
                                            />
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Card 2: Cisco Umbrella Security Threat Categories */}
                            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col gap-2.5 shadow-xs">
                                <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                                    <Key className="w-4 h-4 text-amber-400" />
                                    Top Security Threat Categories
                                </span>
                                {Object.keys(urlSearchUmbrellaSummary.securityCategoriesBreakdown).length === 0 ? (
                                    <div className="text-xs text-[var(--text-secondary)] italic py-4 text-center">
                                        No active security threats flagged by Cisco Umbrella in this set.
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2 my-1">
                                        {Object.entries(urlSearchUmbrellaSummary.securityCategoriesBreakdown as Record<string, number>)
                                            .sort((a, b) => b[1] - a[1])
                                            .slice(0, 4)
                                            .map(([cat, count]) => (
                                                <div key={cat} className="flex flex-col gap-1">
                                                    <div className="flex items-center justify-between text-xs font-mono">
                                                        <span className="text-amber-400 font-semibold">{cat}</span>
                                                        <span className="text-[var(--text-secondary)]">{count} domains</span>
                                                    </div>
                                                    <div className="w-full h-1.5 rounded-full bg-[var(--bg-default)] overflow-hidden">
                                                        <div 
                                                            style={{ width: `${Math.min(100, (count / urlSearchResults.length) * 100)}%` }} 
                                                            className="bg-amber-500 h-full rounded-full" 
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>

                            {/* Card 3: Domain Content Categories */}
                            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col gap-2.5 shadow-xs">
                                <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                                    <Globe className="w-4 h-4 text-blue-400" />
                                    Top Domain Content Categories
                                </span>
                                <div className="flex flex-col gap-2 my-1">
                                    {Object.entries(urlSearchUmbrellaSummary.contentCategoriesBreakdown as Record<string, number>)
                                        .sort((a, b) => b[1] - a[1])
                                        .slice(0, 4)
                                        .map(([cat, count]) => (
                                            <div key={cat} className="flex flex-col gap-1">
                                                <div className="flex items-center justify-between text-xs font-mono">
                                                    <span className="text-blue-400 font-semibold truncate max-w-[200px]">{cat}</span>
                                                    <span className="text-[var(--text-secondary)]">{count} domains</span>
                                                </div>
                                                <div className="w-full h-1.5 rounded-full bg-[var(--bg-default)] overflow-hidden">
                                                    <div 
                                                        style={{ width: `${Math.min(100, (count / urlSearchResults.length) * 100)}%` }} 
                                                        className="bg-blue-500 h-full rounded-full" 
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Results Table */}
                    <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] overflow-hidden shadow-xs">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-[var(--border-color)] bg-[var(--bg-default)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                                        <th className="p-3">Timestamp</th>
                                        <th className="p-3">Domain (Target Host)</th>
                                        <th className="p-3">Cisco Umbrella Threat & Categorization</th>
                                        <th className="p-3">Domain Age / NOD Risk</th>
                                        <th className="p-3">Unwrapped Destination URL</th>
                                        <th className="p-3 text-right">Message Context</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-color)] text-xs">
                                    {urlSearchLoading ? (
                                        <tr>
                                            <td colSpan={6} className="p-8 text-center text-sm text-[var(--text-secondary)]">
                                                Querying 500,000+ unwrapped URLs & performing Cisco Umbrella threat categorization...
                                            </td>
                                        </tr>
                                    ) : urlSearchResults.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="p-8 text-center text-sm text-[var(--text-secondary)]">
                                                {hasSearchedUrls ? "No unwrapped URLs match your search query." : "Enter a domain (e.g. *.claims), URL substring, MID, or recipient email to search."}
                                            </td>
                                        </tr>
                                    ) : (
                                        urlSearchResults.map((item) => {
                                            const isExpanded = expandedRowId === item.id;
                                            return (
                                                <React.Fragment key={item.id}>
                                                    <tr className="hover:bg-[var(--bg-default)]/60 transition-colors">
                                                        <td className="p-3 text-[var(--text-secondary)] font-mono whitespace-nowrap">
                                                            {new Date(item.createdAt).toLocaleString()}
                                                        </td>

                                                        {/* Domain / Target Host */}
                                                        <td className="p-3 font-mono font-bold text-[var(--text-primary)] whitespace-nowrap">
                                                            <span 
                                                                onClick={() => { setUrlSearchQuery(item.targetHost); executeUrlSearch(item.targetHost); }}
                                                                className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 cursor-pointer transition-colors"
                                                                title="Click to filter search by this domain"
                                                            >
                                                                {item.targetHost}
                                                            </span>
                                                        </td>

                                                        {/* Cisco Umbrella Reputation & Categorization */}
                                                        <td className="p-3 font-mono max-w-[280px]">
                                                            <div className="flex flex-col gap-1 items-start">
                                                                {/* Reputation Badge */}
                                                                {item.umbrellaStatus === -1 ? (
                                                                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1" title="Flagged Malicious by Cisco Umbrella Investigate">
                                                                        <ShieldAlert className="w-3 h-3 text-red-400" />
                                                                        <span>🔴 MALICIOUS</span>
                                                                    </span>
                                                                ) : item.umbrellaStatus === 1 ? (
                                                                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title="Benign / Clean Domain per Cisco Umbrella">
                                                                        🟢 BENIGN
                                                                    </span>
                                                                ) : (
                                                                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--bg-default)] text-[var(--text-secondary)] border border-[var(--border-color)]">
                                                                        ⚪ UNCATEGORIZED
                                                                    </span>
                                                                )}

                                                                {/* Security & Content Category Pills */}
                                                                <div className="flex items-center gap-1 flex-wrap text-[10px]">
                                                                    {item.umbrellaSecurityCategories && item.umbrellaSecurityCategories.map((secCat: string) => (
                                                                        <span key={secCat} className="px-1.5 py-0.2 rounded bg-red-500/20 text-red-300 font-bold">
                                                                            {secCat}
                                                                        </span>
                                                                    ))}
                                                                    {item.umbrellaCategories && item.umbrellaCategories.slice(0, 2).map((cat: string) => (
                                                                        <span key={cat} className="px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                                                                            {cat}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </td>

                                                        {/* Domain Age / NOD & Frequency Risk Status */}
                                                        <td className="p-3 font-mono whitespace-nowrap">
                                                            <div className="flex flex-col gap-1 items-start">
                                                                {item.isNewlyObserved24h ? (
                                                                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-500/10 text-red-400 border border-red-500/20" title="First unwrapped in your emails in the last 24 hours">
                                                                        🆕 FIRST SEEN &lt;24H
                                                                    </span>
                                                                ) : item.isNewlyObserved7d ? (
                                                                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20" title="First unwrapped in your emails in the last 7 days">
                                                                        ⚠️ FIRST SEEN &lt;7D
                                                                    </span>
                                                                ) : item.isRareLowFrequency ? (
                                                                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20" title={'Established domain (>30d), BUT only seen 3 times or fewer across 500,000 unwrapped URLs! High potential anomaly/phish.'}>
                                                                        🚨 RARE (Seen {item.totalSeenCount}x)
                                                                    </span>
                                                                ) : (
                                                                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--bg-default)] text-[var(--text-secondary)] border border-[var(--border-color)]">
                                                                        Established ({item.ageDays || 0}d)
                                                                    </span>
                                                                )}
                                                                <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                                                                    Seen {item.totalSeenCount ? item.totalSeenCount.toLocaleString() : 1}x total
                                                                </span>
                                                            </div>
                                                        </td>

                                                        {/* Unwrapped Destination URL */}
                                                        <td className="p-3 font-mono max-w-[340px]">
                                                            <div className="flex items-center gap-1.5 group">
                                                                <a
                                                                    href={item.destUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-blue-400 hover:underline truncate group-hover:text-blue-300 font-medium"
                                                                    title={item.destUrl}
                                                                >
                                                                    {item.destUrl}
                                                                </a>
                                                                <a
                                                                    href={item.destUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                                                    title="Open URL in new tab"
                                                                >
                                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                                </a>
                                                            </div>
                                                        </td>

                                                        {/* Message Context Expander Button */}
                                                        <td className="p-3 text-right whitespace-nowrap">
                                                            <button
                                                                onClick={() => setExpandedRowId(isExpanded ? null : item.id)}
                                                                className="px-2.5 py-1 rounded bg-[var(--bg-default)] hover:bg-[var(--bg-surface-hover)] text-xs font-semibold text-blue-400 border border-[var(--border-color)] transition-colors cursor-pointer"
                                                            >
                                                                {isExpanded ? "Hide Details 🔼" : "View Message 🔽"}
                                                            </button>
                                                        </td>
                                                    </tr>

                                                    {/* Expanded Message Context Drawer */}
                                                    {isExpanded && (
                                                        <tr className="bg-blue-950/20 border-b border-[var(--border-color)]">
                                                            <td colSpan={6} className="p-4">
                                                                <div className="p-3.5 rounded-lg bg-[var(--bg-default)] border border-blue-500/30 flex flex-col gap-2 font-mono text-xs">
                                                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">
                                                                                Message MID: {item.mid}
                                                                            </span>
                                                                            <span className="text-[var(--text-secondary)]">|</span>
                                                                            <span className="text-emerald-400 font-semibold">
                                                                                Target Inbox: {item.recipient || "unknown"}
                                                                            </span>
                                                                        </div>
                                                                        <a
                                                                            href={`/queries/ironport?query=esa_mid:${item.mid}`}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs inline-flex items-center gap-1 transition-colors"
                                                                        >
                                                                            <span>Trace MID in ESA</span>
                                                                            <ExternalLink className="w-3 h-3" />
                                                                        </a>
                                                                    </div>

                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                                                        <div>
                                                                            <span className="text-[var(--text-secondary)] font-semibold">Sender Email: </span>
                                                                            <span className="text-[var(--text-primary)]">{item.sender || "unknown"}</span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-[var(--text-secondary)] font-semibold">Email Subject: </span>
                                                                            <span className="text-[var(--text-primary)] font-bold">{item.subject || "No Subject"}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : ('''

updated_content = content[:start_idx] + new_url_search_block + content[end_idx:]

with open(file_path, "w", encoding="utf-8") as f:
    f.write(updated_content)

print("Replaced URL Search view with Cisco Umbrella Threat Intelligence & Charts!")
