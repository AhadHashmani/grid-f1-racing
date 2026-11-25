# GRID — F1 Neuro Racing

Build a circuit, watch a full swarm of neural cars learn it, then race the champion.

## How to play

1. **Build** — drag orange balls (or hit Random Layout) to shape the track  
2. **Train** — watch every simulation car learn together from a wide overview  
3. **Race** — unlocks after a bot finishes a lap; you (red) vs champion (teal)

Race and Watch stay locked until training produces a champion for the current layout. Changing the track clears the champion so you retrain on what you see.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://127.0.0.1:3847`).

## Controls

| Action | Input |
| --- | --- |
| Drive | `W A S D` / arrows, or on-screen pad |
| Jump to champion while training | `Space` (only after a lap) |
| Build track | **1 · Build** → drag orange balls (teal = start/finish) |

## Stack

Vite · TypeScript · Three.js
