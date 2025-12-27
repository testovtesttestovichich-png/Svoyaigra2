
import { NextResponse } from 'next/server';
import ip from 'ip';

export async function GET() {
    const host = process.env.PUBLIC_HOST || process.env.RAILWAY_PUBLIC_DOMAIN || ip.address();
    return NextResponse.json({ ip: host });
}
