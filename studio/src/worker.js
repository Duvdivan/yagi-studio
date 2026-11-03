/* Yagi Studio worker: runs one task at a time from src/tasks.js. */
self.onmessage = function (ev) {
  const { id, type, payload } = ev.data;
  try {
    self.postMessage({ id, ok: true, result: self.YS.dispatch(type, payload) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
