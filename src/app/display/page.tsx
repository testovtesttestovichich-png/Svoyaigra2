"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DisplayRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/");
    }, [router]);

    return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
            <div className="text-center">
                <div className="text-2xl mb-4">Нужен код игры</div>
                <div className="text-neutral-500">Перенаправление...</div>
            </div>
        </div>
    );
}
