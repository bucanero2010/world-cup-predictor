"use client";

import { createContext, useContext, useEffect, useState } from "react";

const GameContext = createContext({ game: "superbru", setGame: () => {} });
const STORAGE_KEY = "wcp-game";

export function GameProvider({ children }) {
  const [game, setGameState] = useState("superbru");

  // Restore the chosen game from localStorage on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "superbru" || saved === "penka") setGameState(saved);
    } catch {}
  }, []);

  const setGame = (g) => {
    setGameState(g);
    try {
      localStorage.setItem(STORAGE_KEY, g);
    } catch {}
  };

  return <GameContext.Provider value={{ game, setGame }}>{children}</GameContext.Provider>;
}

export function useGame() {
  return useContext(GameContext);
}
