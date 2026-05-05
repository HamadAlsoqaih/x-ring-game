# X Ring Game

A real-time 2-player online game with room codes.

## Rules

- Two players join the same room.
- There is a 9x6 sheet for each player.
- The active player chooses a number from the pile.
- The active player draws X marks on their own sheet as fast as possible by tapping/clicking/dragging.
- The other player searches the pile.
- The searcher must tap the correct number first, then press the ring button to confirm.
- The turn switches when the correct number is confirmed.
- After all 30 numbers are used, the player with more X marks wins.
- If a player fills all 54 squares, the game ends immediately.

## Run locally

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

## Play from different networks

Deploy it online using Render, Railway, or another Node.js hosting service.

### Render settings

- Build Command: `npm install`
- Start Command: `npm start`

A `render.yaml` file is included for easier deployment.

## GitHub upload

```bash
git init
git add .
git commit -m "Initial X Ring game"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/x-ring-game.git
git push -u origin main
```
