import { botAction, type State } from './engine';
self.onmessage = (event: MessageEvent<State>) => {
  try { self.postMessage({ action: botAction(event.data, event.data.turn) }); }
  catch { self.postMessage({ error: true }); }
};
