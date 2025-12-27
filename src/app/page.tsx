"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { v4 as uuidv4 } from "uuid";

type GameInfo = {
    id: string;
    playerCount: number;
    createdAt: string;
};

export default function Home() {
    const router = useRouter();
    const [games, setGames] = useState<GameInfo[]>([]);
    const [joinCode, setJoinCode] = useState("");

    useEffect(() => {
        const socket = getSocket();
        
        socket.on("games-list", (gamesList: GameInfo[]) => {
            setGames(gamesList);
        });

        socket.emit("get-games");

        // Refresh list periodically
        const interval = setInterval(() => {
            socket.emit("get-games");
        }, 5000);

        return () => {
            socket.off("games-list");
            clearInterval(interval);
        };
    }, []);

    const createNewGame = () => {
        const gameId = uuidv4().substring(0, 8).toUpperCase();
        router.push(`/game/${gameId}/admin`);
    };

    const joinGame = (e: React.FormEvent) => {
        e.preventDefault();
        if (joinCode.trim()) {
            router.push(`/game/${joinCode.trim().toUpperCase()}/play`);
        }
    };

    return (
        <div className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center p-8 font-sans">
            <h1 className="text-6xl font-black mb-4 bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                СВОЯ ИГРА AI
            </h1>
            <p className="text-neutral-400 mb-12">Мультиплеерная викторина с генерацией вопросов</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">
                
                {/* Create Game Section */}
                <div className="bg-neutral-800 p-8 rounded-2xl border border-neutral-700 hover:border-blue-500 transition-all">
                    <h2 className="text-2xl font-bold mb-4 text-blue-400">🎮 Создать игру</h2>
                    <p className="text-neutral-400 mb-6 text-sm">
                        Создайте новую игровую сессию и пригласите игроков
                    </p>
                    <button
                        onClick={createNewGame}
                        className="w-full py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-xl transition-colors"
                    >
                        Новая игра
                    </button>
                </div>

                {/* Join Game Section */}
                <div className="bg-neutral-800 p-8 rounded-2xl border border-neutral-700 hover:border-green-500 transition-all">
                    <h2 className="text-2xl font-bold mb-4 text-green-400">🎯 Присоединиться</h2>
                    <p className="text-neutral-400 mb-6 text-sm">
                        Введите код игры, чтобы присоединиться как игрок
                    </p>
                    <form onSubmit={joinGame} className="flex flex-col gap-4">
                        <input
                            type="text"
                            placeholder="Код игры (например: A1B2C3D4)"
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                            className="w-full p-4 rounded-xl bg-neutral-900 border border-neutral-700 text-xl text-center font-mono uppercase tracking-widest focus:border-green-500 outline-none"
                            maxLength={8}
                        />
                        <button
                            type="submit"
                            disabled={!joinCode.trim()}
                            className="w-full py-4 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Войти
                        </button>
                    </form>
                </div>
            </div>

            {/* Active Games */}
            {games.length > 0 && (
                <div className="mt-12 w-full max-w-4xl">
                    <h3 className="text-xl font-bold mb-4 text-neutral-400">Активные игры</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {games.map((game) => (
                            <div
                                key={game.id}
                                className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700 flex justify-between items-center"
                            >
                                <div>
                                    <div className="font-mono font-bold text-lg">{game.id}</div>
                                    <div className="text-sm text-neutral-500">
                                        {game.playerCount} игрок{game.playerCount === 1 ? '' : game.playerCount < 5 ? 'а' : 'ов'}
                                    </div>
                                </div>
                                <button
                                    onClick={() => router.push(`/game/${game.id}/play`)}
                                    className="px-4 py-2 bg-green-600/20 text-green-400 rounded-lg hover:bg-green-600/30 transition-colors"
                                >
                                    Войти
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="mt-12 text-center text-neutral-500 text-sm">
                <p>Сканируйте QR-код на экране игры или введите код вручную</p>
            </div>
        </div>
    );
}
