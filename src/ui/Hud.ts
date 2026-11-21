export type GameMode = "menu" | "edit" | "train" | "watch" | "race";

export class Hud {
  root: HTMLElement;
  private modeButtons: Record<string, HTMLButtonElement> = {};
  private genEl!: HTMLElement;
  private scoreEl!: HTMLElement;
  private aliveEl!: HTMLElement;
  private timeEl!: HTMLElement;
  private speedEl!: HTMLElement;
  private helpEl!: HTMLElement;
  private overlay!: HTMLElement;
  private banner!: HTMLElement;
  private onMode: ((mode: GameMode) => void) | null = null;
  private onAction: ((action: string) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "ui";
    parent.appendChild(this.root);
    this.renderShell();
  }

  setHandlers(onMode: (mode: GameMode) => void, onAction: (action: string) => void) {
    this.onMode = onMode;
    this.onAction = onAction;
  }

  private renderShell() {
    this.root.innerHTML = `
      <div class="top-bar">
        <div class="brand">
          <div class="brand-mark">GR<span>ID</span></div>
          <div class="brand-sub">F1 Neuro Racing</div>
        </div>
        <div class="mode-bar" id="mode-bar">
          <button data-mode="edit">Edit Track</button>
          <button data-mode="train">Train AI</button>
          <button data-mode="watch">Watch Bot</button>
          <button data-mode="race">Race Bot</button>
        </div>
      </div>

      <div class="hud" id="stats">
        <div class="hud-card">
          <div class="hud-label">Generation</div>
          <div class="hud-value" id="stat-gen">1</div>
        </div>
        <div class="hud-card">
          <div class="hud-label">Best Score</div>
          <div class="hud-value accent" id="stat-score">0</div>
        </div>
        <div class="hud-card">
          <div class="hud-label">Alive / Lap</div>
          <div class="hud-value" id="stat-alive">0</div>
        </div>
        <div class="hud-card">
          <div class="hud-label">Session</div>
          <div class="hud-value amber" id="stat-time">00:00.0</div>
        </div>
      </div>

      <div class="speedo">
        <div class="num" id="stat-speed">0</div>
        <div class="unit">KM/H</div>
      </div>

      <div class="help" id="help">
        <h3>How to drive</h3>
        <ul>
          <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows to race</li>
          <li>Drag amber nodes to reshape the circuit</li>
          <li>Train the swarm, then race the champion</li>
        </ul>
      </div>

      <div class="race-banner" id="banner"></div>

      <div class="overlay visible" id="overlay">
        <div class="overlay-card">
          <h1>GR<span>ID</span></h1>
          <p>
            A 3D F1-themed neuroevolution racer. Sculpt your own circuit, evolve a bot
            with ray sensors, then challenge it in third-person.
          </p>
          <div class="overlay-actions">
            <button class="action-btn primary" data-action="start-edit">Build Track</button>
            <button class="action-btn" data-action="start-train">Train AI</button>
            <button class="action-btn ghost" data-action="start-race">Race Champion</button>
          </div>
        </div>
      </div>
    `;

    this.genEl = this.root.querySelector("#stat-gen")!;
    this.scoreEl = this.root.querySelector("#stat-score")!;
    this.aliveEl = this.root.querySelector("#stat-alive")!;
    this.timeEl = this.root.querySelector("#stat-time")!;
    this.speedEl = this.root.querySelector("#stat-speed")!;
    this.helpEl = this.root.querySelector("#help")!;
    this.overlay = this.root.querySelector("#overlay")!;
    this.banner = this.root.querySelector("#banner")!;

    this.root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((btn) => {
      this.modeButtons[btn.dataset.mode!] = btn;
      btn.addEventListener("click", () => this.onMode?.(btn.dataset.mode as GameMode));
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => this.onAction?.(btn.dataset.action!));
    });
  }

  setMode(mode: GameMode) {
    Object.entries(this.modeButtons).forEach(([key, btn]) => {
      btn.classList.toggle("active", key === mode);
    });
    this.overlay.classList.toggle("visible", mode === "menu");

    const help = this.helpEl.querySelector("ul")!;
    if (mode === "edit") {
      help.innerHTML = `
        <li>Drag amber spheres to reshape corners</li>
        <li>Teal sphere marks the start / finish</li>
        <li>Then hit <strong>Train AI</strong> or <strong>Race Bot</strong></li>
      `;
    } else if (mode === "train") {
      help.innerHTML = `
        <li>Cars learn via neuroevolution + wall rays</li>
        <li>Best brains mutate into the next generation</li>
        <li>Press <kbd>Space</kbd> to stop and watch the champ</li>
      `;
    } else if (mode === "race") {
      help.innerHTML = `
        <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to drive in third person</li>
        <li>Red car is you — teal is the ML champion</li>
        <li>Stay on asphalt or you DNF</li>
      `;
    } else if (mode === "watch") {
      help.innerHTML = `
        <li>Spectating the saved champion brain</li>
        <li>It resets after each completed lap</li>
        <li>Retrain anytime from <strong>Train AI</strong></li>
      `;
    }
  }

  updateStats(opts: {
    generation: number;
    bestScore: number;
    alive: number;
    lap: number;
    timeSec: number;
    speed: number;
    mode: GameMode;
  }) {
    this.genEl.textContent = String(opts.generation);
    this.scoreEl.textContent = String(opts.bestScore);
    this.aliveEl.textContent =
      opts.mode === "race" || opts.mode === "watch"
        ? `L${opts.lap}`
        : `${opts.alive}`;
    this.timeEl.textContent = formatTime(opts.timeSec);
    this.speedEl.textContent = String(Math.round(Math.abs(opts.speed) * 8.2));
  }

  showBanner(text: string, ms = 1800) {
    this.banner.textContent = text;
    this.banner.classList.add("show");
    window.setTimeout(() => this.banner.classList.remove("show"), ms);
  }

  showResult(title: string, detail: string, actions: { label: string; action: string; primary?: boolean }[]) {
    this.overlay.innerHTML = `
      <div class="overlay-card">
        <h1>${title}</h1>
        <p>${detail}</p>
        <div class="overlay-actions">
          ${actions
            .map(
              (a) =>
                `<button class="action-btn ${a.primary ? "primary" : ""}" data-action="${a.action}">${a.label}</button>`,
            )
            .join("")}
        </div>
      </div>
    `;
    this.overlay.classList.add("visible");
    this.overlay.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => this.onAction?.(btn.dataset.action!));
    });
  }

  hideOverlay() {
    this.overlay.classList.remove("visible");
  }
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}
