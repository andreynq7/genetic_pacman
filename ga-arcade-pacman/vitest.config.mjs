import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      lines: 80,
      functions: 80,
      statements: 80,
      branches: 70,
      include: [
        'src/js/ga/**/*.js',
        'src/js/game/gameLogic.js',
        'src/js/game/gameState.js',
        'src/js/agent/policyEncoding.js'
      ],
      exclude: [
        'src/js/main.js',
        'src/js/ui/**',
        'src/js/game/gameView.js',
        'src/js/ga/gaWorker.js'
      ]
    }
  }
});
