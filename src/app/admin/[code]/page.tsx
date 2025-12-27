"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { socket, joinRoom } from "@/lib/socket";
import { GameData, Round, Category, Question } from "@/lib/gemini";
import { fallbackGame } from "@/lib/fallback-game";

type HostInfo = {
    host: string;
    isPublicDomain: boolean;
};

export default function AdminPage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = use(params);
    const router = useRouter();
    
    const [gameData, setGameData] = useState<GameData | null>(null);
    const [gameState, setGameState] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [showJsonPaste, setShowJsonPaste] = useState(false);
    const [jsonInput, setJsonInput] = useState("");
    const [nextRoundConfirm, setNextRoundConfirm] = useState(false);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState("");
    const [hostInfo, setHostInfo] = useState<HostInfo | null>(null);

    useEffect(() => {
        // Fetch host info for QR
        fetch('/api/ip')
            .then(res => res.json())
            .then(data => setHostInfo(data))
            .catch(console.error);

        // Join room as admin
        const connectToRoom = async () => {
            const result = await joinRoom(code, 'admin');
            if (!result.success) {
                setError(result.error || "Не удалось подключиться к комнате");
                return;
            }
            setConnected(true);
        };

        if (socket.connected) {
            connectToRoom();
        } else {
            socket.on("connect", connectToRoom);
        }

        socket.on("game-state", (newState) => {
            setGameState(newState);
            if (!gameData && newState.gameData) {
                setGameData(newState.gameData);
            }
        });

        return () => {
            socket.off("connect", connectToRoom);
            socket.off("game-state");
        };
    }, [code, gameData]);

    // Build player URL
    const getPlayerUrl = () => {
        if (!hostInfo?.host) {
            return typeof window !== 'undefined' ? `${window.location.origin}/play/${code}` : `/play/${code}`;
        }
        if (hostInfo.isPublicDomain) {
            return `https://${hostInfo.host}/play/${code}`;
        }
        const port = typeof window !== 'undefined' && window.location.port ? `:${window.location.port}` : '';
        return `http://${hostInfo.host}${port}/play/${code}`;
    };
    const playerUrl = getPlayerUrl();

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

    if (error) {
        return (
            <div className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center p-8">
                <h1 className="text-4xl font-bold text-red-500 mb-4">Ошибка</h1>
                <p className="text-neutral-400 mb-8">{error}</p>
                <button
                    onClick={() => router.push('/')}
                    className="px-6 py-3 bg-blue-600 rounded-xl font-bold"
                >
                    На главную
                </button>
            </div>
        );
    }

    if (!connected) {
        return (
            <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
                    <p>Подключение к комнате {code}...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-neutral-900 text-white p-4 font-sans text-sm">
            <header className="flex justify-between items-center mb-6 border-b border-neutral-700 pb-4">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold text-blue-400">Панель Ведущего</h1>
                    <div className="px-3 py-1 bg-yellow-600 text-black font-mono font-bold rounded">
                        {code}
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            if (confirm("Вы уверены, что хотите СБРОСИТЬ всю игру?")) {
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
                    <a
                        href={`/display/${code}`}
                        target="_blank"
                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-500 font-bold flex items-center gap-2 no-underline"
                    >
                        📺 Проектор
                    </a>
                </div>
            </header>

            <div className="grid grid-cols-12 gap-4 h-[calc(100vh-100px)]">
                {/* Left Column: Game Board / Generator */}
                <div className="col-span-8 bg-neutral-800 rounded-xl p-4 overflow-y-auto">
                    {!gameData ? (
                        <div className="flex flex-col gap-4 max-w-md mx-auto mt-10">
                            <h2 className="text-lg font-bold">Создание игры</h2>
                            
                            {/* Player URL info */}
                            <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
                                <p className="text-xs text-neutral-400 mb-2">Ссылка для игроков:</p>
                                <p className="font-mono text-sm text-green-400 break-all">{playerUrl}</p>
                            </div>

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
                                    className="text-yellow-400 hover:text-yellow-300 text-sm underline block w-full"
                                >
                                    {showJsonPaste ? "Скрыть вставку JSON" : "Вставить JSON текст"}
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
                                            Применить JSON
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Game Flow Controls */}
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
                                    <span className="text-neutral-500 text-xs self-center mr-2">Переход:</span>
                                    {gameData?.rounds.map((r, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => socket.emit("set-round", idx)}
                                            className={`px-3 py-1 rounded text-xs font-bold whitespace-nowrap ${
                                                (gameState?.currentRound || 0) === idx
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
                                            <span className="text-neutral-500 text-xs">
                                                Раунд {rIdx + 1} из {gameData.rounds.length}
                                            </span>
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
                                                                className={`flex-1 border p-2 rounded text-center font-mono ${
                                                                    gameState?.playedQuestions?.includes(`${rIdx}-${cIdx}-${qIdx}`)
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
                                                        Следующий Раунд ({gameData.rounds[rIdx + 1].name}) 👉
                                                    </button>
                                                ) : (
                                                    <div className="flex gap-2 items-center">
                                                        <span className="text-yellow-400 font-bold mr-2">Перейти?</span>
                                                        <button
                                                            onClick={() => {
                                                                socket.emit("next-round");
                                                                setNextRoundConfirm(false);
                                                            }}
                                                            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold"
                                                        >
                                                            Да
                                                        </button>
                                                        <button
                                                            onClick={() => setNextRoundConfirm(false)}
                                                            className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded font-bold"
                                                        >
                                                            Нет
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            ))}
                        </div>
                    )}
                </div>

                {/* Right Column */}
                <div className="col-span-4 flex flex-col gap-4">
                    {/* Current Active Item */}
                    <div className="bg-neutral-800 p-4 rounded-xl flex-1 border border-neutral-700">
                        <h3 className="text-xs uppercase font-bold text-neutral-500 mb-2">Сейчас на экране</h3>
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
                                                <button onClick={() => socket.emit("update-display", { ...gameState.display, screen: "final_question" })} className="bg-purple-600 py-2 rounded font-bold">
                                                    Показать Вопрос
                                                </button>
                                            )}
                                            {gameState.display.screen === 'final_question' && (
                                                <button onClick={() => socket.emit("update-display", { ...gameState.display, screen: "final_processing" })} className="bg-blue-600 py-2 rounded font-bold">
                                                    К Ответам
                                                </button>
                                            )}
                                            {gameState.display.screen === 'final_processing' && (
                                                <button onClick={() => socket.emit("update-display", { ...gameState.display, screen: "final_reveal" })} className="bg-green-600 py-2 rounded font-bold">
                                                    Показать Ответ
                                                </button>
                                            )}
                                            {gameState.display.screen === 'final_reveal' && (
                                                <button
                                                    onClick={() => {
                                                        socket.emit("update-display", { ...gameState.display, screen: "game_over" });
                                                        socket.emit("play-sound", "applaus");
                                                    }}
                                                    className="bg-yellow-500 text-black py-3 rounded font-black animate-pulse"
                                                >
                                                    🏆 ИТОГИ
                                                </button>
                                            )}
                                            <div className="text-left text-xs bg-neutral-900 p-2 rounded mt-2">
                                                <div className="font-bold mb-2 text-neutral-500">Ставки / Ответы:</div>
                                                {Object.values(gameState.players || {}).map((p: any) => (
                                                    <div key={p.id} className="flex flex-col gap-1 border-b border-neutral-800 py-2 last:border-0">
                                                        <div className="flex justify-between items-center">
                                                            <span className="font-bold text-sm">{p.name} <span className="text-neutral-500 text-xs">(Ставка: {p.bet || 0})</span></span>
                                                            <span className="text-yellow-400 font-mono">{p.answer || '...'}</span>
                                                        </div>
                                                        {gameState.display.screen === 'final_reveal' && (
                                                            <div className="flex gap-1 justify-end">
                                                                <button onClick={() => { adjustScore(p.id, p.bet || 0); socket.emit("play-sound", "correct"); }} className="px-2 py-1 bg-green-900 text-green-200 rounded text-xs">
                                                                    ✅ +{p.bet || 0}
                                                                </button>
                                                                <button onClick={() => { adjustScore(p.id, -(p.bet || 0)); socket.emit("play-sound", "wrong"); }} className="px-2 py-1 bg-red-900 text-red-200 rounded text-xs">
                                                                    ❌ -{p.bet || 0}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {gameState?.currentBuzzer ? (
                                                <div className="w-full flex gap-2 animate-pulse mt-4">
                                                    <button
                                                        onClick={() => {
                                                            adjustScore(gameState.currentBuzzer, gameState.display.activeQuestion.value);
                                                            socket.emit("play-sound", "correct");
                                                            showAnswer();
                                                            setTimeout(backToBoard, 3000);
                                                        }}
                                                        className="flex-1 bg-green-600 py-3 rounded font-bold text-lg"
                                                    >
                                                        ВЕРНО
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            adjustScore(gameState.currentBuzzer, -gameState.display.activeQuestion.value);
                                                            socket.emit("play-sound", "wrong");
                                                            socket.emit("reset-buzzer");
                                                        }}
                                                        className="flex-1 bg-red-600 py-3 rounded font-bold text-lg"
                                                    >
                                                        НЕВЕРНО
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    {gameState.display.screen === 'answer' ? (
                                                        <div className="w-full mt-4">
                                                            <button onClick={backToBoard} className="w-full bg-neutral-700 py-3 rounded font-bold">
                                                                К таблице
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
                                    )}
                                </>
                            ) : (
                                <span className="text-neutral-600">Табло</span>
                            )}
                        </div>
                    </div>

                    {/* Players List */}
                    <div className="bg-neutral-800 p-4 rounded-xl flex-1 border border-neutral-700 overflow-y-auto">
                        <h3 className="text-xs uppercase font-bold text-neutral-500 mb-2">
                            Игроки ({Object.keys(gameState?.players || {}).length})
                        </h3>
                        <div className="space-y-2">
                            {Object.values(gameState?.players || {}).map((p: any) => (
                                <div key={p.id} className={`p-2 rounded flex justify-between items-center ${gameState?.currentBuzzer === p.id ? 'bg-yellow-900/50 border border-yellow-500' : 'bg-neutral-700/30'}`}>
                                    <div>
                                        <div className="font-bold text-sm flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${p.is_online ? 'bg-green-500' : 'bg-neutral-600'}`} />
                                            {p.name}
                                            {gameState?.currentBuzzer === p.id && <span className="text-xs bg-yellow-500 text-black px-1 rounded">BUZZ!</span>}
                                        </div>
                                        <div className="text-xs font-mono text-neutral-400">{p.score}</div>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => adjustScore(p.id, 100)} className="w-6 h-6 bg-green-900 text-green-400 rounded">+</button>
                                        <button onClick={() => adjustScore(p.id, -100)} className="w-6 h-6 bg-red-900 text-red-400 rounded">-</button>
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
