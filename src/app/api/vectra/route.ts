import { NextResponse } from 'next/server';
import { queryVectraMetadata } from '@/lib/vectra';
import { auth } from '@/lib/auth';

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { query, timeRange, limit } = body;

        if (!query) {
            return NextResponse.json({ error: 'Query is required' }, { status: 400 });
        }

        const metadata = await queryVectraMetadata(query, timeRange || "24h", limit || 500);

        if (metadata.error) {
             return NextResponse.json({ error: metadata.error }, { status: 500 });
        }

        return NextResponse.json(metadata);
    } catch (error: any) {
        console.error('Vectra API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
