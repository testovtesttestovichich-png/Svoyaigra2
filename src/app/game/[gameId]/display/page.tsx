"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { getSocket, joinGameRoom } from "@/lib/socket";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import useSound from "use-sound";

type HostInfo = {
    host: string;
    isPublicDomain: boolean;
};

export default function DisplayPage() {
    const params = useParams();
    const gameId = params.gameId as string;
    
    const [gameState, setGameState] = useState<any>(null);
    const [hostInfo, setHostInfo] = useState<HostInfo | null>(null);
    const [isAudioEnabled, setIsAudioEnabled] = useState(false);

    const socket = getSocket();

    const [playBuzzer] = useSound("/sounds/buzzer.mp3");
    const [playCorrect] = useSound("/sounds/correct.mp3");
    const [playWrong] = useSound("/sounds/wrong.mp3");
    const [playApplaus] = useSound("/sounds/applaus.mp3");

    const enableAudio = () => {
        setIsAudioEnabled(true);
        playCorrect();
    };

    useEffect(() => {
        joinGameRoom(gameId);

        socket.on("game-state", setGameState);

        socket.on("play-sound", (sound: string) => {
            if (!isAudioEnabled) return;
            if (sound === 'buzzer') playBuzzer();
            if (sound === 'correct') playCorrect();
            if (sound === 'wrong') playWrong();
            if (sound === 'applaus') playApplaus();
        });

        fetch('/api/ip')
            .then(res => res.json())
            .then(data => setHostInfo(data))
            .catch(console.error);

        return () => {
            socket.off("game-state");
            socket.off("play-sound");
        };
    }, [gameId, isAudioEnabled, playBuzzer, playCorrect, playWrong, playApplaus, socket]);

    if (!gameState) return <div className="min-h-screen bg-black" />;

    if (!isAudioEnabled) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 text-white cursor-pointer" onClick={enableAudio}>
                <div className="text-center animate-pulse">
                    <div className="text-6xl mb-4">🔊</div>
                    <div className="text-2xl font-bold">Нажмите, чтобы включить звук</div>
                </div>
            </div>
        );
    }

    const { display, players, currentBuzzer } = gameState;
    const activeQ = display?.activeQuestion;
    const buzzerPlayer = currentBuzzer ? players[currentBuzzer] : null;

    const getPlayerUrl = () => {
        if (!hostInfo?.host) {
            return typeof window !== 'undefined' ? `${window.location.origin}/game/${gameId}/play` : `/game/${gameId}/play`;
        }
        if (hostInfo.isPublicDomain) {
            return `https://${hostInfo.host}/game/${gameId}/play`;
        }
        const port = typeof window !== 'undefined' && window.location.port ? `:${window.location.port}` : '';
        return `http://${hostInfo.host}${port}/game/${gameId}/play`;
    };
    const playerUrl = getPlayerUrl();

    return (
        <div className="min-h-screen bg-blue-900 text-white flex flex-col items-center justify-center font-sans overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-800 to-black opacity-80" />

            {/* Game Code Badge */}
            <div className="absolute top-4 right-4 z-30 bg-black/50 px-4 py-2 rounded-xl border border-white/20">
                <span className="text-neutral-400 text-sm">Код игры: </span>
                <span className="font-mono font-bold text-2xl text-yellow-400">{gameId}</span>
            </div>

            {/* Top Bar: Players */}
            {display?.screen !== 'qr' && (
                <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-black/40 backdrop-blur-sm border-b border-white/10 flex justify-center gap-8">
                    {Object.values(players || {}).map((p: any) => (
                        <div key={p.id} className={`flex flex-col items-center px-4 py-2 rounded-xl transition-all ${currentBuzzer === p.id ? 'bg-yellow-500 text-black scale-110' : 'bg-white/5'}`}>
                            <span className="font-bold text-lg max-w-[150px] truncate">{p.name}</span>
                            <span className={`font-mono font-black text-2xl ${currentBuzzer === p.id ? 'text-black' : (p.score >= 0 ? 'text-green-400' : 'text-red-400')}`}>
                                {p.score}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Main Content */}
            <main className="z-10 w-full max-w-[90vw] p-8 text-center flex flex-col items-center justify-center min-h-[400px]">
                <AnimatePresence mode="wait">
                    {/* QR Mode */}
                    {display.screen === 'qr' && (
                        <motion.div
                            key="qr"
                            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                            className="flex flex-col items-center p-12 bg-white/10 backdrop-blur-md rounded-3xl border border-white/20"
                        >
                            <h2 className="text-5xl font-black mb-4 text-white">ПРИСОЕДИНЯЙТЕСЬ!</h2>
                            <div className="text-2xl font-mono text-yellow-400 mb-8">Код игры: {gameId}</div>
                            <div className="bg-white p-6 rounded-2xl shadow-2xl mb-8">
                                <QRCodeSVG value={playerUrl} size={350} />
                            </div>
                            <div className="text-xl font-mono bg-black/50 px-6 py-2 rounded-xl text-neutral-300">
                                {playerUrl}
                            </div>
                        </motion.div>
                    )}

                    {/* Board Mode */}
                    {display.screen === 'board' && (
                        <motion.div
                            key="board"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="w-full max-w-7xl"
                        >
                            {!gameState?.gameData ? (
                                <div className="flex flex-col items-center">
                                    <h1 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 mb-8">
                                        СВОЯ ИГРА
                                    </h1>
                                    <div className="text-2xl text-blue-200 opacity-80">Ожидание начала...</div>
                                    <div className="mt-8 text-4xl font-mono text-yellow-400">Код: {gameId}</div>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4 w-full">
                                    {gameState.gameData.rounds.map((round: any, rIdx: number) => (
                                        rIdx === (gameState.currentRound || 0) ? (
                                            <div key={rIdx} className="w-full">
                                                <h2 className="text-3xl font-bold text-yellow-500 mb-4">{round.name}</h2>
                                                <div className="grid grid-cols-1 gap-4">
                                                    {round.categories.map((cat: any, cIdx: number) => (
                                                        <div key={cIdx} className="flex gap-4 h-32">
                                                            <div className="flex-[2] bg-blue-800 border-2 border-yellow-600 rounded-xl flex items-center justify-center p-4">
                                                                <span className="text-2xl md:text-3xl font-bold text-yellow-100 uppercase">{cat.title}</span>
                                                            </div>
                                                            <div className="flex-[3] flex gap-4">
                                                                {cat.questions.map((q: any, qIdx: number) => {
                                                                    const isPlayed = gameState.playedQuestions?.includes(`${rIdx}-${cIdx}-${qIdx}`);
                                                                    return (
                                                                        <div key={qIdx} className={`flex-1 rounded-xl flex items-center justify-center border-2 ${isPlayed ? "bg-blue-900/20 border-blue-900/20" : "bg-blue-800 border-yellow-600"}`}>
                                                                            {!isPlayed && <span className="text-4xl md:text-5xl font-black text-yellow-400">{q.value}</span>}
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

                    {/* Question/Answer Modes */}
                    {['question', 'answer', 'final_bets', 'final_question', 'final_processing', 'final_reveal'].includes(display.screen) && activeQ && (
                        <motion.div
                            key="question"
                            initial={{ scale: 0.1, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 1.5, opacity: 0 }}
                            className="w-full bg-blue-800/90 backdrop-blur-xl border-[6px] border-yellow-500 rounded-3xl p-12"
                        >
                            <div className="text-3xl text-yellow-400 font-bold mb-8 flex justify-between border-b border-white/10 pb-4">
                                <span>{activeQ.category}</span>
                                <span>{display.screen === 'final_bets' ? 'СТАВКИ' : activeQ.value || 'ФИНАЛ'}</span>
                            </div>
                            <div className="text-5xl md:text-7xl font-bold mb-12 min-h-[200px] flex items-center justify-center">
                                {display.screen === 'final_bets' ? 'Делайте ваши ставки...' : activeQ.text}
                            </div>
                            {(display.screen === 'answer' || display.screen === 'final_reveal') && (
                                <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }}
                                    className="bg-green-600 inline-block px-12 py-4 rounded-full text-4xl font-bold">
                                    {activeQ.answer}
                                </motion.div>
                            )}
                        </motion.div>
                    )}

                    {/* Game Over */}
                    {display.screen === 'game_over' && (
                        <motion.div
                            key="game-over"
                            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                            className="w-full max-w-4xl bg-blue-900/40 backdrop-blur-xl border-4 border-yellow-500 rounded-3xl p-12"
                        >
                            <h2 className="text-6xl font-black text-yellow-400 mb-12">Итоги Игры</h2>
                            <div className="flex flex-col gap-4">
                                {Object.values(players || {})
                                    .sort((a: any, b: any) => b.score - a.score)
                                    .map((p: any, idx) => (
                                        <motion.div
                                            key={p.id}
                                            initial={{ x: -50, opacity: 0 }}
                                            animate={{ x: 0, opacity: 1 }}
                                            transition={{ delay: idx * 0.1 }}
                                            className={`flex justify-between items-center p-6 rounded-2xl ${idx === 0 ? 'bg-gradient-to-r from-yellow-600 to-yellow-400 text-black scale-105' : 'bg-white/10'}`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <span className="font-black text-2xl w-12">#{idx + 1}</span>
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
                        className="absolute bottom-0 left-0 right-0 bg-yellow-500 text-black p-8 text-center z-50 border-t-8 border-yellow-300"
                    >
                        <div className="text-2xl font-black uppercase opacity-60 mb-2">Отвечает</div>
                        <div className="text-6xl font-black">{buzzerPlayer.name}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
