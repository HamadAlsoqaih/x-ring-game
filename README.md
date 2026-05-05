# X Ring Game

A real-time 2-player online room game.

## Game idea

- There are 2 players.
- A pile has 30 random numbers from 0 to 99.
- The active player chooses one number from the pile.
- The active player draws X marks on their own 9x6 sheet using mouse or touch.
- The other player searches the pile.
- When the searcher finds the number, they press the ring button, then click the correct number.
- The turn switches.
- The game ends when all numbers are used or a player fills all 54 squares.
- The player with more X marks wins.

## Tech stack

- Node.js
- Express
- Socket.io
- HTML/CSS/JavaScript

## Run locally

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

## How to play online locally

Open the game in two browser tabs or two devices on the same network.

Player 1 creates a room. Player 2 joins using the room code.

## Deploy

You can upload this project to GitHub and deploy it on Render, Railway, or any Node.js hosting service.

Start command:

```bash
npm start
```

Node version:

```text
18+
```
