const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};

const NAME_POOLS = {
    animals: [
        "TIGER", "LION", "ELEPHANT", "HORSE", "MONKEY",
        "BEAR", "WOLF", "FOX", "DEER", "RABBIT",
        "PANDA", "GIRAFFE", "ZEBRA", "CAMEL", "CROCODILE"
    ],

    fruits: [
        "MANGO", "APPLE", "BANANA", "ORANGE", "GRAPES",
        "PAPAYA", "GUAVA", "WATERMELON", "PINEAPPLE", "STRAWBERRY",
        "POMEGRANATE", "COCONUT", "PEAR", "PEACH", "CHERRY"
    ],

    names: [
        "RAJU", "MOHAN", "RAVI", "AMIT", "ROHIT",
        "RAHUL", "SONU", "MONU", "VIKAS", "ARJUN",
        "VIJAY", "KARAN", "AMAN", "RAJ", "DEEPAK"
    ],

    places: [
        "KOTA", "JAIPUR", "DELHI", "MUMBAI", "AGRA",
        "GOA", "PUNE", "AJMER", "UDAIPUR", "JODHPUR",
        "INDORE", "BHOPAL", "DUBAI", "LONDON", "PARIS"
    ],

    characters: [
        "HERO", "ROBOT", "NINJA", "PIRATE", "WIZARD",
        "SUPERHERO", "DETECTIVE", "COWBOY", "ALIEN", "KING",
        "QUEEN", "PRINCE", "WARRIOR", "MAGICIAN", "SPY"
    ],

    movies: [
        "DANGAL", "SHOLAY", "JAWAN", "PATHAAN", "KGF",
        "PUSHPA", "3IDIOTS", "BAHUBALI", "RAID", "URI",
        "SULTAN", "DON", "LAGAAN", "DRISHYAM", "RRR"
    ],

    sports: [
        "CRICKET", "FOOTBALL", "TENNIS", "HOCKEY", "BOXING",
        "WRESTLING", "BADMINTON", "GOLF", "RACING", "KABADDI",
        "BASKETBALL", "VOLLEYBALL", "CHESS", "SWIMMING", "CYCLING"
    ],

    funny: [
        "CHOCOLATE", "BOSS", "DONKEY", "ROCKET", "BULLET",
        "CHAMP", "JOKER", "PANDA", "ROBOT", "BOSSBABU",
        "SAMOSA", "JALEBI", "MAGGI", "LASSI", "PAPPU"
    ]
};

function makeRoomCode() {
    let code;

    do {
        code = Math.random()
            .toString(36)
            .substring(2, 7)
            .toUpperCase();
    } while (rooms[code]);

    return code;
}

function publicPlayers(room) {
    return room.players.map((player) => ({
        id: player.id,
        name: player.name
    }));
}

function sendPlayers(roomCode) {
    const room = rooms[roomCode];

    if (!room) return;

    io.to(roomCode).emit("playersUpdated", {
        players: publicPlayers(room),
        hostId: room.hostId
    });
}

function getRandomCardNames(count) {

    const allNames = Object.values(NAME_POOLS).flat();

    const shuffled = [...allNames].sort(
        () => Math.random() - 0.5
    );

    return shuffled.slice(0, count);
}


function createDeck(playerCount) {

    const selectedNames = getRandomCardNames(playerCount);

    const deck = [];

    // Har selected naam ki exactly 4 parchi
    for (const name of selectedNames) {

        for (let i = 0; i < 4; i++) {
            deck.push(name);
        }

    }

    // Cards ko completely shuffle karo
    return deck.sort(
        () => Math.random() - 0.5
    );
}
function dealCards(room) {
    const deck = createDeck(room.players.length);

    room.players.forEach((player) => {
        player.cards = [];
    });

    deck.forEach((card, index) => {
        room.players[index % room.players.length].cards.push(card);
    });
}

function getStateForPlayer(room, socketId) {
    const player = room.players.find(
        (player) => player.id === socketId
    );

    return {
        roomCode: room.code,
        players: publicPlayers(room),
        hostId: room.hostId,

        started: room.started,

        currentPlayerId: room.currentPlayerId,

        cards: player ? player.cards : [],

        winnerId: room.winnerId || null,

        winnerName: room.winnerName || null,

        winningCardName: room.winningCardName || null
    };
}

function broadcastGame(roomCode) {
    const room = rooms[roomCode];

    if (!room) return;

    room.players.forEach((player) => {
        io.to(player.id).emit(
            "gameState",
            getStateForPlayer(room, player.id)
        );
    });
}

function checkWinner(room) {
    for (const player of room.players) {
        const counts = {};

        for (const card of player.cards) {
            counts[card] = (counts[card] || 0) + 1;
        }

        const winningName = Object.keys(counts).find(
    (name) => counts[name] >= 4
);

        if (winningName) {
            room.winnerId = player.id;
            room.winnerName = player.name;
            room.winningCardName = winningName;

            return true;
        }
    }

    return false;
}

function nextPlayer(room, currentId) {
    const index = room.players.findIndex(
        (player) => player.id === currentId
    );

    if (index === -1) {
        return room.players[0]?.id;
    }

    return room.players[
        (index + 1) % room.players.length
    ].id;
}

io.on("connection", (socket) => {

    console.log(
        "Player connected:",
        socket.id
    );

    // =========================================
    // CREATE ROOM
    // =========================================

    socket.on(
        "createRoom",
        (playerName, callback) => {

            const name =
                String(playerName || "").trim();

            if (!name) {

                return callback?.({
                    success: false,
                    message:
                        "Pehle apna naam enter karo."
                });

            }

            const roomCode =
                makeRoomCode();

            rooms[roomCode] = {

                code: roomCode,

                hostId: socket.id,

                players: [
                    {
                        id: socket.id,
                        name: name,
                        cards: []
                    }
                ],

                started: false,

                currentPlayerId: null,

                winnerId: null,

                winnerName: null,

                winningCardName: null
            };

            socket.join(roomCode);

            socket.data.roomCode =
                roomCode;

            const result = {

                success: true,

                roomCode: roomCode,

                hostId: socket.id,

                players:
                    publicPlayers(
                        rooms[roomCode]
                    )
            };

            callback?.(result);

            socket.emit(
                "roomCreated",
                result
            );

            sendPlayers(roomCode);

            console.log(
                `${name} created room ${roomCode}`
            );
        }
    );

    // =========================================
    // JOIN ROOM
    // =========================================

    socket.on(
        "joinRoom",
        (data, callback) => {

            const roomCode =
                String(
                    data?.roomCode || ""
                )
                    .trim()
                    .toUpperCase();

            const name =
                String(
                    data?.playerName || ""
                ).trim();

            if (!name) {

                return callback?.({
                    success: false,
                    message:
                        "Pehle apna naam enter karo."
                });

            }

            if (!roomCode) {

                return callback?.({
                    success: false,
                    message:
                        "Room Code enter karo."
                });

            }

            const room =
                rooms[roomCode];

            if (!room) {

                return callback?.({
                    success: false,
                    message:
                        "Room nahi mila. Code check karo."
                });

            }

            if (room.started) {

                return callback?.({
                    success: false,
                    message:
                        "Game already start ho chuka hai."
                });

            }

            if (room.players.length >= 6) {

                return callback?.({
                    success: false,
                    message:
                        "Room full hai. Maximum 6 players."
                });

            }

            room.players.push({

                id: socket.id,

                name: name,

                cards: []
            });

            socket.join(roomCode);

            socket.data.roomCode =
                roomCode;

            const result = {

                success: true,

                roomCode: roomCode,

                hostId: room.hostId,

                players:
                    publicPlayers(room)
            };

            callback?.(result);

            socket.emit(
                "roomJoined",
                result
            );

            sendPlayers(roomCode);

            io.to(roomCode).emit(
                "lobbyMessage",
                `${name} joined the room 🎉`
            );

            console.log(
                `${name} joined room ${roomCode}`
            );
        }
    );

    // =========================================
    // START GAME
    // =========================================

    socket.on(
        "startGame",
        (callback) => {

            const roomCode =
                socket.data.roomCode;

            const room =
                rooms[roomCode];

            if (!room) {

                return callback?.({
                    success: false,
                    message:
                        "Room nahi mila."
                });

            }

            // ONLY HOST CAN START
            if (socket.id !== room.hostId) {

                return callback?.({
                    success: false,
                    message:
                        "Sirf host game start kar sakta hai."
                });

            }

            if (room.players.length < 4) {

                return callback?.({
                    success: false,
                    message:
                        "Game start karne ke liye kam se kam 4 players chahiye."
                });

            }

            if (room.started) {

                return callback?.({
                    success: false,
                    message:
                        "Game already start ho chuka hai."
                });

            }

            room.started = true;

            room.winnerId = null;

            room.winnerName = null;

            room.winningCardName = null;

            dealCards(room);

            room.currentPlayerId =
                room.players[0].id;

            callback?.({
                success: true
            });

            broadcastGame(roomCode);

            console.log(
                `Game started in room ${roomCode}`
            );
        }
    );

    // =========================================
    // PASS CARD
    // =========================================

    socket.on(
        "passCard",
        (data, callback) => {

            const roomCode =
                socket.data.roomCode;

            const room =
                rooms[roomCode];

            if (
                !room ||
                !room.started
            ) {

                return callback?.({
                    success: false,
                    message:
                        "Game abhi start nahi hua."
                });

            }

            if (room.winnerId) {

                return callback?.({
                    success: false,
                    message:
                        "Game khatam ho gaya hai."
                });

            }

            if (
                socket.id !==
                room.currentPlayerId
            ) {

                return callback?.({
                    success: false,
                    message:
                        "Abhi tumhari turn nahi hai."
                });

            }

            const cardIndex =
                Number(
                    data?.cardIndex
                );

            const targetId =
                String(
                    data?.targetId || ""
                );

            const player =
                room.players.find(
                    (p) =>
                        p.id === socket.id
                );

            const target =
                room.players.find(
                    (p) =>
                        p.id === targetId
                );

            if (
                !player ||
                !target ||
                target.id === player.id
            ) {

                return callback?.({
                    success: false,
                    message:
                        "Player select karo."
                });

            }

            if (
                !Number.isInteger(
                    cardIndex
                ) ||
                cardIndex < 0 ||
                cardIndex >=
                    player.cards.length
            ) {

                return callback?.({
                    success: false,
                    message:
                        "Valid card select karo."
                });

            }

            const [card] =
                player.cards.splice(
                    cardIndex,
                    1
                );

            target.cards.push(card);

            checkWinner(room);

            if (!room.winnerId) {

                room.currentPlayerId =
                    nextPlayer(
                        room,
                        player.id
                    );
            }

            callback?.({
                success: true
            });

            broadcastGame(roomCode);
        }
    );

    // =========================================
    // NEW ROUND
    // =========================================

    socket.on(
        "newRound",
        (callback) => {

            const roomCode =
                socket.data.roomCode;

            const room =
                rooms[roomCode];

            if (!room) {

                return callback?.({
                    success: false,
                    message:
                        "Room nahi mila."
                });

            }

            // Host starts the new round
            if (
                socket.id !==
                room.hostId
            ) {

                return callback?.({
                    success: false,
                    message:
                        "Sirf host new round start kar sakta hai."
                });

            }

            if (!room.winnerId) {

                return callback?.({
                    success: false,
                    message:
                        "Pehle current round complete karo."
                });

            }

            dealCards(room);

            room.winnerId = null;

            room.winnerName = null;

            room.winningCardName = null;

            room.started = true;

            room.currentPlayerId =
                room.players[0].id;

            callback?.({
                success: true
            });

            broadcastGame(roomCode);
        }
    );

    // =========================================
    // DISCONNECT
    // =========================================

    socket.on(
        "disconnect",
        () => {

            const roomCode =
                socket.data.roomCode;

            if (
                !roomCode ||
                !rooms[roomCode]
            ) {

                console.log(
                    "Player disconnected:",
                    socket.id
                );

                return;
            }

            const room =
                rooms[roomCode];

            const leavingPlayer =
                room.players.find(
                    (player) =>
                        player.id === socket.id
                );

            const leavingName =
                leavingPlayer?.name ||
                "Player";

            room.players =
                room.players.filter(
                    (player) =>
                        player.id !== socket.id
                );

            // No players left
            if (
                room.players.length === 0
            ) {

                delete rooms[roomCode];

                console.log(
                    `Room ${roomCode} deleted`
                );

                return;
            }

            // =================================
            // HOST LEFT
            // =================================

            if (
                socket.id ===
                room.hostId
            ) {

                room.hostId =
                    room.players[0].id;

                const newHost =
                    room.players[0];

                io.to(roomCode).emit(
                    "hostChanged",
                    {
                        hostId:
                            room.hostId,

                        hostName:
                            newHost.name
                    }
                );

                console.log(
                    `${newHost.name} is now host of ${roomCode}`
                );
            }

            // =================================
            // GAME WAS RUNNING
            // =================================

            if (room.started) {

                if (
                    room.currentPlayerId ===
                    socket.id
                ) {

                    room.currentPlayerId =
                        room.players[0].id;
                }

                // Less than 4 players
                if (
                    room.players.length < 4
                ) {

                    room.started = false;

                    room.currentPlayerId =
                        null;

                    room.winnerId = null;

                    room.winnerName = null;

                    room.winningCardName =
                        null;

                    io.to(roomCode).emit(
                        "lobbyMessage",
                        "Players 4 se kam ho gaye. Game pause ho gaya."
                    );

                    sendPlayers(roomCode);

                } else {

                    broadcastGame(
                        roomCode
                    );
                }

            } else {

                sendPlayers(
                    roomCode
                );
            }

            io.to(roomCode).emit(
                "lobbyMessage",
                `${leavingName} left the room 👋`
            );

            console.log(
                `${leavingName} disconnected`
            );
        }
    );
});

// =========================================
// SERVER START
// =========================================

const PORT =
    process.env.PORT || 3000;

server.listen(
    PORT,
    () => {

        console.log(
            "================================="
        );

        console.log(
            "          PARQO SERVER"
        );

        console.log(
            "================================="
        );

        console.log(
            `Game running on port ${PORT}`
        );
    }
);