import { NextResponse } from 'next/server';
import { createRoom, getActiveRooms, getRoomByCode } from '@/lib/db';

// POST /api/rooms - Create a new room
export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const room = createRoom(body.name);
        return NextResponse.json({ 
            success: true, 
            room: { id: room.id, code: room.code, name: room.name } 
        });
    } catch (error) {
        console.error('Failed to create room:', error);
        return NextResponse.json({ success: false, error: 'Failed to create room' }, { status: 500 });
    }
}

// GET /api/rooms - Get active rooms or check specific room
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');

    try {
        if (code) {
            // Check if room exists
            const room = getRoomByCode(code);
            if (!room) {
                return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
            }
            return NextResponse.json({ 
                success: true, 
                room: { id: room.id, code: room.code, name: room.name, status: room.status } 
            });
        } else {
            // Get list of active rooms
            const rooms = getActiveRooms();
            return NextResponse.json({ 
                success: true, 
                rooms: rooms.map(r => ({ id: r.id, code: r.code, name: r.name, status: r.status }))
            });
        }
    } catch (error) {
        console.error('Failed to get rooms:', error);
        return NextResponse.json({ success: false, error: 'Failed to get rooms' }, { status: 500 });
    }
}
