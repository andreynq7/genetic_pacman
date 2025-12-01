# Suite de pruebas GA-Arcade Pac-Man

## Requisitos
- Node 18+ y npm.

## Instalación
```bash
npm install
```

## Ejecución
```bash
npm test        # Ejecuta todas las pruebas con cobertura
npm run test:watch  # Modo interactivo
```

## Cobertura
- Configurada con Vitest (V8). Umbral: 80% l�neas/funciones/statement y 70% ramas sobre los m�dulos cubiertos (`src/js/ga/**`, `gameLogic`, `gameState`, `policyEncoding`).
- Reportes en consola y `coverage/` (HTML).

## Estructura
- `tests/unit`: pruebas unitarias de m�dulos (policyEncoding, gameState, gameLogic, fitnessEvaluator, geneticAlgorithm, workerMessages).
- `tests/integration`: flujos completos como `gaController` ejecutando generaciones sin workers.
- `tests/regression`: reproducibilidad y no regresiones con semillas fijas.
- `tests/performance`: tiempos m�ximos aceptables para evaluaci�n de fitness.
- `tests/helpers`: harness para cargar los IIFE del proyecto en un sandbox (window/document simulados).
- `tests/data`: configs y cromosomas de ejemplo.

## Buenas pr�cticas incluidas
- Pruebas deterministas usando semillas fijas y pasos/episodios reducidos para velocidad.
- Limpieza impl�cita: cada prueba crea su propio sandbox aislado.
- Reportes claros via Vitest (failures con diff, cobertura en HTML).

## Extender la suite
- Para probar workers reales, definir `globalThis.Worker` y exponer `gaWorkerPool` con un stub o usar `Happy DOM`/`worker_threads`.
- Agregar m�s casos l�mite ajustando mapas o seeds en `tests/data`.
