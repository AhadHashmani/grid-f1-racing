import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing #app root");
}

// Instant first paint while Three.js chunk evaluates
app.innerHTML = `<div class="boot">GR<span>ID</span><small>Loading circuit…</small></div>`;

const { Game } = await import("./game/Game");
app.innerHTML = "";
new Game(app);
