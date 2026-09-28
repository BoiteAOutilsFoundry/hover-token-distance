/** Vérifie les sources et les chemins distribués, sans démarrer Foundry ni installer d'outil. */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

/** Liste les fichiers de code, y compris dans les sous-dossiers. */
async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.name.endsWith(".mjs")) files.push(path);
  }
  return files;
}

/**
 * Vérifie aussi la casse : Windows accepte des chemins qui échoueraient
 * une fois le module installé sur un serveur Linux.
 */
async function checkPath(path) {
  const parts = relative(root, path).split(sep);
  assert.ok(parts[0] !== "..", `Chemin extérieur au module : ${path}`);
  let directory = root;
  for (const part of parts) {
    const names = await readdir(directory);
    assert.ok(names.includes(part), `Fichier absent ou mauvaise casse : ${relative(root, path)}`);
    directory = resolve(directory, part);
  }
}

const manifest = JSON.parse(await readFile(resolve(root, "module.json"), "utf8"));
for (const asset of [...manifest.esmodules, ...manifest.styles]) {
  await checkPath(resolve(root, asset));
}

const files = (await Promise.all(["scripts", "tests", "tools"].map(folder => sourceFiles(resolve(root, folder))))).flat();
const imports = new Map();
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8", windowsHide: true });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || `Syntaxe invalide : ${file}`);

  const source = await readFile(file, "utf8");
  const dependencies = [];
  const pattern = /^\s*(?:import\s+(?:[^"';]*?\sfrom\s*)?|export\s+[^"';]*?\sfrom\s*)["']([^"']+)["']/gm;
  for (const [, specifier] of source.matchAll(pattern)) {
    if (!specifier.startsWith(".")) continue;
    const dependency = resolve(dirname(file), specifier);
    await checkPath(dependency);
    dependencies.push(dependency);
  }
  imports.set(file, dependencies);
}

/** Une dépendance circulaire rendrait l'ordre d'initialisation difficile à maintenir. */
function checkImportCycles(file, stack = [], checked = new Set()) {
  assert.ok(!stack.includes(file), `Import circulaire : ${[...stack, file].map(path => relative(root, path)).join(" -> ")}`);
  if (checked.has(file)) return;
  for (const dependency of imports.get(file) ?? []) checkImportCycles(dependency, [...stack, file], checked);
  checked.add(file);
}

for (const entry of manifest.esmodules) checkImportCycles(resolve(root, entry));
console.log(`${files.length} fichiers vérifiés : syntaxe, chemins, casse et absence de cycles depuis le manifeste.`);
