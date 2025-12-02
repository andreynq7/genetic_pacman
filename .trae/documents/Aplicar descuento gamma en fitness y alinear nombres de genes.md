## Alcance
- Implementar retorno descontado con `gamma` en `fitnessEvaluator` sin romper reproducibilidad.
- Evitar doble penalización por paso cuando `gamma < 1`.
- Alinear nombres de genes exportados en `bestStore` con las 12 features reales de `policyEncoding`.
- Añadir prueba unitaria para validar descuento.

## Cambios de Código
### fitnessEvaluator
- Archivo: `src/js/ga/fitnessEvaluator.js`.
- Agregar helper `discountedReturn(history, gamma)` que acumula `Σ gamma^t · reward_t` con potencia incremental.
- En `evaluateEpisode(...)`:
  - Si `cfg.gamma === 1`: mantener base `finalState.score` (actual).
  - Si `cfg.gamma < 1`: usar `totalReward = discountedReturn(result.history, cfg.gamma)`.
  - Aplicar al final términos terminales no descontados:
    - `completionBonus` si `level_cleared` y `!disableCompletionBonus`.
    - `lifeLossPenalty * lifeLossCount`.
    - `noLifeLossBonus` si `level_cleared` y `lifeLossCount === 0`.
  - Evitar doble penalización: ignorar `stepPenalty` y `stallPenalty` cuando `gamma < 1` (ya están en `reward` por paso del motor).

### bestStore
- Archivo: `src/js/utils/bestStore.js`.
- Cambiar `names()` para que use `window.policyEncoding.FEATURE_NAMES` si existe; fallback:
  - `['isWall','isPellet','isPowerPellet','keepDirection','uTurn','distToPelletNorm','distToGhostNorm','approachingGhost','fleeingGhost','localOpenness','pelletsRemainingFrac','stepFraction']`.
- En `buildPolicy(chromosome)`, mapear usando `FEATURE_NAMES` y limitar por `Math.min(arr.length, keys.length)`.

### policyEncoding
- Archivo: `src/js/agent/policyEncoding.js`.
- Exponer `FEATURE_NAMES` con los 12 nombres en el mismo orden que `NUM_GENES` y añadirlo al objeto `window.policyEncoding`.

## Pruebas
- Archivo: `tests/unit/fitnessEvaluator.test.js`.
- Nuevo caso:
  - Configurar `episodesPerIndividual=1`, `maxStepsPerEpisode` moderado, probar `gamma=1` vs `gamma=0.9` y esperar `fitness_gamma_0_9 < fitness_gamma_1` para un episodio con recompensas tardías.
- Asegurar que pruebas existentes siguen pasando (reproducibilidad semilla, límites de pasos, rendimiento).

## Validación Manual
- Ejecutar con `gamma=0.99`, `episodesPerIndividual=3–5`, `populationSize=20`, `generations=5`.
- Verificar que `best/avg` evolucionan establemente y que `stdReward` (desviación) no explota.
- Exportar corrida y confirmar que `fitnessConfig.gamma` se refleja y que `best.json` presenta 12 nombres correctos.

## Consideraciones
- No tocar la política ni GA; solo el cómputo de fitness y la exportación.
- Mantener reproducibilidad: LCG y `tieBreak: 'first'` se conservan.
- Coste: O(T) por episodio para descuento; impacto mínimo.

## Entregables
- Código actualizado en los 3 archivos.
- Prueba unitaria añadida y batería completa pasando.
- Artefactos exportados (`best.json`, `logs_run_*.json`) consistentes con los nombres de features.
