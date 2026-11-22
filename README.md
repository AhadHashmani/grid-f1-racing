# GRID — F1 Neuro Racing

A 3D F1-themed recreation of [alexkemp3038/reinforcement-learning-racing-game](https://github.com/alexkemp3038/reinforcement-learning-racing-game): neuroevolution cars with ray sensors, plus a drag-to-edit circuit and third-person human vs ML racing.

## Features

- **3D F1 circuit** with asphalt, kerbs, barriers, and chase-camera race view
- **Track editor** — drag control points to reshape the course live
- **Train AI** — same neuroevolution idea as the original (`9` ray inputs → `20` hidden → `4` controls)
- **Watch champion** — spectate the saved best brain
- **Race Bot** — drive in third person against the ML champion

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
| Stop training / watch champ | `Space` |
| Edit track | Open **Edit Track**, then click-drag the orange balls (teal = start/finish) |

## AI levels

| Level | What changes |
| --- | --- |
| **Rookie** | Slower rival, 1 lap, you get a pace edge, lighter training swarm |
| **Pro** | Even pace, 2 laps, standard training |
| **Elite** | Faster rival, 3 laps, bigger swarm — aim for ~60 generations |

## Modes

1. **Edit Track** — fixed top camera; drag orange nodes to reshape corners
2. **Train AI** — evolve a population; champion brains save to `localStorage`
3. **Watch Bot** — third-person view of the champion
4. **Race Bot** — you (red) vs champion (teal); lap count follows AI level

## Stack

Vite · TypeScript · Three.js
