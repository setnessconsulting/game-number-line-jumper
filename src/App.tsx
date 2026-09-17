import { useState } from "react";

import NumberLineJumper from "./app/games/NumberLineJumper";

export default function App() {
  const [gameKey, setGameKey] = useState(0);

  return (
    <main className="page-shell">
      <div className="demo-shell">
        <header className="standalone-header">
          <p className="eyebrow">Standalone Number Line Jumper</p>
          <h1>Number Line Jumper</h1>
          <p className="lede">Estimate where numbers live. Use the midpoint, adjust your thinking, and notice how close you land.</p>
        </header>
        <section aria-label="Number Line Jumper game">
          <NumberLineJumper key={gameKey} onExit={() => setGameKey((value) => value + 1)} />
        </section>
        <footer className="standalone-footer">
          <span>Standalone baseline · session-only play</span>
          <span>No accounts, trackers, or gameplay network requests.</span>
        </footer>
      </div>
    </main>
  );
}
