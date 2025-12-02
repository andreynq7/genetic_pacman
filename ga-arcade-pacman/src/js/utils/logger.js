(function() {
  const state = { cfg: null, buf: [], levelIdx: { debug: 0, info: 1, warn: 2, error: 3 } };

  /**
   * Inicializa el logger con configuraci�n opcional.
   * @param {{level?:'debug'|'info'|'warn'|'error',format?:string,rotation?:Object,retentionDays?:number,serverUrl?:string,maxEntries?:number}} cfg
   * @returns {void}
   */
  function init(cfg) {
    state.cfg = cfg || { level: 'info', format: 'jsonl', rotation: { daily: true, maxSizeMB: 10, maxFiles: 14 }, retentionDays: 14, serverUrl: '', maxEntries: 10000 };
  }

  /**
   * Decide si el nivel solicitado debe registrarse seg�n la configuraci�n actual.
   * @param {string} level - Nivel solicitado.
   * @returns {boolean} True si se permite registrar.
   */
  function shouldLog(level) {
    const min = state.levelIdx[(state.cfg && state.cfg.level) || 'info'] || 1;
    return (state.levelIdx[level] || 0) >= min;
  }

  /**
   * Agrega una entrada al buffer circular respetando `maxEntries`.
   * @param {Object} entry - Evento estructurado.
   * @returns {void}
   */
  function push(entry) {
    if (!state.cfg) init();
    state.buf.push(entry);
    if (state.buf.length > (state.cfg.maxEntries || 10000)) {
      state.buf.splice(0, Math.max(1, Math.floor(state.buf.length / 10)));
    }
  }

  /**
   * Construye una entrada enriquecida con timestamp.
   * @param {string} level - Nivel textual.
   * @param {string} event - Nombre del evento.
   * @param {Object} payload - Datos adicionales.
   * @returns {Object} Entrada lista para almacenar.
   */
  function makeEntry(level, event, payload) {
    return { timestamp: new Date().toISOString(), level, event, ...payload };
  }

  /**
   * Registra un evento si el nivel pasa el filtro configurado.
   * @param {'debug'|'info'|'warn'|'error'} level - Severidad.
   * @param {string} event - Nombre del evento.
   * @param {Object} [payload] - Datos adicionales.
   * @returns {void}
   */
  function log(level, event, payload) {
    if (!shouldLog(level)) return;
    const e = makeEntry(level, event, payload || {});
    push(e);
  }

  /**
   * Devuelve una copia del buffer de logs.
   * @returns {Array<Object>} Entradas registradas.
   */
  function dump() { return state.buf.slice(); }

  /** Limpia todas las entradas registradas. */
  function reset() { state.buf.length = 0; }

  /** Registra un evento de nivel info. */
  function info(event, payload) { log('info', event, payload); }
  /** Registra un evento de nivel warn. */
  function warn(event, payload) { log('warn', event, payload); }
  /** Registra un evento de nivel error. */
  function error(event, payload) { log('error', event, payload); }
  /** Registra un evento de nivel debug. */
  function debug(event, payload) { log('debug', event, payload); }

  window.logger = { init, info, warn, error, debug, dump, reset };
})();
