import { botActionLevel, asLevel, type State } from './engine';
self.onmessage = (event: MessageEvent<{ state: State; level: number }>) => {
  try {
    const { state, level } = event.data;
    self.postMessage({ action: botActionLevel(state, state.turn, asLevel(level)) });
  } catch { self.postMessage({ error: true }); }
};
