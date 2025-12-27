
"use client";

import { useState, useEffect } from "react";
import { socket } from "@/lib/socket";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import useSound from "use-sound";

export default function DisplayPage() {
    const [gameState, setGameState] = useState<any>(null);
    const [localIp, setLocalIp] = useState("");
    const [isAudioEnabled, setIsAudioEnabled] = useState(false);

    // Use env variable if set, otherwise fetch local IP
    const publicHost = process.env.NEXT_PUBLIC_HOST || localIp;

    // Sounds
    const [playBuzzer] = useSound("/sounds/buzzer.mp3");
    const [playCorrect] = useSound("/sounds/correct.mp3");
    const [playWrong] = useSound("/sounds/wrong.mp3");
    const [playApplaus] = useSound("/sounds/applaus.mp3");

    // Enable audio context helper
    const enableAudio = () => {
        setIsAudioEnabled(true);
        // Play a silent or short sound to unlock AudioContext
        playCorrect();
    };

    useEffect(() => {
        socket.on("game-state", setGameState);

        socket.on("play-sound", (sound: string) => {
            console.log("Playing sound:", sound);
            if (!isAudioEnabled) {
                console.warn("Audio not enabled yet");
                return;
            }
            if (sound === 'buzzer') playBuzzer();
            if (sound === 'correct') playCorrect();
            if (sound === 'wrong') playWrong();
            if (sound === 'applaus') playApplaus();
        });

        // Fetch local IP only if PUBLIC_HOST not set
        if (!process.env.NEXT_PUBLIC_HOST) {
            fetch('/api/ip')
                .then(res => res.json())
                .then(data => setLocalIp(data.ip || ""))
                .catch(console.error);
        }

        return () => {
            socket.off("game-state", setGameState);
            socket.off("play-sound");
        };
    }, [isAudioEnabled, playBuzzer, playCorrect, playWrong, playApplaus]);

    if (!gameState) return <div className="min-h-screen bg-black" />;

    if (!isAudioEnabled) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 text-white cursor-pointer" onClick={enableAudio}>
                <div className="text-center animate-pulse">
                    <div className="text-6xl mb-4">🔊</div>
                    <div className="text-2xl font-bold">Нажмите в любом месте,<br />чтобы включить звук</div>
                </div>
            </div>
        );
    }

    const { display, players, currentBuzzer } = gameState;
    const activeQ = display?.activeQuestion;
    const buzzerPlayer = currentBuzzer ? players[currentBuzzer] : null;

    // Determine player URL for QR code
    const getPlayerUrl = () => {
        if (!publicHost) {
            return typeof window !== 'undefined' ? `${window.location.origin}/play` : '/play';
        }
        // Check if it's a domain (contains dot but not just IP)
        const isDomain = publicHost.includes('.') && !/^\d+\.\d+\.\d+\.\d+$/.test(publicHost);
        if (isDomain) {
            return `https://${publicHost}/play`;
        }
        // It's an IP address - use current port if present
        const port = typeof window !== 'undefined' && window.location.port ? `:${window.location.port}` : '';
        return `http://${publicHost}${port}/play`;
    };
    const playerUrl = getPlayerUrl();

    return (
        <div className="min-h-screen bg-blue-900 text-white flex flex-col items-center justify-center font-sans overflow-hidden relative">

            {/* Background Decor */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-800 to-black opacity-80" />
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" />

            {/* Top Bar: Players & Scores */}
            {gameState?.display?.screen !== 'qr' && (
                <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-black/40 backdrop-blur-sm border-b border-white/10 flex justify-center gap-8">
                    {Object.values(gameState?.players || {}).map((p: any) => (
                        <div key={p.id} className={`flex flex-col items-center px-4 py-2 rounded-xl transition-all ${gameState?.currentBuzzer === p.id ? 'bg-yellow-500 text-black scale-110 shadow-[0_0_20px_rgba(234,179,8,0.5)]' : 'bg-white/5'}`}>
                            <span className="font-bold text-lg max-w-[150px] truncate">{p.name}</span>
                            <span className={`font-mono font-black text-2xl ${gameState?.currentBuzzer === p.id ? 'text-black' : (p.score >= 0 ? 'text-green-400' : 'text-red-400')}`}>
                                {p.score}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Main Content Area */}
            <main className="z-10 w-full max-w-[90vw] p-8 text-center flex flex-col items-center justify-center min-h-[400px]">
                <AnimatePresence mode="wait">

                    {/* QR / INVITE MODE */}
                    {display.screen === 'qr' && (
                        <motion.div
                            key="qr"
                            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                            className="flex flex-col items-center p-12 bg-white/10 backdrop-blur-md rounded-3xl border border-white/20"
                        >
                            <h2 className="text-5xl font-black mb-12 text-white drop-shadow-lg">ПРИСОЕДИНЯЙТЕСЬ!</h2>
                            <div className="bg-white p-6 rounded-2xl shadow-2xl mb-8">
                                <QRCodeSVG value={playerUrl} size={400} />
                            </div>
                            <div className="text-4xl font-mono bg-black/50 px-6 py-2 rounded-xl text-yellow-400">
                                {playerUrl}
                            </div>
                        </motion.div>
                    )}

                    {/* LOBBY / BOARD MODE (Simplified for now, just shows Logo or "Look at host") */}
                    {display.screen === 'board' && (
                        <motion.div
                            key="board"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="w-full max-w-7xl"
                        >
                            {!gameState?.gameData ? (
                                <div className="flex flex-col items-center">
                                    <h1 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 drop-shadow-lg mb-8">
                                        СВОЯ ИГРА
                                    </h1>
                                    <div className="text-2xl text-blue-200 opacity-80">
                                        Ожидание начала игры...
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4 w-full">
                                    {gameState.gameData.rounds.map((round: any, rIdx: number) => (
                                        // ONLY SHOW CURRENT ROUND
                                        rIdx === (gameState.currentRound || 0) ? (
                                            <div key={rIdx} className="w-full">
                                                <h2 className="text-3xl font-bold text-yellow-500 mb-4 animate-pulse">{round.name}</h2>
                                                <div className="grid grid-cols-1 gap-4">
                                                    {round.categories.map((cat: any, cIdx: number) => (
                                                        <div key={cIdx} className="flex gap-4 h-32">
                                                            {/* Category Name */}
                                                            <div className="flex-[2] bg-blue-800 border-2 border-yellow-600 rounded-xl flex items-center justify-center p-4 shadow-lg">
                                                                <span className="text-2xl md:text-3xl font-bold text-yellow-100 uppercase leading-tight drop-shadow-md">
                                                                    {cat.title}
                                                                </span>
                                                            </div>
                                                            {/* Questions */}
                                                            <div className="flex-[3] flex gap-4">
                                                                {cat.questions.map((q: any, qIdx: number) => {
                                                                    const isPlayed = gameState.playedQuestions?.includes(`${rIdx}-${cIdx}-${qIdx}`);
                                                                    return (
                                                                        <div
                                                                            key={qIdx}
                                                                            className={`flex-1 rounded-xl flex items-center justify-center shadow-lg border-2 transition-all ${isPlayed
                                                                                ? "bg-blue-900/20 border-blue-900/20"
                                                                                : "bg-blue-800 border-yellow-600"
                                                                                }`}
                                                                        >
                                                                            {!isPlayed && (
                                                                                <span className="text-4xl md:text-5xl font-black text-yellow-400 drop-shadow-md">
                                                                                    {q.value}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* QUESTION / ANSWER / FINAL MODE */}
                    {['question', 'answer', 'final_bets', 'final_question', 'final_processing', 'final_reveal'].includes(display.screen) && activeQ && (
                        <motion.div
                            key="question-answer-final"
                            layoutId="active-question-card" // Reserved for future shared layout animation if we mapped IDs
                            initial={{ scale: 0.1, opacity: 0, rotateX: 90 }}
                            animate={{ scale: 1, opacity: 1, rotateX: 0 }}
                            exit={{ scale: 1.5, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 120, damping: 15 }}
                            className="w-full bg-blue-800/90 backdrop-blur-xl border-[6px] border-yellow-500 rounded-3xl p-12 shadow-[0_0_100px_rgba(234,179,8,0.4)] relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-transparent via-yellow-400 to-transparent opacity-50" />

                            <div className="text-3xl text-yellow-400 font-bold mb-8 tracking-widest uppercase flex justify-between items-center border-b border-white/10 pb-4">
                                <span>{activeQ.category}</span>
                                {display.screen === 'final_bets' ? (
                                    <span className="bg-yellow-600/30 px-4 py-1 rounded animate-pulse">СТАВКИ</span>
                                ) : (
                                    <span className="bg-yellow-600/30 px-4 py-1 rounded">{activeQ.value || 'ФИНАЛ'}</span>
                                )}
                            </div>
                            <div className="text-5xl md:text-7xl font-bold leading-tight drop-shadow-md mb-12 min-h-[200px] flex items-center justify-center">
                                {display.screen === 'final_bets' ? 'Делайте ваши ставки...' : activeQ.text}
                            </div>

                            {(display.screen === 'answer' || display.screen === 'final_reveal') && (
                                <motion.div
                                    initial={{ opacity: 0, y: 50 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-green-600 inline-block px-12 py-4 rounded-full text-4xl font-bold shadow-xl border border-green-400"
                                >
                                    {activeQ.answer}
                                </motion.div>
                            )}
                        </motion.div>
                    )}

                    {/* GAME OVER MODE */}
                    {display.screen === 'game_over' && (
                        <motion.div
                            key="game-over"
                            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                            className="w-full max-w-4xl bg-blue-900/40 backdrop-blur-xl border-4 border-yellow-500 rounded-3xl p-12 shadow-[0_0_100px_rgba(234,179,8,0.5)]"
                        >
                            <h2 className="text-6xl font-black text-yellow-400 mb-12 drop-shadow-lg uppercase">Итоги Игры</h2>

                            <div className="flex flex-col gap-4">
                                {Object.values(gameState?.players || {})
                                    .sort((a: any, b: any) => b.score - a.score)
                                    .map((p: any, idx) => (
                                        <motion.div
                                            key={p.id}
                                            initial={{ x: -50, opacity: 0 }}
                                            animate={{ x: 0, opacity: 1 }}
                                            transition={{ delay: idx * 0.1 }}
                                            className={`flex justify-between items-center p-6 rounded-2xl ${idx === 0
                                                    ? 'bg-gradient-to-r from-yellow-600 to-yellow-400 text-black shadow-xl scale-105 border-2 border-yellow-200'
                                                    : 'bg-white/10 border border-white/10'
                                                }`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <span className={`font-black text-2xl w-12 text-center ${idx === 0 ? 'text-black' : 'text-neutral-400'}`}>
                                                    #{idx + 1}
                                                </span>
                                                <span className="font-bold text-3xl">{p.name}</span>
                                                {idx === 0 && <span className="text-3xl">👑</span>}
                                            </div>
                                            <span className="font-mono font-black text-4xl">{p.score}</span>
                                        </motion.div>
                                    ))}
                            </div>
                        </motion.div>
                    )}

                </AnimatePresence>
            </main>

            {/* Buzzer Overlay */}
            <AnimatePresence>
                {buzzerPlayer && (
                    <motion.div
                        initial={{ y: 200 }} animate={{ y: 0 }} exit={{ y: 200 }}
                        className="absolute bottom-0 left-0 right-0 bg-yellow-500 text-black p-8 text-center z-50 border-t-8 border-yellow-300 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
                    >
                        <div className="text-2xl font-black uppercase opacity-60 mb-2">Отвечает</div>
                        <div className="text-6xl font-black">{buzzerPlayer.name}</div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
}
