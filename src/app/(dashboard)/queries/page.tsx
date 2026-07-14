import { auth } from "@/lib/auth";
import { getPermissionsForRole } from "@/app/actions/permissions";
import { ShieldAlert, Activity, Lock, Terminal, ShieldCheck, Wifi, Globe, Shield, Server, Network } from "lucide-react";
import QueriesPageClient from "./QueriesPageClient";

export default async function QueriesPage() {
    const session = await auth();
    const role = (session?.user as any)?.role || "USER";
    const normalizedRole = String(role).toUpperCase();
    const isAdmin = normalizedRole === "ADMIN";
    
    // Fetch dynamic permissions from DB
    const permissions = await getPermissionsForRole(normalizedRole);
    const hasPermission = (toolId: string) => isAdmin || permissions.includes(toolId);

    const tools = [
        {
            id: 'firewall',
            title: "Cisco Firewall Utilities",
            href: "/queries/firewall",
            description: "Query IP shuns across edge firewalls and audit background 'Guardian' automation events.",
            icon: <Shield size={24} />
        },
        {
            id: 'ise',
            title: "Cisco ISE Center",
            href: "/queries/ise",
            description: "Monitor real-time network authentication sessions and identity services for wired and wireless clients.",
            icon: <Server size={24} />
        },
        {
            id: 'vpn',
            title: "VPN Troubleshooting",
            href: "/queries/vpn",
            description: "Analyze, search, and troubleshoot Secure Client (AnyConnect) VPN session connectivity, duration, bandwidth, and failures.",
            icon: <Network size={24} />
        },
        {
            id: 'ise-tacacs',
            title: "TACACS+ Administration",
            href: "/queries/tacacs",
            description: "Audit administrative access to network devices and track command executions across the infrastructure.",
            icon: <Lock size={24} />
        },
        {
            id: 'hibp-account',
            title: "HIBP Account Security",
            href: "/queries/hibp/account",
            description: "Search the 'Have I Been Pwned' database to identify if specific accounts have been compromised in breaches.",
            icon: <ShieldAlert size={24} />
        },
        {
            id: 'hibp-domain',
            title: "HIBP Domain Security",
            href: "/queries/hibp/domain",
            description: "Monitor domain-wide breach data to identify leaked credentials across all corporate employees.",
            icon: <ShieldCheck size={24} />
        },
        {
            id: 'threat-intel',
            title: "Threat Intelligence",
            href: "/queries/threat-intel",
            description: "Query IP reputation, DNS zones, and file signatures correlated with Cisco Umbrella categorization.",
            icon: <Globe size={24} />
        }
    ];

    const visibleTools = tools.filter(tool => hasPermission(tool.id));

    // Convert icon JSX elements to serialized properties if needed, but since we are import/rendering React, Next.js handles server->client JSX injection smoothly.
    return <QueriesPageClient visibleTools={visibleTools} role={role} />;
}
