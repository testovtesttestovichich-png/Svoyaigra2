import { NextResponse } from 'next/server';
import ip from 'ip';

export async function GET() {
    // Priority: NEXT_PUBLIC_HOST > RAILWAY_PUBLIC_DOMAIN > local IP
    const host = process.env.NEXT_PUBLIC_HOST || process.env.RAILWAY_PUBLIC_DOMAIN || ip.address();
    const isPublicDomain = !!(process.env.NEXT_PUBLIC_HOST || process.env.RAILWAY_PUBLIC_DOMAIN);
    
    return NextResponse.json({ 
        host,
        isPublicDomain
    });
}
