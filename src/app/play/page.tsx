
"use client";

import { useState, useEffect } from "react";
import { socket } from "@/lib/socket";
import { motion, AnimatePresence } from "framer-motion";
import useSound from "use-sound";
import { v4 as uuidv4 } from "uuid";

export default function PlayPage() {
    const [name, setName] = useState("");
    const [joined, setJoined] = useState(false);
    const [buzzed, setBuzzed] = useState(false);
    const [winner, setWinner] = useState<{ playerId: string, playerName: string } | null>(null);
    const [isLocked, setIsLocked] = useState(false);
    const [score, setScore] = useState(0);
    const [gameState, setGameState] = useState<any>(null);
    const [playerId, setPlayerId] = useState<string>("");

    useEffect(() => {
        // 1. Initialize Player ID
        let startId = localStorage.getItem("svoya-player-id");
        if (!startId) {
            startId = uuidv4();
            localStorage.setItem("svoya-player-id", startId);
        }
        setPlayerId(startId);

        // 2. Wake Lock
        let wakeLock: any = null;
        const requestWakeLock = async () => {
            if ('wakeLock' in navigator) {
                try {
                    wakeLock = await (navigator as any).wakeLock.request('screen');
                    console.log('Wake Lock active');
                } catch (err) {
                    console.error(`${err}`);
                }
            }
        };
        requestWakeLock();
        document.addEventListener('visibilitychange', () => {
            if (wakeLock !== null && document.visibilityState === 'visible') {
                requestWakeLock();
            }
        });

        // 3. Socket Logic
        function onCommonState(state: any) {
            setGameState(state);
            setIsLocked(state.isBuzzerLocked);

            // Logic validation based on UUID, not socket.id
            if (!state.currentBuzzer) {
                setWinner(null);
                setBuzzed(false);
            } else {
                // Check if current buzzer is THIS player
                // We don't have direct check here easily without looking up in players
            }

            // Sync Score
            if (startId && state.players[startId]) {
                setScore(state.players[startId].score);
                // Auto-set joined state if we exist in server state
                if (!joined) {
                    setJoined(true);
                    setName(state.players[startId].name);
                }
            }
        }

        function onBuzzerWinner(data: { playerId: string; playerName: string }) {
            setWinner(data);
        }

        socket.on("game-state", onCommonState);
        socket.on("buzzer-winner", onBuzzerWinner);
        socket.on("reset-buzzer", () => {
            setWinner(null);
            setBuzzed(false);
            setIsLocked(false);
        });

        return () => {
            socket.off("game-state", onCommonState);
            socket.off("buzzer-winner", onBuzzerWinner);
            socket.off("reset-buzzer");
            if (wakeLock) wakeLock.release();
        };
    }, []); // Run once on mount

    // Reconnection Logic
    useEffect(() => {
        function onConnect() {
            console.log("Socket connected, attempting rejoin with:", name, playerId);
            if (name && playerId) {
                socket.emit("join-game", { name, playerId });
            }
        }
        socket.on("connect", onConnect);
        return () => {
            socket.off("connect", onConnect);
        };
    }, [name, playerId]);

    const handleJoin = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim() && playerId) {
            socket.emit("join-game", { name, playerId });
            setJoined(true);
        }
    };

    const handleBuzz = () => {
        if (!isLocked && !winner) {
            setBuzzed(true);
            socket.emit("buzz");
            navigator.vibrate?.(200); // Haptic feedback
        }
    };

    if (!joined) {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
                <h1 className="text-4xl font-black mb-8 text-blue-500">Вход</h1>
                <form onSubmit={handleJoin} className="w-full max-w-sm flex flex-col gap-4">
                    <input
                        type="text"
                        placeholder="Ваше имя"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full p-4 rounded-xl bg-neutral-800 border border-neutral-700 text-xl text-center focus:border-blue-500 outline-none"
                        maxLength={12}
                    />
                    <button
                        type="submit"
                        disabled={!name.trim()}
                        className="w-full py-4 bg-blue-600 rounded-xl font-bold text-xl disabled:opacity-50 active:scale-95 transition-all"
                    >
                        Войти в игру
                    </button>
                </form>
            </div>
        );
    }

    const isMyWin = winner?.playerId === playerId;

    return (
        <div className="min-h-screen bg-black text-white flex flex-col touch-none">
            <header className="p-4 flex justify-between items-center bg-neutral-900 border-b border-neutral-800">
                <div className="flex flex-col">
                    <span className="font-bold text-neutral-400 text-sm">Игрок</span>
                    <span className="font-black text-white text-xl">{name}</span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <span className="block text-neutral-400 text-xs">Счет</span>
                        <span className={`font-mono text-2xl font-bold ${score >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {score}
                        </span>
                    </div>
                    <div className={`w-3 h-3 rounded-full ${socket.connected ? 'bg-green-500' : 'bg-red-500'}`} />
                </div>
            </header>

            <main className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">

                <AnimatePresence>
                    {winner && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className={`absolute inset-0 flex items-center justify-center z-10 ${isMyWin ? 'bg-green-600' : 'bg-red-900/90'}`}
                        >
                            <div className="text-center">
                                <h2 className="text-4xl font-black mb-2">{isMyWin ? "ТВОЙ ХОД!" : "ОПОЗДАЛ!"}</h2>
                                <p className="text-xl opacity-80">{isMyWin ? "Отвечай быстро" : `Отвечает: ${winner.playerName}`}</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* FINAL ROUND MODES */}
                {gameState?.display?.screen === 'final_bets' ? (
                    <div className="w-full max-w-sm flex flex-col gap-4">
                        <h2 className="text-2xl font-bold text-center mb-4 text-yellow-500">Ваша Ставка</h2>
                        <input
                            type="number"
                            min="1"
                            max={Math.max(score, 1)}
                            className="bg-neutral-800 border-2 border-yellow-600 rounded-xl p-4 text-center text-4xl font-bold w-full outline-none focus:border-yellow-400"
                            placeholder="0"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    const val = parseInt(e.currentTarget.value);
                                    if (val > 0 && val <= Math.max(score, 1)) {
                                        socket.emit("submit-bet", val);
                                        e.currentTarget.disabled = true;
                                    }
                                }
                            }}
                        />
                        <p className="text-center text-neutral-400 text-sm">Введите сумму и нажмите Enter</p>
                    </div>
                ) : gameState?.display?.screen === 'final_question' ? (
                    <div className="w-full max-w-sm flex flex-col gap-4">
                        <h2 className="text-2xl font-bold text-center mb-4 text-blue-400">Ваш Ответ</h2>
                        <textarea
                            className="bg-neutral-800 border-2 border-blue-600 rounded-xl p-4 text-xl w-full h-32 outline-none focus:border-blue-400"
                            placeholder="Напишите ответ..."
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    const val = e.currentTarget.value;
                                    if (val.trim()) {
                                        socket.emit("submit-answer", val);
                                        e.currentTarget.disabled = true;
                                    }
                                }
                            }}
                        />
                        <p className="text-center text-neutral-400 text-sm">Нажмите Enter для отправки</p>
                    </div>
                ) : (
                    /* BUZZER MODE */
                    <button
                        onClick={handleBuzz}
                        disabled={isLocked || !!winner || gameState?.display?.screen !== 'question'}
                        className={`
                    w-72 h-72 rounded-full border-8 shadow-[0_0_50px_rgba(59,130,246,0.3)]
                    flex items-center justify-center
                    transition-all duration-100 active:scale-95
                    ${(isLocked || !!winner || gameState?.display?.screen !== 'question')
                                ? 'bg-neutral-800 border-neutral-700 opacity-50 cursor-not-allowed'
                                : 'bg-blue-600 border-blue-400 cursor-pointer active:bg-blue-500'}
                `}
                    >
                        <span className="text-4xl font-black uppercase tracking-widest drop-shadow-md">
                            ЖМЯК
                        </span>
                    </button>
                )}

            </main>
        </div>
    );
}
