"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket, joinGameRoom } from "@/lib/socket";
import { GameData, Question } from "@/lib/gemini";
import { fallbackGame } from "@/lib/fallback-game";
import Link from "next/link";

export default function AdminPage() {
    const params = useParams();
    const router = useRouter();
    const gameId = params.gameId as string;
    
    const [gameData, setGameData] = useState<GameData | null>(null);
    const [gameState, setGameState] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [showJsonPaste, setShowJsonPaste] = useState(false);
    const [jsonInput, setJsonInput] = useState("");
    const [nextRoundConfirm, setNextRoundConfirm] = useState(false);
    const [copied, setCopied] = useState(false);
    const [judgedPlayers, setJudgedPlayers] = useState<Record<string, 'correct' | 'wrong'>>({});

    const socket = getSocket();

    useEffect(() => {
        joinGameRoom(gameId);

        socket.on("game-state", (newState) => {
            setGameState(newState);
            if (!gameData && newState.gameData) {
                setGameData(newState.gameData);
            }
        });

        socket.on("game-deleted", () => {
            router.push("/");
        });

        return () => {
            socket.off("game-state");
            socket.off("game-deleted");
        };
    }, [gameId, gameData, socket, router]);

    const handleGenerate = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/generate", {
                method: "POST",
                body: JSON.stringify({ prompt }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setGameData(data);
            socket.emit("set-game-data", data);
        } catch (e) {
            alert("Error generating game: " + e);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (!json.rounds || !Array.isArray(json.rounds)) {
                    throw new Error("Invalid JSON format: missing 'rounds' array");
                }
                setGameData(json);
                socket.emit("set-game-data", json);
                alert("Игра успешно загружена!");
            } catch (err) {
                alert("Ошибка чтения файла: " + err);
            }
        };
        reader.readAsText(file);
    };

    const handleLoadDemo = () => {
        const data = fallbackGame;
        setGameData(data);
        socket.emit("set-game-data", data);
    };

    const handleJsonPaste = () => {
        try {
            const json = JSON.parse(jsonInput);
            if (!json.rounds || !Array.isArray(json.rounds)) {
                throw new Error("Invalid JSON format: missing 'rounds' array");
            }
            setGameData(json);
            socket.emit("set-game-data", json);
            setShowJsonPaste(false);
            alert("Игра успешно загружена из текста!");
        } catch (err) {
            alert("Ошибка чтения JSON: " + err);
        }
    };

    const showQuestion = (rIdx: number, cIdx: number, qIdx: number, category: string, q: Question) => {
        const round = gameData?.rounds[rIdx];
        if (round?.type === 'final') {
            socket.emit("update-display", {
                screen: "final_bets",
                activeQuestion: {
                    text: q.text,
                    value: 0,
                    category: category,
                    answer: q.answer
                }
            });
            socket.emit("mark-question-played", `${rIdx}-${cIdx}-${qIdx}`);
            return;
        }

        socket.emit("update-display", {
            screen: "question",
            activeQuestion: {
                text: q.text,
                value: q.value,
                category: category,
                answer: q.answer
            }
        });
        socket.emit("reset-buzzer");
        socket.emit("mark-question-played", `${rIdx}-${cIdx}-${qIdx}`);
    };

    const showAnswer = () => {
        if (gameState?.display?.activeQuestion) {
            socket.emit("update-display", {
                screen: "answer",
                activeQuestion: gameState.display.activeQuestion
            });
        }
    };

    const backToBoard = () => {
        socket.emit("update-display", { screen: "board", activeQuestion: null });
        socket.emit("reset-buzzer");
    };

    const adjustScore = (playerId: string, delta: number) => {
        socket.emit("update-score", { playerId, delta });
    };

    const copyGameCode = () => {
        navigator.clipboard.writeText(gameId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const kickPlayer = (playerId: string) => {
        if (confirm("Удалить этого игрока?")) {
            socket.emit("kick-player", playerId);
        }
    };

    return (
        <div className="min-h-screen bg-neutral-900 text-white p-4 font-sans text-sm">
            <header className="flex justify-between items-center mb-6 border-b border-neutral-700 pb-4">
                <div className="flex items-center gap-4">
                    <Link href="/" className="text-neutral-500 hover:text-white">← Назад</Link>
                    <h1 className="text-xl font-bold text-blue-400">Панель Ведущего</h1>
                    <button
                        onClick={copyGameCode}
                        className="px-3 py-1 bg-neutral-800 border border-neutral-600 rounded font-mono text-lg hover:bg-neutral-700 transition-colors"
                        title="Скопировать код игры"
                    >
                        {copied ? "✓ Скопировано!" : `🎮 ${gameId}`}
                    </button>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            if (confirm("Вы уверены, что хотите УДАЛИТЬ игру полностью?")) {
                                socket.emit("delete-game");
                            }
                        }}
                        className="px-3 py-1 bg-red-900 text-red-200 rounded hover:bg-red-800 font-bold border border-red-700"
                    >
                        🗑️ Удалить
                    </button>
                    <button
                        onClick={() => {
                            if (confirm("Сбросить игру? Это обнулит очки и вопросы.")) {
                                socket.emit("reset-game");
                                setGameData(null);
                            }
                        }}
                        className="px-3 py-1 bg-red-800 text-red-200 rounded hover:bg-red-700 font-bold border border-red-600"
                    >
                        ⛔ Сброс
                    </button>
                    <button onClick={() => socket.emit("reset-buzzer")} className="px-3 py-1 bg-yellow-600 rounded hover:bg-yellow-500">
                        Сброс Баззера
                    </button>
                    <button onClick={backToBoard} className="px-3 py-1 bg-neutral-700 rounded hover:bg-neutral-600">
                        К Таблице
                    </button>
                    <Link
                        href={`/game/${gameId}/display`}
                        target="_blank"
                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-500 font-bold flex items-center gap-2 no-underline"
                    >
                        📺 Проектор ↗
                    </Link>
                </div>
            </header>

            <div className="grid grid-cols-12 gap-4 h-[calc(100vh-100px)]">
                {/* Left Column: Game Board / Generator */}
                <div className="col-span-8 bg-neutral-800 rounded-xl p-4 overflow-y-auto">
                    {!gameData ? (
                        <div className="flex flex-col gap-4 max-w-md mx-auto mt-10">
                            <h2 className="text-lg font-bold">Создание игры</h2>
                            <textarea
                                className="w-full p-2 bg-neutral-900 border border-neutral-700 rounded text-neutral-200"
                                placeholder="О чем будет игра? (например: IT юмор, 90-е, Котики)"
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                rows={3}
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={handleGenerate}
                                    disabled={loading}
                                    className="flex-1 p-3 bg-blue-600 hover:bg-blue-500 rounded font-bold disabled:opacity-50"
                                >
                                    {loading ? "Генерирую..." : "Сгенерировать (Gemini)"}
                                </button>
                                <button
                                    onClick={() => {
                                        const topics = ["История мемов 2010-х", "Рок-н-ролл 80-х", "Кухни мира", "Странные факты о животных", "Космические путешествия"];
                                        setPrompt(topics[Math.floor(Math.random() * topics.length)]);
                                    }}
                                    className="w-12 bg-purple-600 hover:bg-purple-500 rounded font-bold flex items-center justify-center text-xl"
                                    title="Случайная тема"
                                >
                                    🎲
                                </button>
                            </div>
                            <div className="border-t border-neutral-700 pt-4 mt-4 text-center flex flex-col gap-2">
                                <button onClick={handleLoadDemo} className="text-neutral-400 hover:text-white text-sm underline">
                                    Загрузить Демо-Игру
                                </button>
                                <label className="cursor-pointer text-blue-400 hover:text-blue-300 text-sm underline block">
                                    <span>Загрузить из JSON файла</span>
                                    <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
                                </label>
                                <button
                                    onClick={() => setShowJsonPaste(!showJsonPaste)}
                                    className="text-yellow-400 hover:text-yellow-300 text-sm underline"
                                >
                                    {showJsonPaste ? "Скрыть" : "Вставить JSON"}
                                </button>
                                {showJsonPaste && (
                                    <div className="mt-2 text-left">
                                        <textarea
                                            value={jsonInput}
                                            onChange={e => setJsonInput(e.target.value)}
                                            placeholder='{ "rounds": ... }'
                                            className="w-full p-2 bg-black/50 border border-neutral-600 rounded text-xs font-mono text-green-400 h-32"
                                        />
                                        <button
                                            onClick={handleJsonPaste}
                                            disabled={!jsonInput.trim()}
                                            className="w-full mt-2 bg-green-700 hover:bg-green-600 p-2 rounded text-xs font-bold disabled:opacity-50"
                                        >
                                            Применить
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="bg-neutral-900 border border-neutral-700 p-4 rounded-xl flex flex-col gap-4 sticky top-0 z-10 shadow-lg">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-blue-300 font-bold">Управление Игрой</h3>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => socket.emit("update-display", { screen: "qr" })}
                                            className="bg-purple-600 hover:bg-purple-500 px-3 py-1 rounded font-bold text-xs"
                                        >
                                            📱 QR
                                        </button>
                                        <button
                                            onClick={() => socket.emit("update-display", { screen: "board" })}
                                            className="bg-green-600 hover:bg-green-500 px-3 py-1 rounded font-bold text-xs"
                                        >
                                            🚀 Start
                                        </button>
                                    </div>
                                </div>
                                <div className="flex gap-1 overflow-x-auto pb-2 border-t border-neutral-700 pt-2">
                                    <span className="text-neutral-500 text-xs self-center mr-2">Раунд:</span>
                                    {gameData?.rounds.map((r, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => socket.emit("set-round", idx)}
                                            className={`px-3 py-1 rounded text-xs font-bold whitespace-nowrap ${(gameState?.currentRound || 0) === idx
                                                ? "bg-yellow-500 text-black"
                                                : "bg-neutral-700 hover:bg-neutral-600 text-neutral-300"
                                            }`}
                                        >
                                            {r.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {gameData.rounds.map((round, rIdx) => (
                                rIdx === (gameState?.currentRound || 0) && (
                                    <div key={rIdx}>
                                        <div className="flex justify-between items-center mb-2">
                                            <h3 className="text-lg font-bold text-yellow-400">{round.name}</h3>
                                            <span className="text-neutral-500 text-xs">Раунд {rIdx + 1} из {gameData.rounds.length}</span>
                                        </div>
                                        <div className="grid grid-cols-1 gap-1 mb-8">
                                            {round.categories.map((cat, cIdx) => (
                                                <div key={cIdx} className="flex gap-2 items-center">
                                                    <div className="w-32 font-bold text-xs bg-neutral-700 p-2 rounded text-right shrink-0">
                                                        {cat.title}
                                                    </div>
                                                    <div className="flex gap-2 flex-1">
                                                        {cat.questions.map((q, qIdx) => (
                                                            <button
                                                                key={qIdx}
                                                                onClick={() => showQuestion(rIdx, cIdx, qIdx, cat.title, q)}
                                                                className={`flex-1 border p-2 rounded text-center font-mono transition-colors ${gameState?.playedQuestions?.includes(`${rIdx}-${cIdx}-${qIdx}`)
                                                                    ? "bg-neutral-800 border-neutral-800 text-neutral-600 cursor-not-allowed"
                                                                    : "bg-blue-900/30 border-blue-900 hover:bg-blue-800 text-blue-300"
                                                                }`}
                                                            >
                                                                {q.value}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {rIdx < gameData.rounds.length - 1 && (
                                            <div className="flex justify-end pt-4 border-t border-neutral-700">
                                                {!nextRoundConfirm ? (
                                                    <button
                                                        onClick={() => setNextRoundConfirm(true)}
                                                        className="bg-yellow-600 hover:bg-yellow-500 text-black px-6 py-3 rounded-xl font-bold"
                                                    >
                                                        Следующий Раунд 👉
                                                    </button>
                                                ) : (
                                                    <div className="flex gap-2 items-center">
                                                        <button
                                                            onClick={() => { socket.emit("next-round"); setNextRoundConfirm(false); }}
                                                            className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded font-bold"
                                                        >
                                                            Да
                                                        </button>
                                                        <button
                                                            onClick={() => setNextRoundConfirm(false)}
                                                            className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded font-bold"
                                                        >
                                                            Отмена
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            ))}

                            <div className="mt-8 p-4 bg-black/50 rounded border border-neutral-800 text-xs font-mono text-neutral-500">
                                <div className="font-bold text-neutral-300 mb-2">🔧 Debug</div>
                                <div>Game ID: {gameId}</div>
                                <div>Round: {gameState?.currentRound ?? "N/A"}</div>
                                <div>Socket: {socket.id}</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column */}
                <div className="col-span-4 flex flex-col gap-4">
                    {/* Active Question */}
                    <div className="bg-neutral-800 p-4 rounded-xl flex-1 border border-neutral-700">
                        <h3 className="text-xs uppercase font-bold text-neutral-500 mb-2">На экране</h3>
                        <div className="bg-black p-4 rounded min-h-[100px] flex flex-col justify-center items-center text-center">
                            {gameState?.display?.activeQuestion ? (
                                <>
                                    <div className="text-yellow-400 text-xs mb-1">
                                        {gameState.display.activeQuestion.category} ({gameState.display.activeQuestion.value})
                                    </div>
                                    <div className="font-bold mb-4">{gameState.display.activeQuestion.text}</div>
                                    <div className="text-xs text-neutral-500 border-t border-neutral-700 pt-2 mt-2">
                                        Ответ: <span className="text-green-400 font-bold">{gameState.display.activeQuestion.answer}</span>
                                    </div>

                                    {['final_bets', 'final_question', 'final_processing', 'final_reveal'].includes(gameState.display.screen) ? (
                                        <div className="flex flex-col gap-2 w-full mt-4">
                                            {gameState.display.screen === 'final_bets' && (
                                                <button onClick={() => socket.emit("update-display", { ...gameState.display, screen: "final_question" })}
                                                    className="bg-purple-600 hover:bg-purple-500 py-2 rounded font-bold">Показать Вопрос</button>
                                            )}
                                            {gameState.display.screen === 'final_question' && (
                                                <button onClick={() => { socket.emit("update-display", { ...gameState.display, screen: "final_processing" }); setJudgedPlayers({}); }}
                                                    className="bg-blue-600 hover:bg-blue-500 py-2 rounded font-bold">К Ответам</button>
                                            )}
                                            {gameState.display.screen === 'final_processing' && (
                                                <button onClick={() => socket.emit("update-display", { ...gameState.display, screen: "final_reveal" })}
                                                    className="bg-green-600 hover:bg-green-500 py-2 rounded font-bold">Показать Ответ</button>
                                            )}
                                            {gameState.display.screen === 'final_reveal' && (
                                                <button onClick={() => { socket.emit("update-display", { ...gameState.display, screen: "game_over" }); socket.emit("play-sound", "applaus"); }}
                                                    className="bg-yellow-500 hover:bg-yellow-400 text-black py-3 rounded font-black">🏆 ИТОГИ</button>
                                            )}
                                            
                                            {/* Players answers with judge buttons */}
                                            <div className="text-left text-xs bg-neutral-900 p-3 rounded mt-2 space-y-3">
                                                <div className="text-neutral-400 font-bold border-b border-neutral-700 pb-2">Ответы игроков:</div>
                                                {Object.values(gameState.players || {}).map((p: any) => (
                                                    <div key={p.id} className={`p-2 rounded border ${
                                                        judgedPlayers[p.id] === 'correct' ? 'border-green-500 bg-green-900/30' :
                                                        judgedPlayers[p.id] === 'wrong' ? 'border-red-500 bg-red-900/30' :
                                                        'border-neutral-700'
                                                    }`}>
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="font-bold text-sm">{p.name}</span>
                                                            <span className="text-yellow-400 font-mono">Ставка: {p.bet || 0}</span>
                                                        </div>
                                                        <div className="text-lg mb-2 text-white">
                                                            {p.answer ? `"${p.answer}"` : <span className="text-neutral-500 italic">Нет ответа</span>}
                                                        </div>
                                                        {(gameState.display.screen === 'final_processing' || gameState.display.screen === 'final_reveal') && (
                                                            <div className="flex gap-2">
                                                                {judgedPlayers[p.id] ? (
                                                                    <div className={`flex-1 text-center py-2 rounded font-bold ${
                                                                        judgedPlayers[p.id] === 'correct' ? 'bg-green-600' : 'bg-red-600'
                                                                    }`}>
                                                                        {judgedPlayers[p.id] === 'correct' ? `✅ +${p.bet || 0}` : `❌ -${p.bet || 0}`}
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <button
                                                                            onClick={() => {
                                                                                adjustScore(p.id, p.bet || 0);
                                                                                socket.emit("play-sound", "correct");
                                                                                setJudgedPlayers(prev => ({ ...prev, [p.id]: 'correct' }));
                                                                            }}
                                                                            className="flex-1 bg-green-600 hover:bg-green-500 py-2 rounded font-bold text-sm"
                                                                        >
                                                                            ✅ Верно (+{p.bet || 0})
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                adjustScore(p.id, -(p.bet || 0));
                                                                                socket.emit("play-sound", "wrong");
                                                                                setJudgedPlayers(prev => ({ ...prev, [p.id]: 'wrong' }));
                                                                            }}
                                                                            className="flex-1 bg-red-600 hover:bg-red-500 py-2 rounded font-bold text-sm"
                                                                        >
                                                                            ❌ Неверно (-{p.bet || 0})
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {gameState?.currentBuzzer ? (
                                                <div className="w-full flex gap-2 mt-4">
                                                    <button
                                                        onClick={() => {
                                                            adjustScore(gameState.currentBuzzer, gameState.display.activeQuestion.value);
                                                            socket.emit("play-sound", "correct");
                                                            showAnswer();
                                                            setTimeout(backToBoard, 3000);
                                                        }}
                                                        className="flex-1 bg-green-600 hover:bg-green-500 py-3 rounded font-bold"
                                                    >
                                                        ВЕРНО
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            adjustScore(gameState.currentBuzzer, -gameState.display.activeQuestion.value);
                                                            socket.emit("play-sound", "wrong");
                                                            socket.emit("reset-buzzer");
                                                        }}
                                                        className="flex-1 bg-red-600 hover:bg-red-500 py-3 rounded font-bold"
                                                    >
                                                        НЕВЕРНО
                                                    </button>
                                                </div>
                                            ) : (
                                                <button onClick={showAnswer} className="text-xs bg-neutral-700 px-2 py-1 rounded mt-4">
                                                    Показать ответ
                                                </button>
                                            )}
                                        </>
                                    )}
                                </>
                            ) : (
                                <span className="text-neutral-600">Табло</span>
                            )}
                        </div>
                    </div>

                    {/* Players */}
                    <div className="bg-neutral-800 p-4 rounded-xl flex-1 border border-neutral-700 overflow-y-auto">
                        <h3 className="text-xs uppercase font-bold text-neutral-500 mb-2">
                            Игроки ({Object.keys(gameState?.players || {}).length})
                        </h3>
                        <div className="space-y-2">
                            {Object.values(gameState?.players || {}).map((p: any) => (
                                <div key={p.id} className={`p-2 rounded flex justify-between items-center ${gameState?.currentBuzzer === p.id ? 'bg-yellow-900/50 border border-yellow-500' : 'bg-neutral-700/30'}`}>
                                    <div>
                                        <div className="font-bold text-sm flex items-center gap-2">
                                            {p.name}
                                            {gameState?.currentBuzzer === p.id && <span className="text-xs bg-yellow-500 text-black px-1 rounded">BUZZ!</span>}
                                        </div>
                                        <div className="text-xs font-mono text-neutral-400">{p.score}</div>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => adjustScore(p.id, 100)} className="w-6 h-6 bg-green-900 text-green-400 rounded hover:bg-green-800">+</button>
                                        <button onClick={() => adjustScore(p.id, -100)} className="w-6 h-6 bg-red-900 text-red-400 rounded hover:bg-red-800">-</button>
                                        <button onClick={() => kickPlayer(p.id)} className="w-6 h-6 bg-neutral-700 text-neutral-400 rounded hover:bg-neutral-600 text-xs">✕</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
