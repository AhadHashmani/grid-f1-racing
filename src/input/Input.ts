export class Input {
  private keys = new Set<string>();

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

  down(code: string): boolean {
    return this.keys.has(code);
  }

  getRacingControls() {
    return {
      forward: this.down("KeyW") || this.down("ArrowUp"),
      backward: this.down("KeyS") || this.down("ArrowDown"),
      left: this.down("KeyA") || this.down("ArrowLeft"),
      right: this.down("KeyD") || this.down("ArrowRight"),
    };
  }
}
