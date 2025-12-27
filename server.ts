import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import ip from "ip";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "8080", 10);

const app = next({ dev, hostname, port, dir: process.cwd() });
const handler = app.getRequestHandler();

// ============ Types ============

type Player = {
    id: string;
    socketId: string;
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
        answer?: string;
    } | null;
};

type GameState = {
    id: string;
    createdAt: Date;
    players: Record<string, Player>;
    currentBuzzer: string | null;
    isBuzzerLocked: boolean;
    gameData: any | null;
    playedQuestions: string[];
    currentRound: number;
    display: DisplayState;
};

// ============ Games Storage ============

const games = new Map<string, GameState>();

function createGame(gameId: string): GameState {
    const game: GameState = {
        id: gameId,
        createdAt: new Date(),
        players: {},
        currentBuzzer: null,
        isBuzzerLocked: false,
        gameData: null,
        playedQuestions: [],
        currentRound: 0,
        display: {
            screen: "lobby",
            activeQuestion: null,
        },
    };
    games.set(gameId, game);
    console.log(`Game created: ${gameId}`);
    return game;
}

function getGame(gameId: string): GameState | undefined {
    return games.get(gameId);
}

function getOrCreateGame(gameId: string): GameState {
    return getGame(gameId) || createGame(gameId);
}

function deleteGame(gameId: string): void {
    games.delete(gameId);
    console.log(`Game deleted: ${gameId}`);
}

function getActiveGames(): { id: string; playerCount: number; createdAt: Date }[] {
    return Array.from(games.values()).map(g => ({
        id: g.id,
        playerCount: Object.keys(g.players).length,
        createdAt: g.createdAt,
    }));
}

// Cleanup old games (older than 24 hours)
setInterval(() => {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    games.forEach((game, gameId) => {
        if (now - game.createdAt.getTime() > maxAge) {
            deleteGame(gameId);
        }
    });
}, 60 * 60 * 1000); // Check every hour

// ============ Socket.IO ============

app.prepare().then(() => {
    const httpServer = createServer(handler);
    const io = new Server(httpServer);

    io.on("connection", (socket) => {
        console.log(`Client connected: ${socket.id}`);
        let currentGameId: string | null = null;

        // Join a specific game room
        socket.on("join-room", (gameId: string) => {
            if (currentGameId) {
                socket.leave(currentGameId);
            }
            currentGameId = gameId;
            socket.join(gameId);
            
            const game = getOrCreateGame(gameId);
            socket.emit("game-state", game);
            console.log(`Socket ${socket.id} joined game: ${gameId}`);
        });

        // Get list of active games
        socket.on("get-games", () => {
            socket.emit("games-list", getActiveGames());
        });

        // Player joins the game
        socket.on("join-game", (data: { name: string; playerId: string }) => {
            if (!currentGameId) return;
            const game = getGame(currentGameId);
            if (!game) return;

            const { name, playerId } = data;
            if (!playerId) {
                console.error("Join attempt without playerId");
                return;
            }

            console.log(`Player joining game ${currentGameId}: ${name} (${playerId})`);

            if (game.players[playerId]) {
                console.log(`Player ${name} reconnected to game ${currentGameId}`);
                game.players[playerId].socketId = socket.id;
            } else {
                game.players[playerId] = {
                    id: playerId,
                    socketId: socket.id,
                    name,
                    score: 0,
                };
            }

            io.to(currentGameId).emit("game-state", game);
        });

        // Buzz
        socket.on("buzz", () => {
            if (!currentGameId) return;
            const game = getGame(currentGameId);
            if (!game || game.display.screen !== "question") return;

            const player = Object.values(game.players).find(p => p.socketId === socket.id);
            if (!player) return;

            if (!game.isBuzzerLocked && !game.currentBuzzer) {
                game.currentBuzzer = player.id;
                game.isBuzzerLocked = true;

                io.to(currentGameId).emit("buzzer-winner", { playerId: player.id, playerName: player.name });
                io.to(currentGameId).emit("play-sound", "buzzer");
                io.to(currentGameId).emit("game-state", game);
            }
        });

        // Reset buzzer
        socket.on("reset-buzzer", () => {
            if (!currentGameId) return;
            const game = getGame(currentGameId);
            if (!game) return;

            game.currentBuzzer = null;
            game.isBuzzerLocked = false;
            io.to(currentGameId).emit("reset-buzzer");
            io.to(currentGameId).emit("game-state", game);
        });

        // Update score
        socket.on("update-score", ({ playerId, delta }: { playerId: string; delta: number }) => {
            if (!currentGameId) return;
            const game = getGame(currentGameId);
            if (!game || !game.players[playerId]) return;

            game.players[playerId].score += delta;
            io.to(currentGameId).emit("game-state", game);
        });

        // Update display
        socket.on("update-display", (newDisplayState: DisplayState) => {
            if (!currentGameId) return;
            const game = getGame(currentGameId);
            if (!game) return;

            game.display = newDisplayState;
            io.to(currentGameId).emit("game-state", game);
        });

        // Set game data
        socket.on("set-game-data", (data: any) => {
            if (!currentGameId) return;
            const game = getGame(currentGameId);
            if (!game) return;

            console.log(`Setting game data for ${currentGameId} with rounds:`, data?.rounds?.length);
            game.gameData = data;
            game.playedQuestions = [];
            game.currentRound = 0;
            io.to(currentGameId).emit("game-state", game);
        });

        // Mark question as played
        socket.on("mark-question-played", (questionId: string) => {
            if (!currentGameId) return;
            const game = getGame(currentGameId);
            if (!game) return;

            if (!game.playedQuestions.includes(questionId)) {
                game.playedQuestions.push(questionId);
                io.to(currentGameId).emit("game-state", game);
            }
        });

        // Reset game
        socket.on("reset-game", () => {
            if (!currentGameId) return;
            const game = getGame(currentGameId);
            if (!game) return;

            game.gameData = null;
            game.playedQuestions = [];
            game.currentBuzzer = null;
            game.isBuzzerLocked = false;
            game.display = { screen: "lobby", activeQuestion: null };
            game.currentRound = 0;
            
            Object.keys(game.players).forEach(pid => {
                game.players[pid].score = 0;
                game.players[pid].bet = undefined;
                game.players[pid].answer = undefined;
            });
            
            io.to(currentGameId).emit("game-state", game);
        });

        // Delete game completely
        socket.on("delete-game", () => {
            if (!currentGameId) return;
            
            io.to(currentGameId).emit("game-deleted");
            deleteGame(currentGameId);
        });

        // Next round
        socket.on("next-round", () => {
            if (!currentGameId) return;
            const game = getGame(currentGameId);
            if (!game?.gameData) return;

            if (game.currentRound < game.gameData.rounds.length - 1) {
                game.currentRound++;
                game.display = { ...game.display, screen: "board", activeQuestion: null };
                io.to(currentGameId).emit("game-state", game);
            }
        });

        // Set round
        socket.on("set-round", (roundIndex: number) => {
            if (!currentGameId) return;
            const game = getGame(currentGameId);
            if (!game?.gameData?.rounds?.[roundIndex]) return;

            game.currentRound = roundIndex;
            game.display = { ...game.display, screen: "board", activeQuestion: null };
            io.to(currentGameId).emit("game-state", game);
        });

        // Play sound
        socket.on("play-sound", (sound: string) => {
            if (!currentGameId) return;
            io.to(currentGameId).emit("play-sound", sound);
        });

        // Submit bet (final round)
        socket.on("submit-bet", (bet: number) => {
            if (!currentGameId) return;
            const game = getGame(currentGameId);
            if (!game) return;

            const player = Object.values(game.players).find(p => p.socketId === socket.id);
            if (player) {
                game.players[player.id].bet = bet;
                io.to(currentGameId).emit("game-state", game);
            }
        });

        // Submit answer (final round)
        socket.on("submit-answer", (answer: string) => {
            if (!currentGameId) return;
            const game = getGame(currentGameId);
            if (!game) return;

            const player = Object.values(game.players).find(p => p.socketId === socket.id);
            if (player) {
                game.players[player.id].answer = answer;
                io.to(currentGameId).emit("game-state", game);
            }
        });

        // Kick player
        socket.on("kick-player", (playerId: string) => {
            if (!currentGameId) return;
            const game = getGame(currentGameId);
            if (!game || !game.players[playerId]) return;

            delete game.players[playerId];
            io.to(currentGameId).emit("game-state", game);
        });

        // Disconnect
        socket.on("disconnect", () => {
            console.log(`Client disconnected: ${socket.id}`);
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
