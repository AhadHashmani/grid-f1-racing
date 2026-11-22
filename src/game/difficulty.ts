export type DifficultyId = "rookie" | "pro" | "elite";

export type DifficultyConfig = {
  id: DifficultyId;
  label: string;
  blurb: string;
  /** How many generations the trainer pushes harder / longer sessions. */
  trainGenerationsHint: number;
  population: number;
  maxFrames: number;
  /** Bot top-speed multiplier vs baseline in races. */
  botSpeedMult: number;
  /** Bot steering agility multiplier. */
  botSteerMult: number;
  /** Player top-speed multiplier (rookie gets a slight edge). */
  playerSpeedMult: number;
  raceLaps: number;
  /** Extra mutation while training (higher = wilder exploration). */
  mutationBoost: number;
};

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  rookie: {
    id: "rookie",
    label: "Rookie",
    blurb: "Slower rival, 1 lap, you get a pace edge — good for learning the circuit.",
    trainGenerationsHint: 15,
    population: 18,
    maxFrames: 2200,
    botSpeedMult: 0.72,
    botSteerMult: 0.85,
    playerSpeedMult: 1.08,
    raceLaps: 1,
    mutationBoost: 0.05,
  },
  pro: {
    id: "pro",
    label: "Pro",
    blurb: "Even pace, 2 laps — train a solid champion then race it fair.",
    trainGenerationsHint: 35,
    population: 24,
    maxFrames: 2800,
    botSpeedMult: 1,
    botSteerMult: 1,
    playerSpeedMult: 1,
    raceLaps: 2,
    mutationBoost: 0,
  },
  elite: {
    id: "elite",
    label: "Elite",
    blurb: "Faster rival, 3 laps, bigger training swarm — needs a sharp champion brain.",
    trainGenerationsHint: 60,
    population: 32,
    maxFrames: 3400,
    botSpeedMult: 1.18,
    botSteerMult: 1.15,
    playerSpeedMult: 0.96,
    raceLaps: 3,
    mutationBoost: -0.02,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ["rookie", "pro", "elite"];
