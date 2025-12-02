(function() {
  const state = { cfg: null, buf: [], levelIdx: { debug: 0, info: 1, warn: 2, error: 3 } };
  function init(cfg) { state.cfg = cfg || { level: 'info', format: 'jsonl', rotation: { daily: true, maxSizeMB: 10, maxFiles: 14 }, retentionDays: 14, serverUrl: '', maxEntries: 10000 }; }
  function shouldLog(level) { const min = state.levelIdx[(state.cfg && state.cfg.level) || 'info'] || 1; return (state.levelIdx[level] || 0) >= min; }
  function push(entry) {
    if (!state.cfg) init();
    state.buf.push(entry);
    if (state.buf.length > (state.cfg.maxEntries || 10000)) state.buf.splice(0, Math.max(1, Math.floor(state.buf.length / 10)));
  }
  function makeEntry(level, event, payload) { return { timestamp: new Date().toISOString(), level, event, ...payload }; }
  function log(level, event, payload) { if (!shouldLog(level)) return; const e = makeEntry(level, event, payload || {}); push(e); }
  function dump() { return state.buf.slice(); }
  function reset() { state.buf.length = 0; }
  function info(event, payload) { log('info', event, payload); }
  function warn(event, payload) { log('warn', event, payload); }
  function error(event, payload) { log('error', event, payload); }
  function debug(event, payload) { log('debug', event, payload); }
  window.logger = { init, info, warn, error, debug, dump, reset };
})();
