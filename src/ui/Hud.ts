import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  type DifficultyId,
} from "../game/difficulty";

export type GameMode = "menu" | "edit" | "train" | "watch" | "race";

export class Hud {
  root: HTMLElement;
  private modeButtons: Record<string, HTMLButtonElement> = {};
  private difficultyButtons: Record<string, HTMLButtonElement> = {};
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
  private diffBlurb!: HTMLElement;
  private difficulty: DifficultyId = "pro";
  private onMode: ((mode: GameMode) => void) | null = null;
  private onAction: ((action: string) => void) | null = null;
  private onDifficulty: ((id: DifficultyId) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "ui";
    parent.appendChild(this.root);
    this.renderShell();
    this.root.addEventListener("click", this.onRootClick, true);
  }

  setHandlers(
    onMode: (mode: GameMode) => void,
    onAction: (action: string) => void,
    onDifficulty: (id: DifficultyId) => void,
  ) {
    this.onMode = onMode;
    this.onAction = onAction;
    this.onDifficulty = onDifficulty;
  }

  getDifficulty(): DifficultyId {
    return this.difficulty;
  }

  private onRootClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const diffBtn = target.closest<HTMLElement>("[data-difficulty]");
    if (diffBtn?.dataset.difficulty) {
      event.preventDefault();
      event.stopPropagation();
      this.setDifficulty(diffBtn.dataset.difficulty as DifficultyId, true);
      return;
    }

    const actionBtn = target.closest<HTMLElement>("[data-action]");
    if (actionBtn?.dataset.action) {
      event.preventDefault();
      event.stopPropagation();
      this.onAction?.(actionBtn.dataset.action);
      return;
    }

    const modeBtn = target.closest<HTMLElement>("[data-mode]");
    if (modeBtn?.dataset.mode) {
      event.preventDefault();
      event.stopPropagation();
      this.onMode?.(modeBtn.dataset.mode as GameMode);
    }
  };

  setDifficulty(id: DifficultyId, emit = false) {
    this.difficulty = id;
    this.root.querySelectorAll<HTMLButtonElement>("[data-difficulty]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.difficulty === id);
    });
    const cfg = DIFFICULTIES[id];
    if (this.diffBlurb) {
      this.diffBlurb.textContent = `${cfg.label}: ${cfg.blurb} · Train target ~${cfg.trainGenerationsHint} gens · ${cfg.raceLaps} race lap${cfg.raceLaps > 1 ? "s" : ""}`;
    }
    const note = this.root.querySelector("#overlay-diff-note");
    if (note) note.textContent = cfg.blurb;
    if (emit) this.onDifficulty?.(id);
  }

  private renderShell() {
    const diffButtons = DIFFICULTY_ORDER.map(
      (id) =>
        `<button type="button" class="diff-btn${id === "pro" ? " active" : ""}" data-difficulty="${id}">${DIFFICULTIES[id].label}</button>`,
    ).join("");

    this.root.innerHTML = `
      <div class="top-bar">
        <div class="brand">
          <div class="brand-mark">GR<span>ID</span></div>
          <div class="brand-sub">F1 Neuro Racing</div>
        </div>
        <div class="top-controls">
          <div class="difficulty-bar" title="AI race difficulty">
            <span class="diff-label">AI Level</span>
            ${diffButtons}
          </div>
          <div class="mode-bar" id="mode-bar">
            <button type="button" data-mode="edit">Edit Track</button>
            <button type="button" data-mode="train">Train AI</button>
            <button type="button" data-mode="watch">Watch Bot</button>
            <button type="button" data-mode="race">Race Bot</button>
          </div>
        </div>
      </div>

      <div class="diff-blurb" id="diff-blurb"></div>

      <div class="edit-coach hidden" id="edit-coach">
        <div class="edit-coach-title">Track editor</div>
        <ol>
          <li><strong>Click and drag</strong> an orange ball to bend that corner</li>
          <li>The <strong style="color:#00d2be">teal</strong> ball is start / finish — drag it too</li>
          <li>The asphalt updates live as you drag</li>
          <li>When it looks right, hit <strong>Train AI</strong> or <strong>Race Bot</strong></li>
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
          <li>Pick an <strong>AI Level</strong>, then edit, train, or race</li>
          <li>Orange balls reshape the circuit in Edit Track</li>
          <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to drive in Race Bot</li>
        </ul>
      </div>

      <div class="race-banner" id="banner"></div>

      <div class="overlay visible" id="overlay">
        <div class="overlay-card">
          <h1>GR<span>ID</span></h1>
          <p>
            Sculpt a circuit, train a neuroevolution bot, then race it in third person.
            Choose an AI level first — Rookie is forgiving, Elite is ruthless.
          </p>
          <div class="difficulty-bar overlay-diff">
            <span class="diff-label">AI Level</span>
            ${diffButtons}
          </div>
          <p class="overlay-diff-note" id="overlay-diff-note"></p>
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
    this.diffBlurb = this.root.querySelector("#diff-blurb")!;

    this.root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((btn) => {
      this.modeButtons[btn.dataset.mode!] = btn;
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-difficulty]").forEach((btn) => {
      const id = btn.dataset.difficulty!;
      // Both menu + overlay bars share the same ids — keep last or merge class toggles via query
      this.difficultyButtons[id] = btn;
    });

    this.setDifficulty("pro");
    const note = this.root.querySelector("#overlay-diff-note");
    if (note) note.textContent = DIFFICULTIES.pro.blurb;
  }

  setMode(mode: GameMode) {
    Object.entries(this.modeButtons).forEach(([key, btn]) => {
      btn.classList.toggle("active", key === mode);
    });
    this.overlay.classList.toggle("visible", mode === "menu");
    this.editCoach.classList.toggle("hidden", mode !== "edit");
    this.root.classList.toggle("mode-edit", mode === "edit");

    const help = this.helpEl.querySelector("ul")!;
    if (mode === "edit") {
      this.helpTitle.textContent = "Editing the track";
      help.innerHTML = `
        <li><strong>Drag orange balls</strong> — each one pulls a corner</li>
        <li><strong style="color:#00d2be">Teal</strong> = start/finish line</li>
        <li>Camera stays fixed so dragging is easy</li>
        <li>Use <strong>Reset Layout</strong> if you want the default oval back</li>
      `;
    } else if (mode === "train") {
      const cfg = DIFFICULTIES[this.difficulty];
      this.helpTitle.textContent = "Training";
      help.innerHTML = `
        <li>${cfg.population} cars evolving with wall-ray sensors</li>
        <li>Aim for ~${cfg.trainGenerationsHint}+ generations for a strong champ</li>
        <li>Best brains mutate into the next generation</li>
        <li><kbd>Space</kbd> stops training and watches the champion</li>
      `;
    } else if (mode === "race") {
      const cfg = DIFFICULTIES[this.difficulty];
      this.helpTitle.textContent = "Race controls";
      help.innerHTML = `
        <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows — third person</li>
        <li>Red = you · Teal = ML bot (${cfg.label})</li>
        <li>First to ${cfg.raceLaps} lap${cfg.raceLaps > 1 ? "s" : ""} wins · stay on asphalt</li>
      `;
    } else if (mode === "watch") {
      this.helpTitle.textContent = "Spectating";
      help.innerHTML = `
        <li>Watching the saved champion brain</li>
        <li>It resets after each completed lap</li>
        <li>Raise <strong>AI Level</strong> then retrain for a tougher rival</li>
      `;
    } else {
      this.helpTitle.textContent = "How to play";
      help.innerHTML = `
        <li>Pick an <strong>AI Level</strong>, then edit, train, or race</li>
        <li>Orange balls reshape the circuit in Edit Track</li>
        <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to drive in Race Bot</li>
      `;
    }

    // Keep all difficulty button pairs in sync
    this.root.querySelectorAll<HTMLButtonElement>("[data-difficulty]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.difficulty === this.difficulty);
    });

    const note = this.root.querySelector("#overlay-diff-note");
    if (note) note.textContent = DIFFICULTIES[this.difficulty].blurb;
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
                `<button type="button" class="action-btn ${a.primary ? "primary" : ""}" data-action="${a.action}">${a.label}</button>`,
            )
            .join("")}
        </div>
      </div>
    `;
    this.overlay.classList.add("visible");
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
