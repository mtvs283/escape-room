import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the Korean escape-room sample", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>한국어 방탈출: 우리 집 탈출<\/title>/);
  assert.match(html, /아파트 방탈출/);
  assert.match(html, /한국어 위치 표현/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("includes every clue and stored audio file", async () => {
  const game = await readFile(new URL("../app/EscapeRoomGame.tsx", import.meta.url), "utf8");
  for (const phrase of ["위에", "뒤에", "안에", "아래에", "앞에", "옆에", "사이에"]) {
    assert.match(game, new RegExp(phrase));
  }
  assert.match(game, /SpeechRecognition/);
  assert.match(game, /삼백십오/);

  const audioRoot = new URL("../public/audio/", import.meta.url);
  const files = (await readdir(audioRoot)).filter((file) => file.endsWith(".mp3"));
  assert.deepEqual(files.sort(), [
    ...Array.from({ length: 17 }, (_, index) => `clue-${index + 1}.mp3`),
    "success.mp3",
    "try-again.mp3",
  ].sort());
  for (const file of files) {
    assert.ok((await stat(new URL(file, audioRoot))).size > 0);
  }
});

test("includes the company logo and all 24 learner languages", async () => {
  const i18n = await readFile(new URL("../app/i18n.generated.ts", import.meta.url), "utf8");
  assert.match(i18n, /简体中文/);
  assert.match(i18n, /繁體中文/);
  assert.equal((i18n.match(/"code":/g) ?? []).length, 24);

  const logo = new URL("../public/brand/onmaeum-korean-logo.png", import.meta.url);
  assert.ok((await stat(logo)).size > 0);
});
