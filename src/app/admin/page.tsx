"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

export default function AdminRedirect() {
    const router = useRouter();

    useEffect(() => {
        // Create new game and redirect
        const gameId = uuidv4().substring(0, 8).toUpperCase();
        router.replace(`/game/${gameId}/admin`);
    }, [router]);

    return (
        <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
            <div className="text-center">
                <div className="text-2xl mb-4">Создание игры...</div>
                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
            </div>
        </div>
    );
}
