import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ENV_PATH = process.env.GOOGLE_TTS_ENV_PATH || "C:/시나브로/.env.local";
const OUTPUT_DIR = path.join(ROOT, "public", "audio");
const LINES = [
  ["clue-1", "열쇠는 책상 위에 있어요.", "ko-KR-Standard-A"],
  ["clue-2", "비밀번호 쪽지는 액자 뒤에 있어요.", "ko-KR-Standard-A"],
  ["clue-3", "방문 카드는 여행 가방 안에 있어요.", "ko-KR-Standard-A"],
  ["clue-4", "배터리는 침대 아래에 있어요.", "ko-KR-Standard-A"],
  ["clue-5", "들어보세요. 삼백십오. 비밀번호를 말하세요.", "ko-KR-Standard-A"],
  ["clue-6", "방문 옆에 있는 스위치를 누르세요.", "ko-KR-Standard-A"],
  ["clue-7", "휴대전화는 탁자 위에 있어요.", "ko-KR-Standard-C"],
  ["clue-8", "리모컨은 소파와 쿠션 사이에 있어요.", "ko-KR-Standard-C"],
  ["clue-9", "동전은 탁자 아래에 있어요.", "ko-KR-Standard-C"],
  ["clue-10", "부엌 문은 텔레비전 옆에 있어요.", "ko-KR-Standard-C"],
  ["clue-11", "컵은 찬장 안에 있어요.", "ko-KR-Standard-B"],
  ["clue-12", "타이머는 냉장고 위에 있어요.", "ko-KR-Standard-B"],
  ["clue-13", "거실 문은 싱크대 옆에 있어요.", "ko-KR-Standard-B"],
  ["clue-14", "슬리퍼는 소파 앞에 있어요.", "ko-KR-Standard-C"],
  ["clue-15", "현관 쪽지는 커튼 뒤에 있어요.", "ko-KR-Standard-C"],
  ["clue-16", "현관문 열쇠는 서랍 안에 있어요.", "ko-KR-Standard-C"],
  ["clue-17", "현관문은 책장 옆에 있어요.", "ko-KR-Standard-C"],
  ["try-again", "들어보세요. 삼백십오. 비밀번호를 말하세요.", "ko-KR-Standard-A"],
  ["success", "축하합니다. 집 밖으로 탈출했습니다.", "ko-KR-Standard-C"],
];
const REFRESH = new Set(["clue-3", "clue-5", "clue-6", "clue-13", "clue-16", "try-again", "success"]);

function readKey() {
  const line = fs
    .readFileSync(ENV_PATH, "utf8")
    .split(/\r?\n/u)
    .find((entry) => entry.trim().startsWith("GOOGLE_TTS_API_KEY="));
  return line?.slice(line.indexOf("=") + 1).trim().replace(/^(['"])(.*)\1$/u, "$2");
}

async function synthesize(name, text, voiceName, apiKey) {
  const outputPath = path.join(OUTPUT_DIR, `${name}.mp3`);
  if (!REFRESH.has(name) && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) return;
  const speakingRate = name === "clue-5" || name === "try-again" ? 0.78 : 0.92;

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "ko-KR", name: voiceName },
        audioConfig: { audioEncoding: "MP3", speakingRate },
      }),
    },
  );

  if (!response.ok) throw new Error(`${name}: ${response.status} ${await response.text()}`);
  const result = await response.json();
  fs.writeFileSync(outputPath, Buffer.from(result.audioContent, "base64"));
}

const apiKey = readKey();
if (!apiKey) throw new Error("C:/시나브로/.env.local에 GOOGLE_TTS_API_KEY가 필요합니다.");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

for (const [name, text, voiceName] of LINES) {
  await synthesize(name, text, voiceName, apiKey);
}

console.log(JSON.stringify({ files: LINES.length, output: OUTPUT_DIR }, null, 2));
