#!/usr/bin/env node
// Headless check for index.html: deterministic physics self-test, then the
// controls and throwing interaction. Exits non-zero on any failure.

import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function findPlaywright() {
  const dir = execSync("mise where playwright", { encoding: "utf8" }).trim();
  return path.join(dir, "node_modules", "playwright");
}

function findChrome() {
  for (const name of ["google-chrome-stable", "chromium", "chromium-browser"]) {
    try {
      return execSync(`command -v ${name}`, { encoding: "utf8" }).trim();
    } catch {
      // keep looking
    }
  }
  throw new Error("no Chrome or Chromium on PATH");
}

const { chromium } = require(findPlaywright());
const chrome = findChrome();
const url = pathToFileURL(path.join(here, "index.html")).href + "?selftest=1";

const failures = [];
const errors = [];

function report(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!pass) failures.push(name);
}

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ["--use-angle=gl-egl"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (error) => errors.push("uncaught: " + error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/chrome-extension:|lastError/.test(text)) return;
    const source = message.location().url;
    errors.push(text.startsWith("Failed to load resource") && source ? `${text} (${source})` : text);
  });

  try {
    await page.goto(url, { waitUntil: "load", timeout: 45000 });
    await page.waitForFunction(
      () => window.__simReady === true && typeof window.__selftest === "function",
      null,
      { timeout: 45000 }
    );
  } catch (error) {
    errors.push("page did not become ready: " + String(error.message).split("\n")[0]);
  }

  if (!errors.length) {
    console.log("physics");
    const result = await page.evaluate(() => window.__selftestResult ?? window.__selftest());
    for (const check of result.checks) report(check.name, check.pass, check.detail);
    console.log(
      `      ${result.stats.balls} balls · energy ${result.stats.energy0.toFixed(1)} → ` +
        `${result.stats.energy5.toFixed(1)} → ${result.stats.energy15.toFixed(1)} · ` +
        `avg speed ${result.stats.avgSpeed.toFixed(2)} · max overlap ${result.stats.maxOverlap.toFixed(4)}`
    );

    console.log("\ncontrols");
    const count = () => page.evaluate(() => window.__debug.world.balls.length);
    const worldValue = (key) => page.evaluate((k) => window.__debug.world[k], key);

    const beforeDrag = await count();
    await page.mouse.move(560, 380);
    await page.mouse.down();
    await page.mouse.move(660, 330, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const afterDrag = await count();
    report("drag throws a new ball", afterDrag === beforeDrag + 1, `${beforeDrag} → ${afterDrag}`);

    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
    const pausedAt = await worldValue("time");
    await page.waitForTimeout(350);
    const stillPausedAt = await worldValue("time");
    const pauseLabel = await page.locator("#pause").textContent();
    report(
      "Space pauses the simulation",
      pausedAt === stillPausedAt && pauseLabel === "Play",
      `t ${pausedAt.toFixed(3)} → ${stillPausedAt.toFixed(3)}, button “${pauseLabel}”`
    );

    await page.keyboard.press("Space");
    await page.waitForTimeout(350);
    const resumedAt = await worldValue("time");
    const resumeLabel = await page.locator("#pause").textContent();
    report(
      "Space resumes the simulation",
      resumedAt > stillPausedAt && resumeLabel === "Pause",
      `t ${stillPausedAt.toFixed(3)} → ${resumedAt.toFixed(3)}, button “${resumeLabel}”`
    );

    await page.evaluate(() => {
      const input = document.getElementById("balls");
      input.value = "12";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(150);
    report("ball-count slider changes the count", (await count()) === 12, `${await count()} balls`);

    await page.locator("#reset").click();
    await page.waitForTimeout(150);
    report("reset restores the slider count", (await count()) === 12, `${await count()} balls`);

    await page.evaluate(() => {
      const input = document.getElementById("gravity");
      input.value = "3.5";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(100);
    report("gravity slider drives the world", (await worldValue("gravity")) === 3.5);

    await page.evaluate(() => {
      const input = document.getElementById("bounce");
      input.value = "0.55";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(100);
    report("bounce slider drives the world", (await worldValue("restitution")) === 0.55);
  }
} catch (error) {
  errors.push("check crashed: " + String(error.message).split("\n")[0]);
} finally {
  await browser.close();
}

if (errors.length) {
  console.log("\nconsole/page errors:");
  for (const error of errors.slice(0, 20)) console.log("  " + error);
  process.exit(1);
}
if (failures.length) {
  console.log(`\nCHECK FAIL (${failures.length} check${failures.length === 1 ? "" : "s"})`);
  process.exit(1);
}
console.log(`\nCHECK PASS (${new Date().toISOString()})`);
