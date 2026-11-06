import { botMove } from './ai';
import type { State } from './engine';
self.onmessage = (event: MessageEvent<{ state: State; level: number }>) => {
  try {
    const { state, level } = event.data;
    self.postMessage({ action: botMove(state, state.turn, level) });
  } catch { self.postMessage({ error: true }); }
};
