export const tinyGAConfig = {
  populationSize: 4,
  generations: 2,
  selectionRate: 50,
  crossoverRate: 30,
  mutationRate: 20,
  tournamentSize: 2,
  randomSeed: 7,
  fitnessConfig: {
    episodesPerIndividual: 1,
    maxStepsPerEpisode: 80,
    baseSeed: 101
  }
};

export const smallChromosome = Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? 0.5 : -0.5));
