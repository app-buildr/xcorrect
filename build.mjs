import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { MODEL_NAME } from "./src/shared/model.ts";

const watch = process.argv.includes("--watch");
// Sans --release (npm run build / watch), l'extension s'appelle « xCorrect (dev) »
// pour la distinguer de la version publiée installée dans le même navigateur.
const release = process.argv.includes("--release") && !watch;

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");

function copyStatic() {
  // La description affiche le modèle réellement appelé par le service worker.
  const source = readFileSync("manifest.json", "utf8");
  if (!source.includes("__MODEL_NAME__")) throw new Error("manifest.json : marqueur __MODEL_NAME__ introuvable.");
  const manifest = JSON.parse(source.replaceAll("__MODEL_NAME__", MODEL_NAME));
  if (!release) {
    manifest.name = `${manifest.name} (dev)`;
    manifest.action.default_title = manifest.action.default_title.replace(/^[^:]+/, `${manifest.name} `);
  }
  writeFileSync("dist/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  cpSync("src/options/options.html", "dist/options.html");
  cpSync("src/options/options.css", "dist/options.css");
  cpSync("src/assets/styles.css", "dist/styles.css");
  cpSync("icons", "dist/icons", { recursive: true });
}

const ctx = await esbuild.context({
  entryPoints: {
    background: "src/background/index.ts",
    content: "src/content/index.ts",
    options: "src/options/index.ts",
  },
  // Simulation d'une release plus récente, voir src/background/updates.ts.
  define: { __FAKE_LATEST_VERSION__: JSON.stringify(process.env.FAKE_LATEST_VERSION ?? "") },
  outdir: "dist",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
  plugins: [
    {
      name: "copy-static",
      setup(build) {
        build.onEnd(() => copyStatic());
      },
    },
  ],
});

if (watch) {
  await ctx.watch();
  console.log("xCorrect : surveillance des fichiers, Ctrl+C pour arrêter.");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
