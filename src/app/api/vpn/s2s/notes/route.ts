import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || "USER";

        if (!session?.user || !(await hasPermission(role, "vpn-s2s"))) {
            return NextResponse.json({ error: "Forbidden: Access to Site-to-Site VPN notes is restricted." }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const peerIp = searchParams.get("peerIp")?.trim() || "";
        const tunnelId = searchParams.get("tunnelId")?.trim() || "";

        if (!peerIp && !tunnelId) {
            return NextResponse.json({ success: true, notes: [] });
        }

        const orConditions: any[] = [];
        if (peerIp) {
            orConditions.push({ peerIp });
        }
        if (tunnelId) {
            orConditions.push({ tunnelId });
        }

        const notes = await prisma.s2sTunnelNote.findMany({
            where: {
                OR: orConditions
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        return NextResponse.json({
            success: true,
            notes: notes.map(n => ({
                id: n.id,
                tunnelId: n.tunnelId,
                peerIp: n.peerIp,
                tunnelName: n.tunnelName,
                note: n.note,
                username: n.username,
                userId: n.userId,
                createdAt: n.createdAt.toISOString(),
                updatedAt: n.updatedAt.toISOString()
            }))
        });
    } catch (error: any) {
        console.error("Error fetching S2S notes:", error);
        return NextResponse.json({ error: error.message || "Failed to fetch S2S notes" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || "USER";

        if (!session?.user || !(await hasPermission(role, "vpn-s2s"))) {
            return NextResponse.json({ error: "Forbidden: Access to Site-to-Site VPN notes is restricted." }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const rawNote = typeof body.note === "string" ? body.note.trim() : "";
        const peerIp = typeof body.peerIp === "string" ? body.peerIp.trim() : "";
        const tunnelId = typeof body.tunnelId === "string" ? body.tunnelId.trim() : "";
        const tunnelName = typeof body.tunnelName === "string" ? body.tunnelName.trim() : undefined;

        if (!rawNote) {
            return NextResponse.json({ error: "Note content cannot be empty" }, { status: 400 });
        }
        if (!peerIp && !tunnelId) {
            return NextResponse.json({ error: "Missing required tunnel identifier (peerIp or tunnelId)" }, { status: 400 });
        }

        // Determine user identity
        let username = (session.user as any)?.username || session.user.name || session.user.email || "analyst";
        if (session.user.id) {
            const dbUser = await prisma.user.findUnique({
                where: { id: session.user.id },
                select: { username: true, firstName: true, lastName: true }
            });
            if (dbUser?.username) {
                username = dbUser.username;
            }
        }

        const created = await prisma.s2sTunnelNote.create({
            data: {
                tunnelId: tunnelId || peerIp,
                peerIp: peerIp || tunnelId,
                tunnelName: tunnelName || null,
                note: rawNote,
                username,
                userId: session.user.id || null
            }
        });

        const snippet = rawNote.length > 60 ? `${rawNote.slice(0, 57)}...` : rawNote;
        await logAudit(
            "VPN_S2S_NOTE_ADDED",
            `Added note to tunnel "${tunnelName || peerIp}" (Peer: ${peerIp}): "${snippet}"`,
            session.user.id
        );

        return NextResponse.json({
            success: true,
            note: {
                id: created.id,
                tunnelId: created.tunnelId,
                peerIp: created.peerIp,
                tunnelName: created.tunnelName,
                note: created.note,
                username: created.username,
                userId: created.userId,
                createdAt: created.createdAt.toISOString(),
                updatedAt: created.updatedAt.toISOString()
            }
        });
    } catch (error: any) {
        console.error("Error creating S2S note:", error);
        return NextResponse.json({ error: error.message || "Failed to create S2S note" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || "USER";

        if (!session?.user || !(await hasPermission(role, "vpn-s2s"))) {
            return NextResponse.json({ error: "Forbidden: Access to Site-to-Site VPN notes is restricted." }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const noteId = searchParams.get("id")?.trim() || "";

        if (!noteId) {
            return NextResponse.json({ error: "Missing note ID" }, { status: 400 });
        }

        const existing = await prisma.s2sTunnelNote.findUnique({
            where: { id: noteId }
        });

        if (!existing) {
            return NextResponse.json({ error: "Note not found" }, { status: 404 });
        }

        const isOwner = existing.userId === session.user.id;
        const isAdmin = ["ADMIN", "ANALYST"].includes(String(role).toUpperCase());

        if (!isOwner && !isAdmin) {
            return NextResponse.json({ error: "Unauthorized to delete this note" }, { status: 403 });
        }

        await prisma.s2sTunnelNote.delete({
            where: { id: noteId }
        });

        await logAudit(
            "VPN_S2S_NOTE_DELETED",
            `Deleted note from tunnel "${existing.tunnelName || existing.peerIp}" (Peer: ${existing.peerIp})`,
            session.user.id
        );

        return NextResponse.json({ success: true, deletedId: noteId });
    } catch (error: any) {
        console.error("Error deleting S2S note:", error);
        return NextResponse.json({ error: error.message || "Failed to delete S2S note" }, { status: 500 });
    }
}
