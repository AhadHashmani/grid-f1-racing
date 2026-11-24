# GRID — F1 Neuro Racing

A 3D F1-themed recreation of [alexkemp3038/reinforcement-learning-racing-game](https://github.com/alexkemp3038/reinforcement-learning-racing-game): live neuroevolution with crash memory, a drag-to-edit circuit, and third-person human vs ML racing.

## Features

- **Fast 3D circuit** — instanced kerbs/walls, deferred Game chunk, boot splash
- **Track editor** — drag control points to reshape the course live
- **Live Train AI** — full swarm drives at once; leader shows sensor rays + lap meter
- **Crash memory** — each bot stores crash lessons and will not repeat that mistake
- **Touch + keyboard race** — on-screen pad on mobile, `WASD` on desktop
- **Watch / Race** — spectate or duel the champion (2 laps)

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
| Jump to champion while training | `Space` |
| Edit track | **Edit Track** → drag orange balls (teal = start/finish) |

## Modes

1. **Edit Track** — fixed top camera; drag nodes to reshape corners  
2. **Train AI** — swarm learns live; pulsing lead car + ray beams  
3. **Watch Bot** — third-person champion  
4. **Race Bot** — you (red) vs champion (teal)

## Stack

Vite · TypeScript · Three.js
