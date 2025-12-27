
"use client";

import { io } from "socket.io-client";

// Initialize socket connection
// We don't specify URL to let it auto-connect to window.location.origin
// This works perfectly for both localhost and specific IP access
export const socket = io({
    autoConnect: true,
    reconnection: true,
});
