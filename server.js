const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const SHAPES = ['heart', 'star', 'fish', 'paw', 'spiral', 'wave'];

function code() {
  let out = '';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  do {
    out = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(out));
  return out;
}

function makePile() {
  const used = new Set();
  while (used.size < 30) used.add(Math.floor(Math.random() * 100));
  return [...used].map((num, index) => ({ id: `${num}-${index}-${Date.now()}`, num, used: false }));
}

function publicRoom(room) {
  return {
    code: room.code,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      index: p.index,
      xCells: [...p.xCells],
      xCount: p.xCells.size
    })),
    pile: room.pile,
    shape: room.shape,
    activePlayer: room.activePlayer,
    target: room.target,
    phase: room.phase,
    winner: room.winner,
    message: room.message,
    chat: room.chat || [],
  };
}

function getRoom(socket) {
  const roomCode = socket.data.roomCode;
  return roomCode ? rooms.get(roomCode) : null;
}

function emitRoom(room) {
  io.to(room.code).emit('roomState', publicRoom(room));
}

function resetRoom(room) {
  room.pile = makePile();
  room.shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  room.activePlayer = 0;
  room.target = null;
  room.phase = room.players.length === 2 ? 'choose' : 'waiting';
  room.winner = null;
  room.message = room.players.length === 2 ? `${room.players[0].name} chooses a number.` : 'Waiting for player 2.';
  room.players.forEach(p => { p.xCells = new Set(); });
}

function endGame(room, reason) {
  const p1 = room.players[0];
  const p2 = room.players[1];
  room.phase = 'ended';
  if (p1.xCells.size > p2.xCells.size) room.winner = p1.index;
  else if (p2.xCells.size > p1.xCells.size) room.winner = p2.index;
  else room.winner = 'draw';
  room.message = reason;
}

function removePlayerFromRoom(socket) {
  const room = getRoom(socket);
  if (!room) return;
  socket.leave(room.code);
  room.players = room.players.filter(p => p.id !== socket.id);
  socket.data.roomCode = null;
  socket.data.playerIndex = null;

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return;
  }

  room.phase = 'waiting';
  room.target = null;
  room.winner = null;
  room.activePlayer = 0;
  room.message = 'Other player left. Waiting for a new player.';
  room.players.forEach((p, i) => { p.index = i; p.xCells = new Set(); });
  room.chat = [];
  resetRoom(room);
  emitRoom(room);
}

io.on('connection', socket => {
  socket.on('createRoom', ({ name }) => {
    const roomCode = code();
    const player = { id: socket.id, name: (name || 'Player 1').slice(0, 18), index: 0, xCells: new Set() };
    const room = {
      code: roomCode,
      players: [player],
      pile: makePile(),
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      activePlayer: 0,
      target: null,
      phase: 'waiting',
      winner: null,
      message: 'Waiting for player 2.',
      chat: []
    };
    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.playerIndex = 0;
    emitRoom(room);
  });

  socket.on('joinRoom', ({ name, roomCode }) => {
    roomCode = String(roomCode || '').trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) return socket.emit('errorMessage', 'Room not found.');
    if (room.players.length >= 2) return socket.emit('errorMessage', 'Room is full.');

    const player = { id: socket.id, name: (name || 'Player 2').slice(0, 18), index: 1, xCells: new Set() };
    room.players.push(player);
    room.phase = 'choose';
    room.message = `${room.players[0].name} chooses a number.`;
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.playerIndex = 1;
    emitRoom(room);
  });

  socket.on('chooseNumber', ({ pileId }) => {
    const room = getRoom(socket);
    if (!room || room.phase !== 'choose') return;
    if (socket.data.playerIndex !== room.activePlayer) return;
    const item = room.pile.find(n => n.id === pileId);
    if (!item || item.used) return;
    room.target = { id: item.id, num: item.num, chosenBy: room.activePlayer };
    room.phase = 'draw';
    const searcher = room.players[1 - room.activePlayer];
    room.message = `${searcher.name}, find ${item.num}, tap it, then press Ring.`;
    emitRoom(room);
  });

  socket.on('addX', ({ cellIndex }) => {
    const room = getRoom(socket);
    if (!room || room.phase !== 'draw' || room.winner !== null) return;
    const playerIndex = socket.data.playerIndex;
    if (playerIndex !== room.activePlayer) return;

    const index = Number(cellIndex);
    if (!Number.isInteger(index) || index < 0 || index >= 54) return;

    const player = room.players[playerIndex];
    if (player.xCells.has(index)) return;

    player.xCells.add(index);
    if (player.xCells.size >= 54) endGame(room, `${player.name} filled the sheet.`);
    emitRoom(room);
  });

  socket.on('foundNumber', ({ pileId }) => {
    const room = getRoom(socket);
    if (!room || room.phase !== 'draw' || !room.target) return;
    const playerIndex = socket.data.playerIndex;
    if (playerIndex === room.activePlayer) return;
    if (pileId !== room.target.id) return socket.emit('errorMessage', 'Wrong number. Keep searching.');

    const item = room.pile.find(n => n.id === pileId);
    if (!item || item.used) return;
    item.used = true;
    room.target = null;

    const remaining = room.pile.filter(n => !n.used).length;
    if (remaining === 0) {
      endGame(room, 'All 30 numbers were found. Highest X count wins.');
    } else {
      room.activePlayer = 1 - room.activePlayer;
      room.phase = 'choose';
      room.message = `${room.players[room.activePlayer].name} chooses a number.`;
    }
    emitRoom(room);
  });

  socket.on('chatMessage', ({ text }) => {
    const room = getRoom(socket);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const cleanText = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!cleanText) return;

    room.chat ||= [];
    room.chat.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      playerId: socket.id,
      name: player.name,
      text: cleanText,
      time: Date.now()
    });

    if (room.chat.length > 50) room.chat = room.chat.slice(-50);
    emitRoom(room);
  });

  socket.on('restart', () => {
    const room = getRoom(socket);
    if (!room || room.players.length < 2) return;
    resetRoom(room);
    emitRoom(room);
  });

  socket.on('leaveRoom', () => {
    removePlayerFromRoom(socket);
    socket.emit('leftRoom');
  });

  socket.on('disconnect', () => {
    removePlayerFromRoom(socket);
  });
});

server.listen(PORT, () => console.log(`X Ring Game running on http://localhost:${PORT}`));
