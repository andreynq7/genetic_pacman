# Estructura de directorios y archivos

## config/
- `ga.jsonc`: parámetros del AG (población, tasas, torneo, semillas, etc.).
- `fitness.jsonc`: parámetros de evaluación (episodios, pasos, bonos/penalizaciones).
- `logging.jsonc`: configuración de logging (nivel, rotación, retención, servidor).

## logs/ (si se usa servidor)
- `runs/<YYYYMMDD_HHMM>/meta.json`: resumen de configuración de la corrida.
- `runs/<YYYYMMDD_HHMM>/events.jsonl`: eventos JSON por línea.
- `best_history.jsonl`: historial de mejores individuos.

## src/js/config/
- `configLoader.js`: carga JSONC y valida, expone `window.appConfig`.

## src/js/utils/
- `logger.js`: API `logger.init/info/warn/error/debug/dump/reset`.
- `bestStore.js`: guarda automáticamente `best.json` al mejorar el fitness.

## Integración
- `index.html`: incluye `logger.js`, `bestStore.js` y `configLoader.js` antes de `main.js`.
- `src/js/main.js`: inicializa configuración, UI y GA; exporta corridas e históricos.
- `src/js/ga/gaController.js`: orquesta evaluación y generación; actualiza `bestEver` y métricas.

## Nueva organización (SRP)
- `src/js/game/`: lógica del juego
  - `gameConstants.js`, `gameState.js`, `gameLogic.js`, `episodeSimulator.js`, `audioManager.js`
- `src/js/render/`: renderizado gráfico
  - `gameView.js`
- `src/js/input/`: controladores de entrada de UI
  - `uiControls.js`
- `src/js/ga/`: algoritmos genéticos (AG)
  - `geneticAlgorithm.js`, `fitnessEvaluator.js`, `gaController.js`, `workerPool.js`, `workerMessages.js`
- `src/js/agent/`: codificación de políticas (genotipo → política)
  - `policyEncoding.js`
- `src/js/ui/`: formularios, layout y métricas
  - `uiLayout.js`, `uiForms.js`, `uiMetrics.js`, `populationChart.js`
- `src/js/utils/`: utilidades
  - `logger.js`, `bestStore.js`, `domHelpers.js`

Esta reorganización mantiene APIs globales (`window.*`) y el orden de carga en `index.html`, evitando cambios en lógica o comportamiento.

## Limpieza automática
- El `logger` mantiene un búfer con límite (`maxEntries`) y recorta entradas antiguas.
- La rotación y retención en disco requieren servidor; sugerido retener `retentionDays` y `rotation.maxFiles`.

## Permisos
- En servidor, crear directorios con permisos de lectura/ejecución para todos (755) y archivos legibles (644).
