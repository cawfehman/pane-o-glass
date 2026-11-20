"use client";

import { useState, useEffect, useCallback } from "react";
import { 
    Key, Shield, Plus, Trash2, Check, Copy, RefreshCw, 
    AlertTriangle, Server, User, Clock, CheckCircle2, 
    X, ExternalLink, Network, FileCode2, ChevronRight, Ban
} from "lucide-react";

interface ApiKeyRecord {
    id: string;
    name: string;
    type: "SERVICE" | "PERSONAL";
    keyPrefix: string;
    scopes: string[];
    allowedIps: string | null;
    isActive: boolean;
    lastUsedAt: string | null;
    expiresAt: string | null;
    createdBy: string;
    createdAt: string;
    user?: {
        id: string;
        username: string;
        firstName?: string | null;
        lastName?: string | null;
    } | null;
}

interface ScopeOption {
    id: string;
    label: string;
    description: string;
}

export default function ApiKeysPage() {
    const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
    const [scopes, setScopes] = useState<ScopeOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Create Modal State
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    const [formName, setFormName] = useState("");
    const [formType, setFormType] = useState<"SERVICE" | "PERSONAL">("SERVICE");
    const [formScopes, setFormScopes] = useState<string[]>(["shun:read"]);
    const [formAllowedIps, setFormAllowedIps] = useState("");
    const [formExpiresInDays, setFormExpiresInDays] = useState<number>(0);

    // Newly Generated Key Display Modal
    const [newlyCreatedKey, setNewlyCreatedKey] = useState<any | null>(null);
    const [copiedKey, setCopiedKey] = useState(false);

    // Revoke Confirmation State
    const [keyToRevoke, setKeyToRevoke] = useState<ApiKeyRecord | null>(null);
    const [revokeLoading, setRevokeLoading] = useState(false);

    const fetchKeys = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/api-keys");
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            const data = await res.json();
            setKeys(data.keys || []);
            setScopes(data.availableScopes || []);
        } catch (err: any) {
            setError(err.message || "Failed to load API keys.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchKeys();
    }, [fetchKeys]);

    const handleToggleActive = async (key: ApiKeyRecord) => {
        try {
            const res = await fetch(`/api/admin/api-keys/${key.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !key.isActive })
            });
            if (res.ok) {
                setKeys(prev => prev.map(k => k.id === key.id ? { ...k, isActive: !k.isActive } : k));
            }
        } catch (err) {
            console.error("Failed to toggle key status:", err);
        }
    };

    const handleCreateKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formName.trim()) {
            setCreateError("Please enter a name or description for this key.");
            return;
        }

        setCreateLoading(true);
        setCreateError(null);

        try {
            const res = await fetch("/api/admin/api-keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formName.trim(),
                    type: formType,
                    scopes: formScopes,
                    allowedIps: formAllowedIps.trim() || null,
                    expiresInDays: formExpiresInDays > 0 ? formExpiresInDays : null
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to create API key.");
            }

            setNewlyCreatedKey(data.key);
            setShowCreateModal(false);
            setFormName("");
            setFormScopes(["shun:read"]);
            setFormAllowedIps("");
            setFormExpiresInDays(0);
            fetchKeys();
        } catch (err: any) {
            setCreateError(err.message || "Failed to create API key.");
        } finally {
            setCreateLoading(false);
        }
    };

    const handleRevokeKey = async () => {
        if (!keyToRevoke) return;
        setRevokeLoading(true);
        try {
            const res = await fetch(`/api/admin/api-keys/${keyToRevoke.id}`, {
                method: "DELETE"
            });
            if (res.ok) {
                setKeys(prev => prev.filter(k => k.id !== keyToRevoke.id));
                setKeyToRevoke(null);
            }
        } catch (err) {
            console.error("Failed to revoke key:", err);
        } finally {
            setRevokeLoading(false);
        }
    };

    const handleCopyNewKey = () => {
        if (newlyCreatedKey?.rawKey) {
            navigator.clipboard.writeText(newlyCreatedKey.rawKey);
            setCopiedKey(true);
            setTimeout(() => setCopiedKey(false), 2500);
        }
    };

    const toggleScope = (scopeId: string) => {
        setFormScopes(prev => 
            prev.includes(scopeId) ? prev.filter(s => s !== scopeId) : [...prev, scopeId]
        );
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-color)]">
                <div>
                    <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
                        <Key className="w-5 h-5 text-indigo-400" />
                        API Credentials & Machine Integrations
                    </h1>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                        Issue and manage scoped API keys for external services (Graylog, SOAR, Python automation) with source IP access control lists.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={fetchKeys}
                        disabled={loading}
                        className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-xs font-semibold text-[var(--text-secondary)] hover:text-white transition-colors flex items-center gap-1.5"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowCreateModal(true)}
                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 cursor-pointer"
                    >
                        <Plus className="w-4 h-4" />
                        Issue New API Key
                    </button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
                    <div className="text-[11px] text-[var(--text-muted)] font-semibold uppercase">Active Keys</div>
                    <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                        {keys.filter(k => k.isActive).length}
                    </div>
                </div>
                <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
                    <div className="text-[11px] text-[var(--text-muted)] font-semibold uppercase">Service (Machine) Keys</div>
                    <div className="text-xl font-bold font-mono text-indigo-400 mt-1">
                        {keys.filter(k => k.type === "SERVICE").length}
                    </div>
                </div>
                <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
                    <div className="text-[11px] text-[var(--text-muted)] font-semibold uppercase">Personal Tokens</div>
                    <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                        {keys.filter(k => k.type === "PERSONAL").length}
                    </div>
                </div>
                <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
                    <div className="text-[11px] text-[var(--text-muted)] font-semibold uppercase">Available Scopes</div>
                    <div className="text-xl font-bold font-mono text-sky-400 mt-1">
                        {scopes.length}
                    </div>
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* API Keys Table */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 bg-[var(--bg-default)] border-b border-[var(--border-color)] flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                        Registered API Credentials ({keys.length})
                    </h2>
                    <span className="text-[11px] font-mono text-[var(--text-muted)]">
                        Stored with SHA-256 cryptographic hashing
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-[var(--border-color)] bg-[var(--bg-default)]/60 text-[var(--text-muted)] uppercase text-[10px]">
                                <th className="px-5 py-3 font-semibold">Name / Type</th>
                                <th className="px-5 py-3 font-semibold">Key Identifier</th>
                                <th className="px-5 py-3 font-semibold">Granted Scopes</th>
                                <th className="px-5 py-3 font-semibold">Source IP Whitelist</th>
                                <th className="px-5 py-3 font-semibold">Last Used</th>
                                <th className="px-5 py-3 font-semibold">Status</th>
                                <th className="px-5 py-3 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-color)] font-mono">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                                        Loading credentials...
                                    </td>
                                </tr>
                            ) : keys.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                                        <Key className="w-8 h-8 mx-auto mb-2 opacity-30 text-indigo-400" />
                                        No API keys configured yet. Click "Issue New API Key" above to generate your first credential.
                                    </td>
                                </tr>
                            ) : (
                                keys.map(k => (
                                    <tr key={k.id} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                                        {/* Name / Type */}
                                        <td className="px-5 py-3.5">
                                            <div className="font-sans font-bold text-slate-100 flex items-center gap-1.5">
                                                {k.type === "SERVICE" ? (
                                                    <Server className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                                ) : (
                                                    <User className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                                )}
                                                <span>{k.name}</span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-sans">
                                                <span className={`px-1.5 py-0.2 rounded font-mono uppercase text-[9px] font-bold ${
                                                    k.type === "SERVICE" ? "bg-indigo-500/15 text-indigo-300" : "bg-amber-500/15 text-amber-300"
                                                }`}>
                                                    {k.type}
                                                </span>
                                                <span>by {k.createdBy}</span>
                                            </div>
                                        </td>

                                        {/* Prefix */}
                                        <td className="px-5 py-3.5 text-slate-300">
                                            <span className="bg-slate-900 px-2 py-1 rounded border border-slate-800 text-[11px]">
                                                {k.keyPrefix}
                                            </span>
                                        </td>

                                        {/* Scopes */}
                                        <td className="px-5 py-3.5">
                                            <div className="flex flex-wrap gap-1 max-w-[220px]">
                                                {k.scopes.map(s => (
                                                    <span key={s} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                                                        {s}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>

                                        {/* Allowed IPs */}
                                        <td className="px-5 py-3.5">
                                            {k.allowedIps ? (
                                                <div className="flex items-center gap-1 text-emerald-400 text-[11px]" title={k.allowedIps}>
                                                    <Network className="w-3 h-3 shrink-0" />
                                                    <span className="truncate max-w-[150px]">{k.allowedIps}</span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-500 text-[11px]">Any (No ACL)</span>
                                            )}
                                        </td>

                                        {/* Last Used */}
                                        <td className="px-5 py-3.5 text-slate-400 text-[11px]">
                                            {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}
                                        </td>

                                        {/* Active Status Toggle */}
                                        <td className="px-5 py-3.5">
                                            <button
                                                type="button"
                                                onClick={() => handleToggleActive(k)}
                                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                                                    k.isActive
                                                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30"
                                                        : "bg-slate-800 text-slate-500 border border-slate-700 hover:text-slate-300"
                                                }`}
                                            >
                                                {k.isActive ? "ACTIVE" : "DISABLED"}
                                            </button>
                                        </td>

                                        {/* Actions */}
                                        <td className="px-5 py-3.5 text-right font-sans">
                                            <button
                                                type="button"
                                                onClick={() => setKeyToRevoke(k)}
                                                className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                                                title="Revoke and permanently delete key"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Quick Developer Documentation */}
            <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                    <FileCode2 className="w-4 h-4" />
                    <span>How to Use with Graylog, Python, or cURL</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    Call <code className="text-indigo-300 font-mono">/api/v1/ip-metadata</code> (or <code className="text-indigo-300 font-mono">/api/v1/ip-intel</code>) passing the credential in the <code className="text-indigo-300 font-mono">X-API-Key</code> or <code className="text-indigo-300 font-mono">Authorization: Bearer</code> header:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                        <div className="text-[11px] text-slate-400 font-bold uppercase">1. Single IP Lookup (GET)</div>
                        <pre className="text-slate-300 text-[11px] overflow-x-auto whitespace-pre-wrap select-all">
{`curl -H "X-API-Key: YOUR_KEY" \\
  "https://infosectools.cooperhealth.edu/api/v1/ip-metadata?ip=203.0.113.5"`}
                        </pre>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                        <div className="text-[11px] text-slate-400 font-bold uppercase">2. Bulk Batch Lookup (POST)</div>
                        <pre className="text-slate-300 text-[11px] overflow-x-auto whitespace-pre-wrap select-all">
{`curl -X POST -H "X-API-Key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"ips": ["203.0.113.5", "198.51.100.2"]}' \\
  "https://infosectools.cooperhealth.edu/api/v1/ip-metadata"`}
                        </pre>
                    </div>
                </div>
            </div>

            {/* Modal: Issue New Key */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <Key className="w-4 h-4 text-indigo-400" />
                                Issue New API Key
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowCreateModal(false)}
                                className="p-1 rounded-lg text-slate-400 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateKey} className="p-6 overflow-y-auto space-y-4">
                            {/* Key Name */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-200 mb-1">
                                    Key Name / Application Label *
                                </label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    placeholder="e.g. Graylog Prod - Shun Lookup"
                                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-sans"
                                    required
                                />
                            </div>

                            {/* Key Type Selector */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-200 mb-1">
                                    Credential Type
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setFormType("SERVICE")}
                                        className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                                            formType === "SERVICE"
                                                ? "bg-indigo-600/15 border-indigo-500 text-white"
                                                : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                                        }`}
                                    >
                                        <div className="text-xs font-bold flex items-center gap-1.5">
                                            <Server className="w-3.5 h-3.5 text-indigo-400" />
                                            Service Key (Machine)
                                        </div>
                                        <div className="text-[11px] text-slate-400 mt-1 font-sans">
                                            For Graylog, SOAR, or servers. Permanent; survives personnel changes.
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setFormType("PERSONAL")}
                                        className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                                            formType === "PERSONAL"
                                                ? "bg-amber-600/15 border-amber-500 text-white"
                                                : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                                        }`}
                                    >
                                        <div className="text-xs font-bold flex items-center gap-1.5">
                                            <User className="w-3.5 h-3.5 text-amber-400" />
                                            Personal Token
                                        </div>
                                        <div className="text-[11px] text-slate-400 mt-1 font-sans">
                                            For your own scripts or tools. Linked directly to your account.
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Scopes Selection */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-200 mb-1">
                                    Granted Scopes (Principle of Least Privilege)
                                </label>
                                <div className="space-y-1.5 max-h-40 overflow-y-auto p-2 rounded-lg bg-slate-950 border border-slate-800">
                                    {scopes.map(s => {
                                        const isChecked = formScopes.includes(s.id);
                                        return (
                                            <label
                                                key={s.id}
                                                className={`flex items-start gap-2.5 p-2 rounded-md transition-colors cursor-pointer select-none ${
                                                    isChecked ? "bg-indigo-950/40 text-slate-100" : "hover:bg-slate-900 text-slate-400"
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => toggleScope(s.id)}
                                                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-slate-700"
                                                />
                                                <div>
                                                    <div className="text-xs font-bold font-mono">{s.id}</div>
                                                    <div className="text-[10px] text-slate-400 font-sans">{s.description}</div>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Source IP ACL */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-200 mb-1">
                                    Source IP Whitelist / ACL (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={formAllowedIps}
                                    onChange={(e) => setFormAllowedIps(e.target.value)}
                                    placeholder="e.g. 172.18.161.50, 10.20.30.0/24"
                                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                                />
                                <p className="text-[10px] text-slate-400 mt-1 font-sans">
                                    Comma-separated IPs or CIDR blocks. If set, queries originating from any other IP are immediately dropped.
                                </p>
                            </div>

                            {/* Expiration */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-200 mb-1">
                                    Expiration
                                </label>
                                <select
                                    value={formExpiresInDays}
                                    onChange={(e) => setFormExpiresInDays(parseInt(e.target.value, 10))}
                                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500 font-sans cursor-pointer"
                                >
                                    <option value={0}>Never Expire (Standard for production server pipelines)</option>
                                    <option value={30}>30 Days</option>
                                    <option value={90}>90 Days</option>
                                    <option value={365}>1 Year (365 Days)</option>
                                </select>
                            </div>

                            {createError && (
                                <div className="p-3 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                                    <span>{createError}</span>
                                </div>
                            )}

                            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="px-3.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={createLoading}
                                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    {createLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                    Create Credential
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Newly Created Key Display */}
            {newlyCreatedKey && (
                <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white">API Key Created Successfully</h3>
                                <p className="text-xs text-slate-400">Make sure to copy your key now. You will not be able to see it again!</p>
                            </div>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 font-mono">
                            <div className="text-[10px] text-slate-400 uppercase font-semibold">Your Secret API Key:</div>
                            <div className="flex items-center justify-between gap-2 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                                <code className="text-xs text-emerald-300 break-all select-all">{newlyCreatedKey.rawKey}</code>
                                <button
                                    type="button"
                                    onClick={handleCopyNewKey}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors shadow-sm cursor-pointer"
                                >
                                    {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    {copiedKey ? "Copied!" : "Copy"}
                                </button>
                            </div>
                        </div>

                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 font-sans">
                            ⚠️ <strong>Security Note:</strong> We only store a cryptographic SHA-256 hash in the database. If you lose this key, you will need to revoke it and generate a new one.
                        </div>

                        <button
                            type="button"
                            onClick={() => setNewlyCreatedKey(null)}
                            className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
                        >
                            I Have Safely Saved My Key
                        </button>
                    </div>
                </div>
            )}

            {/* Modal: Revoke Confirmation */}
            {keyToRevoke && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-red-500/40 rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-red-500/15 text-red-400 border border-red-500/30">
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white">Revoke API Key?</h3>
                                <p className="text-xs text-slate-400">This action is permanent and cannot be undone.</p>
                            </div>
                        </div>

                        <p className="text-xs text-slate-300 font-sans leading-relaxed">
                            Are you sure you want to revoke <strong className="text-white">"{keyToRevoke.name}"</strong> ({keyToRevoke.keyPrefix})? Any application using this key will immediately be blocked from querying the API.
                        </p>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setKeyToRevoke(null)}
                                className="px-3.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleRevokeKey}
                                disabled={revokeLoading}
                                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-red-600/30 disabled:opacity-50"
                            >
                                {revokeLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                                Revoke Immediately
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
