import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing #app root");
}

// Instant first paint while Three.js chunk evaluates
app.innerHTML = `<div class="boot">GR<span>ID</span><small>Loading circuit…</small></div>`;

try {
  const { Game } = await import("./game/Game");
  app.replaceChildren(); // clear boot only after module loads
  new Game(app);
} catch (err) {
  console.error(err);
  const msg = err instanceof Error ? err.message : String(err);
  app.innerHTML = `<div class="boot">GR<span>ID</span><small>Failed to start — ${msg}</small></div>`;
}
