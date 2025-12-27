"use client";

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
    if (!socket) {
        socket = io({
            autoConnect: true,
            reconnection: true,
        });
    }
    return socket;
}

export function joinGameRoom(gameId: string): void {
    const s = getSocket();
    s.emit("join-room", gameId);
}

export { socket };
