# GRID — F1 Neuro Racing

A 3D F1-themed recreation of [alexkemp3038/reinforcement-learning-racing-game](https://github.com/alexkemp3038/reinforcement-learning-racing-game): live neuroevolution with crash memory, a drag-to-edit circuit, and third-person human vs ML racing.

## Features

- **3D F1 circuit** with asphalt, kerbs, barriers, and chase-camera race view
- **Track editor** — drag control points to reshape the course live
- **Live Train AI** — watch the full swarm drive; crashes fade to ghosts
- **Crash memory** — when a bot hits a wall a certain way, that brain never repeats the same mistake
- **Watch champion** — spectate the saved best brain
- **Race Bot** — drive in third person against the ML champion (2 laps)

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://127.0.0.1:3847`).

## Controls

| Action | Input |
| --- | --- |
| Drive | `W A S D` or arrow keys |
| Jump to champion while training | `Space` |
| Edit track | Open **Edit Track**, then click-drag the orange balls (teal = start/finish) |

## Modes

1. **Edit Track** — fixed top camera; drag orange nodes to reshape corners
2. **Train AI** — every car races at once; elites keep crash lessons across generations
3. **Watch Bot** — third-person view of the champion
4. **Race Bot** — you (red) vs champion (teal); first to 2 laps

## Stack

Vite · TypeScript · Three.js
