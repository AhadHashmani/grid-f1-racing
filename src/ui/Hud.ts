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
  private progressEl!: HTMLElement;
  private progressFill!: HTMLElement;
  private lessonsEl!: HTMLElement;
  private touchPad!: HTMLElement;
  private stepHint!: HTMLElement;
  private raceBtn!: HTMLButtonElement;
  private watchBtn!: HTMLButtonElement;
  private onMode: ((mode: GameMode) => void) | null = null;
  private onAction: ((action: string) => void) | null = null;
  private onTouch: ((control: "forward" | "left" | "right" | "brake", down: boolean) => void) | null =
    null;
  private lastFireAt = 0;
  private trainedReady = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "ui";
    parent.appendChild(this.root);
    this.renderShell();
    this.root.addEventListener("click", this.onRootPointer, true);
    this.root.addEventListener("pointerup", this.onRootPointer, true);
  }

  setHandlers(
    onMode: (mode: GameMode) => void,
    onAction: (action: string) => void,
    onTouch?: (control: "forward" | "left" | "right" | "brake", down: boolean) => void,
  ) {
    this.onMode = onMode;
    this.onAction = onAction;
    this.onTouch = onTouch ?? null;
    this.bindButtons();
    this.bindTouch();
  }

  /** Call whenever a champion exists for the current track. */
  setTrainedReady(ready: boolean) {
    this.trainedReady = ready;
    this.raceBtn.classList.toggle("locked", !ready);
    this.watchBtn.classList.toggle("locked", !ready);
    this.raceBtn.title = ready ? "Race the trained champion" : "Train the swarm first";
    this.watchBtn.title = ready ? "Watch the champion alone" : "Train the swarm first";
    const trainWatch = this.root.querySelector("#btn-train-watch") as HTMLButtonElement | null;
    if (trainWatch) {
      trainWatch.classList.toggle("locked", !ready);
      trainWatch.title = ready ? "Chase the champion" : "Needs a finished lap first";
    }
    this.updateStepHint();
  }

  private updateStepHint() {
    if (!this.stepHint) return;
    this.stepHint.innerHTML = this.trainedReady
      ? `<span class="step done">1 Build</span><span class="step done">2 Train</span><span class="step go">3 Race</span>`
      : `<span class="step">1 Build</span><span class="step go">2 Train</span><span class="step">3 Race</span>`;
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
          <div class="flow-steps" id="flow-steps">
            <span class="step">1 Build</span><span class="step go">2 Train</span><span class="step">3 Race</span>
          </div>
          <div class="mode-bar" id="mode-bar">
            <button type="button" data-mode="edit">1 · Build</button>
            <button type="button" data-mode="train">2 · Watch Sims</button>
            <button type="button" data-mode="watch" class="locked" id="btn-watch">Watch Champ</button>
            <button type="button" data-mode="race" class="locked" id="btn-race">3 · Race</button>
          </div>
        </div>
      </div>

      <div class="edit-coach hidden" id="edit-coach">
        <div class="edit-coach-title">Build your track</div>
        <ol>
          <li><strong>Drag</strong> orange balls to bend corners</li>
          <li><strong style="color:#00d2be">Teal</strong> = start / finish</li>
          <li>Or hit <strong>Random Layout</strong> for a fresh circuit</li>
          <li>Then <strong>Train</strong> — watch every car learn together</li>
        </ol>
        <div class="edit-coach-actions">
          <button type="button" class="action-btn" data-action="random-track">Random Layout</button>
          <button type="button" class="action-btn" data-action="reset-track">Reset</button>
          <button type="button" class="action-btn primary" data-action="start-train">Train on This Track</button>
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
          <div class="hud-label">Cars Alive</div>
          <div class="hud-value" id="stat-alive">0</div>
        </div>
        <div class="hud-card">
          <div class="hud-label">Time</div>
          <div class="hud-value amber" id="stat-time">00:00.0</div>
        </div>
      </div>

      <div class="speedo">
        <div class="num" id="stat-speed">0</div>
        <div class="unit">KM/H</div>
      </div>

      <div class="learn-meter hidden" id="learn-meter">
        <div class="learn-meter-top">
          <span>Best car · fill to unlock Race</span>
          <span id="stat-lessons">0 lessons</span>
        </div>
        <div class="learn-track">
          <div class="learn-fill" id="learn-fill"></div>
        </div>
      </div>

      <div class="touch-pad hidden" id="touch-pad">
        <button type="button" class="touch-btn" data-touch="left">◀</button>
        <div class="touch-col">
          <button type="button" class="touch-btn" data-touch="forward">▲</button>
          <button type="button" class="touch-btn" data-touch="brake">▼</button>
        </div>
        <button type="button" class="touch-btn" data-touch="right">▶</button>
      </div>

      <div class="help" id="help">
        <h3 id="help-title">How to play</h3>
        <ul>
          <li><strong>1 Build</strong> a track</li>
          <li><strong>2 Train</strong> — watch the whole swarm</li>
          <li><strong>3 Race</strong> after a car finishes a lap</li>
        </ul>
      </div>

      <div class="race-banner" id="banner"></div>

      <div class="overlay visible" id="overlay">
        <div class="overlay-card">
          <h1>GR<span>ID</span></h1>
          <p class="overlay-steps">
            <strong>1.</strong> Build a track &nbsp;→&nbsp;
            <strong>2.</strong> Watch every car train &nbsp;→&nbsp;
            <strong>3.</strong> Race the champion
          </p>
          <p>
            Training shows every car at once. Race stays locked until one finishes a full lap.
          </p>
          <div class="overlay-actions">
            <button type="button" class="action-btn primary" data-action="start-edit">1 · Build Track</button>
            <button type="button" class="action-btn" data-action="start-train">2 · Watch All Sims</button>
            <button type="button" class="action-btn ghost" data-action="start-race">3 · Race (needs train)</button>
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
    this.progressEl = this.root.querySelector("#learn-meter")!;
    this.progressFill = this.root.querySelector("#learn-fill")!;
    this.lessonsEl = this.root.querySelector("#stat-lessons")!;
    this.touchPad = this.root.querySelector("#touch-pad")!;
    this.stepHint = this.root.querySelector("#flow-steps")!;
    this.raceBtn = this.root.querySelector("#btn-race")!;
    this.watchBtn = this.root.querySelector("#btn-watch")!;

    this.root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((btn) => {
      this.modeButtons[btn.dataset.mode!] = btn;
    });
    this.bindButtons();
    this.bindTouch();
    this.updateStepHint();
  }

  private bindTouch() {
    this.root.querySelectorAll<HTMLElement>("[data-touch]").forEach((el) => {
      if ((el as HTMLElement & { __touchBound?: boolean }).__touchBound) return;
      (el as HTMLElement & { __touchBound?: boolean }).__touchBound = true;
      const control = el.dataset.touch as "forward" | "left" | "right" | "brake";
      const down = (e: Event) => {
        e.preventDefault();
        this.onTouch?.(control, true);
      };
      const up = (e: Event) => {
        e.preventDefault();
        this.onTouch?.(control, false);
      };
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointerleave", up);
      el.addEventListener("pointercancel", up);
    });
  }

  setMode(mode: GameMode) {
    Object.entries(this.modeButtons).forEach(([key, btn]) => {
      btn.classList.toggle("active", key === mode);
    });
    this.overlay.classList.toggle("visible", mode === "menu");
    this.editCoach.classList.toggle("hidden", mode !== "edit");
    this.progressEl.classList.toggle("hidden", mode !== "train");
    this.touchPad.classList.toggle("hidden", mode !== "race");
    this.root.classList.toggle("mode-edit", mode === "edit");
    this.root.querySelector(".train-actions")?.remove();
    this.updateStepHint();

    const help = this.helpEl.querySelector("ul")!;
    if (mode === "edit") {
      this.helpTitle.textContent = "Build";
      help.innerHTML = `
        <li>Drag balls to reshape the circuit</li>
        <li>Walls auto-snap so they never cross the road</li>
        <li>Next: <strong>Train</strong> to watch every car</li>
      `;
    } else if (mode === "train") {
      this.helpTitle.textContent = "All simulations";
      help.innerHTML = `
        <li>Camera shows <strong>every</strong> car training at once</li>
        <li>Ghosts = crashed · bright cars = still learning</li>
        <li>Finish a lap → <strong>Race</strong> unlocks</li>
      `;
      if (!this.root.querySelector(".train-actions")) {
        const actions = document.createElement("div");
        actions.className = "train-actions";
        actions.innerHTML = `
          <button type="button" class="action-btn" data-action="retrain-fresh">Restart Swarm</button>
          <button type="button" class="action-btn primary" data-action="watch-champ" id="btn-train-watch">Watch Champ</button>
        `;
        this.helpEl.appendChild(actions);
        this.bindButtons();
        const watchBtn = actions.querySelector("#btn-train-watch") as HTMLButtonElement | null;
        if (watchBtn) {
          watchBtn.classList.toggle("locked", !this.trainedReady);
          watchBtn.title = this.trainedReady ? "Chase the champion" : "Needs a finished lap first";
        }
      }
    } else if (mode === "race") {
      this.helpTitle.textContent = "Race";
      help.innerHTML = `
        <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> — you are red</li>
        <li>Teal car = trained champion</li>
        <li>First to 2 laps wins</li>
      `;
    } else if (mode === "watch") {
      this.helpTitle.textContent = "Champion";
      help.innerHTML = `
        <li>One trained brain, chase cam</li>
        <li>Back to <strong>Train</strong> to see the full swarm again</li>
      `;
    } else {
      this.helpTitle.textContent = "How to play";
      help.innerHTML = `
        <li><strong>1 Build</strong> a track</li>
        <li><strong>2 Train</strong> — watch the whole swarm</li>
        <li><strong>3 Race</strong> after a car finishes a lap</li>
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
    progress?: number;
    lessons?: number;
  }) {
    this.genEl.textContent = String(opts.generation);
    this.scoreEl.textContent = String(opts.bestScore);
    this.aliveEl.textContent =
      opts.mode === "race" || opts.mode === "watch"
        ? `Lap ${opts.lap}`
        : `${opts.alive}${opts.lap > 0 ? ` · Lap ${opts.lap}` : ""}`;
    this.timeEl.textContent = formatTime(opts.timeSec);
    this.speedEl.textContent = String(Math.round(Math.abs(opts.speed) * 8.2));
    if (opts.progress != null) {
      const pct = Math.max(0, Math.min(100, opts.progress * 100));
      this.progressFill.style.width = `${pct}%`;
    }
    if (opts.lessons != null) {
      this.lessonsEl.textContent = `${opts.lessons} lesson${opts.lessons === 1 ? "" : "s"}`;
    }
  }

  showBanner(text: string, ms = 2600) {
    this.banner.textContent = text;
    this.banner.classList.add("show");
    window.clearTimeout((this.banner as HTMLElement & { __hide?: number }).__hide);
    (this.banner as HTMLElement & { __hide?: number }).__hide = window.setTimeout(
      () => this.banner.classList.remove("show"),
      ms,
    );
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
