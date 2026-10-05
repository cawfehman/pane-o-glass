"use client";

import { useState, useEffect } from "react";
import {
    Server,
    Shield,
    X,
    Check,
    AlertCircle,
    CheckCircle2,
    RefreshCw,
    Plus,
    Trash2,
    Eye,
    EyeOff,
    Copy,
    Key,
    Lock,
    Terminal,
    ArrowRight
} from "lucide-react";

interface FtdRow {
    id: string;
    name: string;
    ip: string;
    user: string;
    pass: string;
    secret: string;
}

interface S2sSetupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfigSaved: () => void;
    currentConfig?: any;
    isInitialPrompt?: boolean;
}

export function S2sSetupModal({
    isOpen,
    onClose,
    onConfigSaved,
    currentConfig,
    isInitialPrompt = false
}: S2sSetupModalProps) {
    const [activeTab, setActiveTab] = useState<"fmc" | "ftd">("fmc");

    // FMC Fields
    const [fmcUrl, setFmcUrl] = useState<string>("");
    const [fmcUser, setFmcUser] = useState<string>("");
    const [fmcPass, setFmcPass] = useState<string>("");
    const [fmcDomain, setFmcDomain] = useState<string>("");
    const [showFmcPass, setShowFmcPass] = useState<boolean>(false);

    // FTD Direct Fields
    const [ftds, setFtds] = useState<FtdRow[]>([
        { id: "ftd-1", name: "Primary S2S FTD", ip: "", user: "admin", pass: "", secret: "" }
    ]);

    // Test & Save State
    const [testing, setTesting] = useState<boolean>(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [saving, setSaving] = useState<boolean>(false);
    const [saveFeedback, setSaveFeedback] = useState<{ success: boolean; message: string } | null>(null);
    const [copiedEnv, setCopiedEnv] = useState<boolean>(false);

    useEffect(() => {
        if (currentConfig?.fmc) {
            setFmcUrl(currentConfig.fmc.url || "");
            setFmcUser(currentConfig.fmc.username || "");
            setFmcDomain(currentConfig.fmc.domainUuid || "");
        }
        if (Array.isArray(currentConfig?.ftds) && currentConfig.ftds.length > 0) {
            setFtds(currentConfig.ftds.map((f: any, idx: number) => ({
                id: f.id || `ftd-${idx + 1}`,
                name: f.name || `FTD Gateway ${idx + 1}`,
                ip: f.ip || "",
                user: f.user || "admin",
                pass: "",
                secret: f.secret || ""
            })));
        }
    }, [currentConfig]);

    if (!isOpen) return null;

    const handleAddFtdRow = () => {
        const nextId = `ftd-${ftds.length + 1}`;
        setFtds([...ftds, {
            id: nextId,
            name: `S2S FTD Gateway ${ftds.length + 1}`,
            ip: "",
            user: "admin",
            pass: "",
            secret: ""
        }]);
    };

    const handleRemoveFtdRow = (idx: number) => {
        if (ftds.length <= 1) return;
        setFtds(ftds.filter((_, i) => i !== idx));
    };

    const handleFtdChange = (idx: number, field: keyof FtdRow, val: string) => {
        const updated = [...ftds];
        updated[idx] = { ...updated[idx], [field]: val };
        setFtds(updated);
    };

    const handleTestFmc = async () => {
        if (!fmcUrl.trim() || !fmcUser.trim() || !fmcPass.trim()) {
            setTestResult({
                success: false,
                message: "Please enter FMC Host / URL, Username, and Password to run connectivity test."
            });
            return;
        }

        setTesting(true);
        setTestResult(null);
        try {
            const formattedUrl = fmcUrl.startsWith("http") ? fmcUrl : `https://${fmcUrl}`;
            const res = await fetch("/api/vpn/s2s/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "test_fmc",
                    fmc: {
                        url: formattedUrl,
                        username: fmcUser.trim(),
                        password: fmcPass.trim(),
                        domainUuid: fmcDomain.trim() || undefined
                    }
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setTestResult({
                    success: true,
                    message: data.message || "Successfully authenticated with Cisco FMC!"
                });
            } else {
                setTestResult({
                    success: false,
                    message: data.error || data.message || "Failed to connect to Cisco FMC. Verify host reachability and credentials."
                });
            }
        } catch (err: any) {
            setTestResult({
                success: false,
                message: err.message || "Network error testing FMC connection."
            });
        } finally {
            setTesting(false);
        }
    };

    const handleSaveConfig = async () => {
        setSaving(true);
        setSaveFeedback(null);
        try {
            const formattedUrl = fmcUrl.trim() ? (fmcUrl.startsWith("http") ? fmcUrl.trim() : `https://${fmcUrl.trim()}`) : "";
            const validFtds = ftds.filter(f => f.ip.trim().length > 0);

            const payload: any = {
                action: "save",
                activeMode: activeTab === "fmc" ? "fmc" : "ftd_direct",
                save: true
            };

            if (activeTab === "fmc" || formattedUrl) {
                payload.fmc = {
                    url: formattedUrl,
                    username: fmcUser.trim(),
                    password: fmcPass.trim(),
                    domainUuid: fmcDomain.trim() || undefined
                };
            }

            if (activeTab === "ftd" || validFtds.length > 0) {
                payload.ftds = validFtds;
            }

            const res = await fetch("/api/vpn/s2s/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to save configuration");
            }

            setSaveFeedback({
                success: true,
                message: "Configuration successfully saved! Loading live tunnels..."
            });

            setTimeout(() => {
                onConfigSaved();
                onClose();
            }, 1000);
        } catch (err: any) {
            setSaveFeedback({
                success: false,
                message: err.message || "Error saving configuration"
            });
        } finally {
            setSaving(false);
        }
    };

    const copyEnvTemplate = () => {
        const formattedUrl = fmcUrl.trim() ? (fmcUrl.startsWith("http") ? fmcUrl.trim() : `https://${fmcUrl.trim()}`) : "https://fmc-s2s.domain.local";
        const validFtds = ftds.filter(f => f.ip.trim().length > 0);
        const ftdJson = JSON.stringify(validFtds.map(f => ({
            id: f.id,
            name: f.name,
            ip: f.ip || "10.0.0.1",
            user: f.user || "admin",
            pass: f.pass || "secret"
        })));

        const text = `# Cisco Firepower Management Center (FMC)
FMC_URL="${formattedUrl}"
FMC_USER="${fmcUser.trim() || 'api_admin'}"
FMC_PASSWORD="${fmcPass.trim() || 'password_here'}"
FMC_DOMAIN_UUID="${fmcDomain.trim() || 'e276abec-e0f2-11e3-8169-6d9ed49b625f'}"

# Dedicated Site-to-Site FTD Gateways (Direct Lina SSH)
S2S_FIREWALL_CONFIG='${ftdJson}'
`;
        navigator.clipboard.writeText(text);
        setCopiedEnv(true);
        setTimeout(() => setCopiedEnv(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-cyan-500/30 bg-bg-surface p-6 shadow-2xl space-y-6">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-border-color pb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                            <Server size={22} />
                        </div>
                        <div>
                            <h2 className="text-xl font-extrabold text-text-primary flex items-center gap-2">
                                Configure S2S Gateways & FMC
                                {isInitialPrompt && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                        Setup Required
                                    </span>
                                )}
                            </h2>
                            <p className="text-xs text-text-secondary mt-0.5">
                                Specify your target Firepower Management Center (Web GUI / REST API) or FTD Gateway (SSH CLI) connection.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg border border-border-color hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Ephemeral In-Memory Security Notice */}
                <div className="p-3.5 rounded-xl border border-cyan-500/30 bg-cyan-950/20 text-cyan-200 text-xs flex items-start gap-2.5">
                    <Lock size={17} className="shrink-0 text-cyan-400 mt-0.5" />
                    <div className="space-y-1">
                        <div className="font-semibold text-cyan-300">
                            🔒 Zero Disk Persistence (In-Memory Session Only)
                        </div>
                        <p className="text-[11px] text-text-secondary leading-relaxed">
                            Passwords and credentials entered here are <strong className="text-cyan-300">never written to disk or stored in JSON files</strong>. They are held strictly in temporary server memory for the active session. If the server restarts, session credentials are cleared. Use <strong className="text-cyan-300">&quot;Copy as .env format&quot;</strong> below if you prefer to configure permanent server environment variables.
                        </p>
                    </div>
                </div>

                {/* Banner if initial prompt */}
                {isInitialPrompt && (
                    <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-950/20 text-amber-200 text-xs flex items-center gap-2.5">
                        <AlertCircle size={18} className="shrink-0 text-amber-400" />
                        <div>
                            <strong>No S2S credentials found in environment (.env).</strong> Configure FMC Web GUI or FTD CLI credentials below to begin live VPN troubleshooting.
                        </div>
                    </div>
                )}

                {/* Mode Selector Tabs */}
                <div className="flex items-center p-1 rounded-xl bg-bg-surface-hover/70 border border-border-color text-xs">
                    <button
                        onClick={() => setActiveTab("fmc")}
                        className={`flex-1 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
                            activeTab === "fmc"
                                ? "bg-accent-primary text-white shadow-sm"
                                : "text-text-secondary hover:text-text-primary"
                        }`}
                    >
                        <Server size={15} />
                        <span>FMC Web GUI / REST API (HTTPS: 443)</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("ftd")}
                        className={`flex-1 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
                            activeTab === "ftd"
                                ? "bg-accent-primary text-white shadow-sm"
                                : "text-text-secondary hover:text-text-primary"
                        }`}
                    >
                        <Terminal size={15} />
                        <span>FTD Device CLI / SSH (Port: 22)</span>
                    </button>
                </div>

                {/* Tab A: FMC Web GUI / REST API */}
                {activeTab === "fmc" && (
                    <div className="space-y-4">
                        <div className="p-3.5 rounded-xl bg-bg-surface-hover/30 border border-border-color text-xs text-text-secondary leading-relaxed">
                            <strong className="text-cyan-400">Target: Cisco FMC Management Server (Web GUI / REST API)</strong><br />
                            Uses FMC HTTPS (Port 443) REST tokens to discover high-level Site-to-Site VPN topologies, crypto policies, endpoint nodes, and traffic selector subnets.
                            <div className="mt-1 text-[11px] text-amber-300/90 font-medium">
                                💡 Note: Enter your FMC Web/API login account (this is typically separate from FTD device CLI passwords).
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
                            <div className="space-y-1.5 md:col-span-2">
                                <label className="font-semibold text-text-primary flex items-center justify-between">
                                    <span>FMC Host / IP Address or URL</span>
                                    <span className="text-[10px] text-text-secondary font-normal">e.g. 10.200.1.50 or https://fmc.domain.local</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="https://fmc-s2s.domain.local or 10.200.1.50"
                                    value={fmcUrl}
                                    onChange={(e) => setFmcUrl(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border-color text-text-primary outline-none focus:border-cyan-400 font-mono text-xs"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-semibold text-text-primary">FMC Web / API Username</label>
                                <input
                                    type="text"
                                    placeholder="api_admin or fmc_user"
                                    value={fmcUser}
                                    onChange={(e) => setFmcUser(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border-color text-text-primary outline-none focus:border-cyan-400 text-xs"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-semibold text-text-primary">FMC Web / API Password</label>
                                <div className="relative">
                                    <input
                                        type={showFmcPass ? "text" : "password"}
                                        placeholder={currentConfig?.fmc?.hasPassword ? "•••••••• (Saved in Session)" : "Enter FMC web password"}
                                        value={fmcPass}
                                        onChange={(e) => setFmcPass(e.target.value)}
                                        className="w-full px-3 py-2 pr-9 rounded-lg bg-bg-surface border border-border-color text-text-primary outline-none focus:border-cyan-400 text-xs"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowFmcPass(!showFmcPass)}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                                    >
                                        {showFmcPass ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-1.5 md:col-span-2">
                                <label className="font-semibold text-text-primary flex items-center justify-between">
                                    <span>Domain UUID / Name (Optional)</span>
                                    <span className="text-[10px] text-text-secondary font-normal">Leave blank to auto-discover default domain</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="e276abec-e0f2-11e3-8169-6d9ed49b625f or blank"
                                    value={fmcDomain}
                                    onChange={(e) => setFmcDomain(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border-color text-text-primary outline-none focus:border-cyan-400 font-mono text-xs"
                                />
                            </div>
                        </div>

                        {/* Test FMC Button */}
                        <div className="flex items-center gap-3 pt-1">
                            <button
                                type="button"
                                onClick={handleTestFmc}
                                disabled={testing}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/20 hover:bg-cyan-950/40 text-cyan-300 text-xs font-semibold transition-all disabled:opacity-50"
                            >
                                <RefreshCw size={13} className={testing ? "animate-spin" : ""} />
                                <span>{testing ? "Testing Authentication..." : "Test FMC Connection"}</span>
                            </button>
                        </div>

                        {testResult && (
                            <div className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                                testResult.success
                                    ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                                    : "bg-rose-950/40 border-rose-500/30 text-rose-300"
                            }`}>
                                {testResult.success ? <CheckCircle2 size={16} className="shrink-0 text-emerald-400" /> : <AlertCircle size={16} className="shrink-0 text-rose-400" />}
                                <span>{testResult.message}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Tab B: Direct FTD Firewalls */}
                {activeTab === "ftd" && (
                    <div className="space-y-4">
                        <div className="p-3.5 rounded-xl bg-bg-surface-hover/30 border border-border-color text-xs text-text-secondary leading-relaxed">
                            <strong className="text-cyan-400">Target: FTD Firewall Management IPs (SSH: 22)</strong><br />
                            Uses device administrative CLI access to execute read-only Lina crypto diagnostics (`show crypto ikev2 sa`, `show crypto ipsec sa`, packet captures, tunnel bounces).
                            <div className="mt-1 text-[11px] text-amber-300/90 font-medium">
                                💡 Note: Enter device SSH or TACACS+ credentials (usually different from FMC web credentials).
                            </div>
                        </div>

                        <div className="space-y-3">
                            {ftds.map((ftd, idx) => (
                                <div key={ftd.id} className="p-3 rounded-xl border border-border-color bg-bg-surface-hover/20 space-y-2.5 text-xs">
                                    <div className="flex items-center justify-between">
                                        <div className="font-semibold text-text-primary flex items-center gap-2">
                                            <Shield size={14} className="text-cyan-400" />
                                            <span>FTD Gateway #{idx + 1}</span>
                                        </div>
                                        {ftds.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveFtdRow(idx)}
                                                className="text-rose-400 hover:text-rose-300 transition-all p-1"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                                        <div className="space-y-1">
                                            <label className="text-[11px] text-text-secondary">Gateway Name / Label</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Camden S2S Primary"
                                                value={ftd.name}
                                                onChange={(e) => handleFtdChange(idx, "name", e.target.value)}
                                                className="w-full px-2.5 py-1.5 rounded-lg bg-bg-surface border border-border-color text-text-primary text-xs"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[11px] text-text-secondary">Device IP (Port 22)</label>
                                            <input
                                                type="text"
                                                placeholder="10.x.x.x"
                                                value={ftd.ip}
                                                onChange={(e) => handleFtdChange(idx, "ip", e.target.value)}
                                                className="w-full px-2.5 py-1.5 rounded-lg bg-bg-surface border border-border-color text-text-primary font-mono text-xs"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[11px] text-text-secondary">SSH / TACACS+ User</label>
                                            <input
                                                type="text"
                                                placeholder="admin"
                                                value={ftd.user}
                                                onChange={(e) => handleFtdChange(idx, "user", e.target.value)}
                                                className="w-full px-2.5 py-1.5 rounded-lg bg-bg-surface border border-border-color text-text-primary text-xs"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[11px] text-text-secondary">SSH Password / Secret</label>
                                            <input
                                                type="password"
                                                placeholder="••••••••"
                                                value={ftd.pass}
                                                onChange={(e) => handleFtdChange(idx, "pass", e.target.value)}
                                                className="w-full px-2.5 py-1.5 rounded-lg bg-bg-surface border border-border-color text-text-primary text-xs"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <button
                                type="button"
                                onClick={handleAddFtdRow}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border-color hover:border-cyan-400 text-text-secondary hover:text-cyan-400 text-xs font-medium transition-all"
                            >
                                <Plus size={14} />
                                <span>Add Another S2S FTD Gateway</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Save Feedback */}
                {saveFeedback && (
                    <div className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                        saveFeedback.success
                            ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                            : "bg-rose-950/40 border-rose-500/30 text-rose-300"
                    }`}>
                        {saveFeedback.success ? <CheckCircle2 size={16} className="shrink-0 text-emerald-400" /> : <AlertCircle size={16} className="shrink-0 text-rose-400" />}
                        <span>{saveFeedback.message}</span>
                    </div>
                )}

                {/* Modal Footer */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border-color pt-4">
                    <button
                        type="button"
                        onClick={copyEnvTemplate}
                        className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-all"
                        title="Copy configuration as environment variables for permanent .env deployment"
                    >
                        {copiedEnv ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                        <span>{copiedEnv ? "Copied .env format!" : "Copy as .env format"}</span>
                    </button>

                    <div className="flex items-center gap-2.5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg border border-border-color hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary text-xs font-medium transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveConfig}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent-primary hover:bg-accent-primary/90 text-white text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
                            title="Applies in active server memory only (never written to disk)"
                        >
                            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                            <span>{saving ? "Applying..." : "Apply (In-Memory Session)"}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
