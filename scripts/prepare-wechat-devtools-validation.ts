import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import process from "node:process";
import { build } from "esbuild";
import fg from "fast-glob";

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dirname, "..");
  const sourceRoot = join(repoRoot, "apps/wechat-miniprogram");
  const explicitOutput = process.argv.find((value) => value.startsWith("--output="))?.slice("--output=".length);
  const outputRoot = explicitOutput
    ? resolve(explicitOutput)
    : await mkdtemp(join(tmpdir(), "wardora-wechat-devtools-"));

  if (outputRoot === sourceRoot || outputRoot.startsWith(`${sourceRoot}/`)) {
    throw new Error("validation output must stay outside the mini-program source tree");
  }

  await rm(outputRoot, { recursive: true, force: true });
  await cp(sourceRoot, outputRoot, {
    recursive: true,
    filter: (source) => {
      const pathFromRoot = relative(sourceRoot, source);
      return !pathFromRoot
        .split("/")
        .some((part) => part === "node_modules" || part === "miniprogram_npm" || part === "scripts");
    },
  });

  const entries = await fg(["**/*.ts", "!**/*.d.ts", "!scripts/**"], {
    absolute: true,
    cwd: sourceRoot,
  });

  await build({
    entryPoints: entries,
    outbase: sourceRoot,
    outdir: outputRoot,
    bundle: true,
    format: "cjs",
    platform: "browser",
    target: "es2020",
    sourcemap: false,
    minify: false,
    logLevel: "warning",
    logOverride: { "duplicate-object-key": "silent" },
  });

  for (const entry of entries) {
    await rm(join(outputRoot, relative(sourceRoot, entry)), { force: true });
  }

  const projectConfigPath = join(outputRoot, "project.config.json");
  const projectConfig = JSON.parse(await readFile(projectConfigPath, "utf8")) as {
    projectname?: string;
    setting?: { useCompilerPlugins?: string[] };
  };
  projectConfig.projectname = `${projectConfig.projectname ?? basename(sourceRoot)}-validation`;
  if (projectConfig.setting) {
    projectConfig.setting.useCompilerPlugins = [];
  }
  await writeFile(projectConfigPath, `${JSON.stringify(projectConfig, null, 2)}\n`);
  await rm(join(outputRoot, "tsconfig.json"), { force: true });

  process.stdout.write(`${outputRoot}\n`);
}

void main();
