
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import ip from "ip";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = 3000;

// When using Next.js in a custom server with app directory, we don't need a custom server for routing, just for socket.io
const app = next({ dev, hostname, port, dir: process.cwd() });
const handler = app.getRequestHandler();

// Game State Types
type Player = {
    id: string; // This is the persistent UUID
    socketId: string; // The current socket ID
    name: string;
    score: number;
    bet?: number;
    answer?: string;
};

type DisplayState = {
    screen: "lobby" | "qr" | "board" | "question" | "answer" | "final_bets" | "final_question" | "final_processing" | "final_reveal" | "game_over";
    activeQuestion?: {
        text: string;
        value: number;
        category: string;
        answer?: string; // Only sent in answer mode preferably, but for simplicity here ok
    } | null;
};

type GameState = {
    players: Record<string, Player>; // Key is playerId (UUID), NOT socket.id
    currentBuzzer: string | null; // This will store playerId (UUID)
    isBuzzerLocked: boolean;
    gameData: any | null; // Stores the full game content
    playedQuestions: string[]; // Format: "roundIndex-catIndex-qIndex"
    currentRound: number; // 0-indexed
    display: DisplayState;
};

const gameState: GameState = {
    players: {},
    currentBuzzer: null,
    isBuzzerLocked: false,
    display: {
        screen: "board",
        activeQuestion: null,
    },
    gameData: null,
    playedQuestions: [],
    currentRound: 0,
};

app.prepare().then(() => {
    const httpServer = createServer(handler);

    const io = new Server(httpServer);

    io.on("connection", (socket) => {
        console.log(`Client connected: ${socket.id}`);
        // Send initial state immediately
        if (!gameState.currentRound) gameState.currentRound = 0; // Hot-fix for potential null
        socket.emit("game-state", gameState);

        // --- Player Events ---

        socket.on("join-game", (data: { name: string, playerId: string }) => {
            const { name, playerId } = data;

            if (!playerId) {
                console.error("Join attempt without playerId");
                return;
            }

            console.log(`Player joining: ${name} (${playerId})`);

            // Check if player already exists (Reconnection)
            if (gameState.players[playerId]) {
                console.log(`Player ${name} reconnected. Updating socketId.`);
                gameState.players[playerId].socketId = socket.id;
                // Update name if changed? Maybe keep original.
            } else {
                // New Player
                gameState.players[playerId] = {
                    id: playerId,
                    socketId: socket.id,
                    name,
                    score: 0,
                };
            }

            io.emit("game-state", gameState);
        });

        socket.on("buzz", () => {
            if (gameState.display.screen !== 'question') {
                return;
            }
            // Find player by socketId
            const player = Object.values(gameState.players).find(p => p.socketId === socket.id);
            if (!player) return;

            if (!gameState.isBuzzerLocked && !gameState.currentBuzzer) {
                gameState.currentBuzzer = player.id; // Store UUID
                gameState.isBuzzerLocked = true;

                io.emit("buzzer-winner", { playerId: player.id, playerName: player.name });
                io.emit("play-sound", "buzzer");
                io.emit("game-state", gameState);
            }
        });

        // --- Admin Events ---

        socket.on("reset-buzzer", () => {
            gameState.currentBuzzer = null;
            gameState.isBuzzerLocked = false;
            io.emit("reset-buzzer");
            io.emit("game-state", gameState);
        });

        socket.on("update-score", ({ playerId, delta }: { playerId: string; delta: number }) => {
            if (gameState.players[playerId]) {
                gameState.players[playerId].score += delta;
                io.emit("game-state", gameState);
            }
        });

        socket.on("update-display", (newDisplayState: DisplayState) => {
            gameState.display = newDisplayState;
            io.emit("game-state", gameState);
        });

        socket.on("set-game-data", (data: any) => {
            console.log("Setting game data with rounds:", data?.rounds?.length);
            gameState.gameData = data;
            gameState.playedQuestions = [];
            gameState.currentRound = 0; // Reset round on new game data
            io.emit("game-state", gameState);
        });

        socket.on("mark-question-played", (questionId: string) => {
            if (!gameState.playedQuestions.includes(questionId)) {
                gameState.playedQuestions.push(questionId);
                io.emit("game-state", gameState);
            }
        });

        socket.on("reset-game", () => {
            gameState.gameData = null;
            gameState.playedQuestions = [];
            gameState.currentBuzzer = null;
            gameState.isBuzzerLocked = false;
            gameState.display = { screen: "lobby", activeQuestion: null };
            gameState.currentRound = 0;
            // Optionally reset scores? Let's keep players but reset scores for a "New Match".
            Object.keys(gameState.players).forEach(pid => {
                gameState.players[pid].score = 0;
            });
            io.emit("game-state", gameState);
        });

        socket.on("next-round", () => {
            console.log("Attempting next-round. Current:", gameState.currentRound, "Total:", gameState.gameData?.rounds?.length);
            if (gameState.gameData && gameState.currentRound < gameState.gameData.rounds.length - 1) {
                gameState.currentRound++;
                console.log("Round advanced to:", gameState.currentRound);
                // Reset display to board for new round
                gameState.display = { ...gameState.display, screen: "board", activeQuestion: null };
                io.emit("game-state", gameState);
            } else {
                console.log("Cannot advance round. Conditions not met.");
            }
        });

        socket.on("set-round", (roundIndex: number) => {
            console.log(`Received set-round request: ${roundIndex}`);
            if (!gameState.gameData) {
                console.error("set-round failed: gameState.gameData is null");
                return;
            }
            if (!gameState.gameData.rounds || !gameState.gameData.rounds[roundIndex]) {
                console.error(`set-round failed: Round ${roundIndex} not found. Total rounds: ${gameState.gameData.rounds?.length}`);
                return;
            }
            gameState.currentRound = roundIndex;
            console.log(`Server currentRound updated to: ${gameState.currentRound}`);

            gameState.display = { ...gameState.display, screen: "board", activeQuestion: null };
            io.emit("game-state", gameState);
        });

        socket.on("play-sound", (sound: string) => {
            io.emit("play-sound", sound);
        });

        socket.on("disconnect", () => {
            console.log("Client disconnected:", socket.id);
            // We DO NOT delete the player on disconnect to allow reconnection logic to work.
            // If we want to show "offline" status, we could add an 'online' boolean to Player type.
        });

        socket.on("submit-bet", (bet: number) => {
            const player = Object.values(gameState.players).find(p => p.socketId === socket.id);
            if (player) {
                gameState.players[player.id].bet = bet;
                io.emit("game-state", gameState);
            }
        });

        socket.on("submit-answer", (answer: string) => {
            const player = Object.values(gameState.players).find(p => p.socketId === socket.id);
            if (player) {
                gameState.players[player.id].answer = answer;
                io.emit("game-state", gameState);
            }
        });

    });

    httpServer
        .once("error", (err) => {
            console.error(err);
            process.exit(1);
        })
        .listen(port, () => {
            const localIp = ip.address();
            console.log(`> Ready on http://${hostname}:${port}`);
            console.log(`> Network access: http://${localIp}:${port}`);
        });
});
