import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const jsRoot = path.join(projectRoot, 'src', 'js');

/**
 * Prepara un sandbox global (window/document) para las pruebas.
 * Usa globals reales de Node/JSdom, pero aislando propiedades en cada carga.
 */
export function createSandbox(overrides = {}) {
  const baseDoc = {
    createElement: () => ({ getContext: () => null, style: {} }),
    getElementById: () => null,
    body: { appendChild: () => {}, removeChild: () => {} }
  };
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Math,
    performance,
    document: baseDoc,
    ...overrides
  };
  sandbox.window = sandbox;
  return sandbox;
}

/**
 * Carga m�dulos IIFE en el entorno global respetando el orden dado.
 * Usa import din�mico para que Vitest pueda medir cobertura sobre los archivos.
 */
export async function loadScripts(sandbox, scripts) {
  vi.resetModules();
  Object.keys(sandbox).forEach((k) => {
    globalThis[k] = sandbox[k];
  });
  for (const relPath of scripts) {
    const fileUrl = pathToFileURL(path.join(jsRoot, relPath));
    await import(fileUrl.href);
  }
  return globalThis;
}

export function pathFromRoot(...segments) {
  return path.join(projectRoot, ...segments);
}
