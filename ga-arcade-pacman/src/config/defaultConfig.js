// Default configuration for GA parameters used by the UI only.
const defaultConfig = {
  populationSize: 40,
  generations: 50,
  selectionRate: 40,
  crossoverRate: 45,
  mutationRate: 15,
  tournamentSize: 3,
  randomSeed: 42,
  simulationFps: 60,
  episodesPerIndividual: 5
};

window.defaultConfig = defaultConfig;
