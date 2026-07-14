import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ENV_PATH = process.env.GOOGLE_TRANSLATE_ENV_PATH || "C:/Users/kodak/OneDrive/문서/New project/번역기/.env";
const OUTPUT_PATH = path.join(ROOT, "app", "i18n.generated.ts");

const LANGUAGES = [
  ["en", "en", "English"], ["ja", "ja", "日本語"], ["zh", "zh-CN", "简体中文"],
  ["fr", "fr", "Français"], ["es", "es", "Español"], ["ar", "ar", "العربية"],
  ["mn", "mn", "Монгол"], ["vi", "vi", "Tiếng Việt"], ["th", "th", "ไทย"],
  ["ru", "ru", "Русский"], ["id", "id", "Bahasa Indonesia"], ["zhHant", "zh-TW", "繁體中文"],
  ["uz", "uz", "O‘zbek"], ["kk", "kk", "Қазақша"], ["ky", "ky", "Кыргызча"],
  ["ne", "ne", "नेपाली"], ["my", "my", "မြန်မာ"], ["km", "km", "ភាសាខ្មែរ"],
  ["fil", "tl", "Filipino"], ["hi", "hi", "हिन्दी"], ["bn", "bn", "বাংলা"],
  ["de", "de", "Deutsch"], ["sw", "sw", "Kiswahili"], ["ha", "ha", "Hausa"],
];

const CLUES = [
  "열쇠는 책상 위에 있어요.", "비밀번호 쪽지는 액자 뒤에 있어요.", "방문 카드는 여행 가방 안에 있어요.",
  "배터리는 침대 아래에 있어요.", "단서를 듣고 비밀번호를 숫자로 말하세요.", "방문 옆에 있는 스위치를 누르세요.",
  "휴대전화는 탁자 위에 있어요.", "리모컨은 소파와 쿠션 사이에 있어요.", "동전은 탁자 아래에 있어요.",
  "부엌 문은 텔레비전 옆에 있어요.", "컵은 찬장 안에 있어요.", "타이머는 냉장고 위에 있어요.",
  "거실 문은 냉장고 옆에 있어요.", "슬리퍼는 소파 앞에 있어요.", "현관 쪽지는 커튼 뒤에 있어요.",
  "현관문 열쇠는 서랍 안에 있어요.", "현관문은 책장 옆에 있어요.",
];

const NOUNS = [
  "전등", "창문", "액자", "비밀번호 쪽지", "책상", "스탠드", "열쇠", "침대", "배터리", "여행 가방",
  "방문 카드", "방문", "비밀번호", "스위치", "커튼", "현관 쪽지", "책장", "텔레비전", "부엌 문",
  "현관문", "소파", "쿠션", "리모컨", "탁자", "휴대전화", "동전", "슬리퍼", "서랍장", "서랍",
  "현관문 열쇠", "화분", "싱크대", "찬장", "컵", "냉장고", "타이머", "가스레인지", "식탁", "거실 문",
];

const UI = {
  language: "언어",
  currentClue: "현재 단서",
  listen: "단서 듣기",
  floorPlan: "집 구조도",
  currentLocation: "현재 위치",
  inventory: "찾은 물건",
  empty: "아직 없음",
  positionWords: "오늘의 위치말",
  bedroom: "침실",
  living: "거실",
  kitchen: "부엌",
  entrance: "현관",
  start: "게임 시작",
  startTitle: "침실에서 시작해 집 밖으로 나가세요.",
  startDescription: "집 구조도를 보며 한국어 위치 단서를 듣고 침실, 거실, 부엌을 탐색하세요.",
  success: "탈출 성공!",
  retry: "다시 도전",
  speakPassword: "비밀번호 말하기",
  translation: "뜻",
  instruction: "대화를 듣고 물건을 찾으세요",
  initialMessage: "단서를 듣고 집 안을 살펴보세요.",
};

function readKey() {
  const line = fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/u)
    .find((entry) => entry.trim().startsWith("GOOGLE_TRANSLATE_API_KEY="));
  return line?.slice(line.indexOf("=") + 1).trim().replace(/^(['"])(.*)\1$/u, "$2");
}

async function translate(texts, target, apiKey) {
  const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ q: texts, source: "ko", target, format: "text" }),
  });
  if (response.ok) {
    const result = await response.json();
    return result.data.translations.map((entry) => entry.translatedText);
  }

  const separator = "[[[SPLIT_7A9]]]";
  const fallback = await fetch("https://translate.googleapis.com/translate_a/single", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ client: "gtx", sl: "ko", tl: target, dt: "t", q: texts.join(`\n${separator}\n`) }),
  });
  if (!fallback.ok) throw new Error(`${target}: ${fallback.status} ${await fallback.text()}`);
  const result = await fallback.json();
  const translated = result[0].map((entry) => entry[0]).join("").split(separator).map((entry) => entry.trim());
  if (translated.length !== texts.length) {
    const individual = [];
    for (const text of texts) {
      const singleResponse = await fetch("https://translate.googleapis.com/translate_a/single", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ client: "gtx", sl: "ko", tl: target, dt: "t", q: text }),
      });
      if (!singleResponse.ok) throw new Error(`${target}: ${singleResponse.status} ${await singleResponse.text()}`);
      const single = await singleResponse.json();
      individual.push(single[0].map((entry) => entry[0]).join(""));
    }
    return individual;
  }
  return translated;
}

const apiKey = readKey();
if (!apiKey) throw new Error("번역기/.env에 GOOGLE_TRANSLATE_API_KEY가 필요합니다.");

const uiKeys = Object.keys(UI);
const sourceTexts = [...CLUES, ...Object.values(UI), ...NOUNS];
const clueTranslations = {};
const uiTranslations = {};
const nounTranslations = {};

for (const [code, target] of LANGUAGES) {
  const translated = await translate(sourceTexts, target, apiKey);
  clueTranslations[code] = translated.slice(0, CLUES.length);
  uiTranslations[code] = Object.fromEntries(uiKeys.map((key, index) => [key, translated[CLUES.length + index]]));
  const nounOffset = CLUES.length + uiKeys.length;
  nounTranslations[code] = Object.fromEntries(NOUNS.map((noun, index) => [noun, translated[nounOffset + index]]));
}

const content = `// Google Cloud Translation으로 생성된 정적 번역입니다.\n` +
  `export const LANGUAGE_OPTIONS = ${JSON.stringify(LANGUAGES.map(([code, , label]) => ({ code, label })), null, 2)} as const;\n\n` +
  `export type LanguageCode = typeof LANGUAGE_OPTIONS[number]["code"];\n\n` +
  `export const CLUE_TRANSLATIONS: Record<LanguageCode, readonly string[]> = ${JSON.stringify(clueTranslations, null, 2)};\n\n` +
  `export const NOUN_TRANSLATIONS = ${JSON.stringify(nounTranslations, null, 2)} as const;\n\n` +
  `export type NounLabelKey = keyof typeof NOUN_TRANSLATIONS.en;\n\n` +
  `export const UI_TRANSLATIONS = ${JSON.stringify(uiTranslations, null, 2)} as const;\n`;

fs.writeFileSync(OUTPUT_PATH, content, "utf8");
console.log(JSON.stringify({ languages: LANGUAGES.length, clues: CLUES.length, output: OUTPUT_PATH }, null, 2));
