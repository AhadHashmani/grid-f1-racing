export class Input {
  private keys = new Set<string>();
  private touchForward = false;
  private touchLeft = false;
  private touchRight = false;
  private touchBrake = false;

  constructor() {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener("blur", () => this.keys.clear());
  }

  setTouch(control: "forward" | "left" | "right" | "brake", down: boolean) {
    if (control === "forward") this.touchForward = down;
    if (control === "left") this.touchLeft = down;
    if (control === "right") this.touchRight = down;
    if (control === "brake") this.touchBrake = down;
  }

  clearTouch() {
    this.touchForward = false;
    this.touchLeft = false;
    this.touchRight = false;
    this.touchBrake = false;
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  getRacingControls() {
    return {
      forward: this.down("KeyW") || this.down("ArrowUp") || this.touchForward,
      backward: this.down("KeyS") || this.down("ArrowDown") || this.touchBrake,
      left: this.down("KeyA") || this.down("ArrowLeft") || this.touchLeft,
      right: this.down("KeyD") || this.down("ArrowRight") || this.touchRight,
    };
  }
}
