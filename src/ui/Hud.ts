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
  private helpTitle!: HTMLElement;
  private overlay!: HTMLElement;
  private banner!: HTMLElement;
  private editCoach!: HTMLElement;
  private onMode: ((mode: GameMode) => void) | null = null;
  private onAction: ((action: string) => void) | null = null;
  private lastFireAt = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "ui";
    parent.appendChild(this.root);
    this.renderShell();
    this.root.addEventListener("click", this.onRootPointer, true);
  }

  setHandlers(onMode: (mode: GameMode) => void, onAction: (action: string) => void) {
    this.onMode = onMode;
    this.onAction = onAction;
    this.bindButtons();
  }

  private fireAction(action: string) {
    const now = performance.now();
    if (now - this.lastFireAt < 280) return;
    this.lastFireAt = now;
    this.onAction?.(action);
  }

  private fireMode(mode: GameMode) {
    const now = performance.now();
    if (now - this.lastFireAt < 280) return;
    this.lastFireAt = now;
    this.onMode?.(mode);
  }

  private onRootPointer = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const actionBtn = target.closest<HTMLElement>("[data-action]");
    if (actionBtn?.dataset.action) {
      event.preventDefault();
      event.stopPropagation();
      this.fireAction(actionBtn.dataset.action);
      return;
    }

    const modeBtn = target.closest<HTMLElement>("[data-mode]");
    if (modeBtn?.dataset.mode) {
      event.preventDefault();
      event.stopPropagation();
      this.fireMode(modeBtn.dataset.mode as GameMode);
    }
  };

  /** Direct listeners — backup if delegated hits miss under WebGL overlays. */
  private bindButtons() {
    this.root.querySelectorAll<HTMLElement>("[data-action], [data-mode]").forEach((el) => {
      if ((el as HTMLElement & { __gridBound?: boolean }).__gridBound) return;
      (el as HTMLElement & { __gridBound?: boolean }).__gridBound = true;
      el.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const action = el.dataset.action;
        const mode = el.dataset.mode;
        if (action) this.fireAction(action);
        else if (mode) this.fireMode(mode as GameMode);
      });
    });
  }

  private renderShell() {
    this.root.innerHTML = `
      <div class="top-bar">
        <div class="brand">
          <div class="brand-mark">GR<span>ID</span></div>
          <div class="brand-sub">F1 Neuro Racing</div>
        </div>
        <div class="top-controls">
          <div class="mode-bar" id="mode-bar">
            <button type="button" data-mode="edit">Edit Track</button>
            <button type="button" data-mode="train">Train AI</button>
            <button type="button" data-mode="watch">Watch Bot</button>
            <button type="button" data-mode="race">Race Bot</button>
          </div>
        </div>
      </div>

      <div class="edit-coach hidden" id="edit-coach">
        <div class="edit-coach-title">Track editor</div>
        <ol>
          <li><strong>Click and drag</strong> an orange ball to bend that corner</li>
          <li>The <strong style="color:#00d2be">teal</strong> ball is start / finish — drag it too</li>
          <li>The asphalt updates live as you drag</li>
          <li>Then <strong>Train AI</strong> — watch the swarm learn your curves</li>
        </ol>
        <div class="edit-coach-actions">
          <button type="button" class="action-btn" data-action="reset-track">Reset Layout</button>
          <button type="button" class="action-btn primary" data-action="start-train">Train This Track</button>
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
        <h3 id="help-title">How to play</h3>
        <ul>
          <li>Edit the track, train a swarm, then race the champion</li>
          <li>Orange balls reshape the circuit in Edit Track</li>
          <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to drive in Race Bot</li>
        </ul>
      </div>

      <div class="race-banner" id="banner"></div>

      <div class="overlay visible" id="overlay">
        <div class="overlay-card">
          <h1>GR<span>ID</span></h1>
          <p>
            Sculpt a circuit, watch a swarm of AI cars learn in real time —
            each crash becomes a lesson that bot never repeats — then race the champion.
          </p>
          <div class="overlay-actions">
            <button type="button" class="action-btn primary" data-action="start-edit">Build Track</button>
            <button type="button" class="action-btn" data-action="start-train">Train AI</button>
            <button type="button" class="action-btn ghost" data-action="start-race">Race Champion</button>
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
    this.helpTitle = this.root.querySelector("#help-title")!;
    this.overlay = this.root.querySelector("#overlay")!;
    this.banner = this.root.querySelector("#banner")!;
    this.editCoach = this.root.querySelector("#edit-coach")!;

    this.root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((btn) => {
      this.modeButtons[btn.dataset.mode!] = btn;
    });
    this.bindButtons();
  }

  setMode(mode: GameMode) {
    Object.entries(this.modeButtons).forEach(([key, btn]) => {
      btn.classList.toggle("active", key === mode);
    });
    this.overlay.classList.toggle("visible", mode === "menu");
    this.editCoach.classList.toggle("hidden", mode !== "edit");
    this.root.classList.toggle("mode-edit", mode === "edit");
    this.root.querySelector(".train-actions")?.remove();

    const help = this.helpEl.querySelector("ul")!;
    if (mode === "edit") {
      this.helpTitle.textContent = "Editing the track";
      help.innerHTML = `
        <li><strong>Drag orange balls</strong> — each one pulls a corner</li>
        <li><strong style="color:#00d2be">Teal</strong> = start/finish line</li>
        <li>Camera stays fixed so dragging is easy</li>
        <li>Then hit <strong>Train AI</strong> to watch the swarm learn</li>
      `;
    } else if (mode === "train") {
      this.helpTitle.textContent = "Live training";
      help.innerHTML = `
        <li>Every car drives at once — crashes fade out as ghosts</li>
        <li>When a bot crashes, it <strong>learns that mistake</strong> and will not repeat it</li>
        <li>The pulsing lead car is closest to finishing a clean lap</li>
        <li><kbd>Space</kbd> jumps to the champion when ready</li>
      `;
      if (!this.root.querySelector(".train-actions")) {
        const actions = document.createElement("div");
        actions.className = "train-actions";
        actions.innerHTML = `
          <button type="button" class="action-btn" data-action="retrain-fresh">Retrain Fresh</button>
          <button type="button" class="action-btn primary" data-action="watch-champ">Watch Champ</button>
        `;
        this.helpEl.appendChild(actions);
        this.bindButtons();
      }
    } else if (mode === "race") {
      this.helpTitle.textContent = "Race controls";
      help.innerHTML = `
        <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows — third person</li>
        <li>Red = you · Teal = ML bot</li>
        <li>First to 2 laps wins · stay on asphalt</li>
      `;
    } else if (mode === "watch") {
      this.helpTitle.textContent = "Spectating";
      help.innerHTML = `
        <li>Watching the saved champion brain</li>
        <li>It carries crash lessons from training</li>
        <li>Resets after each completed lap</li>
      `;
    } else {
      this.helpTitle.textContent = "How to play";
      help.innerHTML = `
        <li>Edit the track, train a swarm, then race the champion</li>
        <li>Orange balls reshape the circuit in Edit Track</li>
        <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to drive in Race Bot</li>
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
        : `${opts.alive}${opts.lap > 0 ? ` · L${opts.lap}` : ""}`;
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
                `<button type="button" class="action-btn ${a.primary ? "primary" : ""}" data-action="${a.action}">${a.label}</button>`,
            )
            .join("")}
        </div>
      </div>
    `;
    this.overlay.classList.add("visible");
    this.bindButtons();
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
