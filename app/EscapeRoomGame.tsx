"use client";

import { useRef, useState } from "react";
import { CLUE_TRANSLATIONS, LANGUAGE_OPTIONS, NOUN_TRANSLATIONS, UI_TRANSLATIONS, type LanguageCode, type NounLabelKey } from "./i18n.generated";

type Room = "bedroom" | "living" | "kitchen";
type SpeechRecognitionResultEvent = { results: { 0: { 0: { transcript: string } } } };
type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  start: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const ROOM_NAMES: Record<Room, string> = {
  bedroom: "침실",
  living: "거실",
  kitchen: "부엌",
};

const POSITION_WORDS = ["위", "아래", "앞", "뒤", "옆", "안", "사이"] as const;
const AUDIO_VERSION = "20260718-4";

const STEPS = [
  { room: "bedroom", parts: [["열쇠", false], ["는 ", true], ["책상 ", false], ["위에 있어요", true], [".", false]], target: "key", item: "열쇠" },
  { room: "bedroom", parts: [["비밀번호 쪽지", false], ["는 ", true], ["액자 ", false], ["뒤에 있어요", true], [".", false]], target: "frame", item: "비밀번호 쪽지" },
  { room: "bedroom", parts: [["방문 카드", false], ["는 ", true], ["여행 가방 ", false], ["안에 있어요", true], [".", false]], target: "bag", item: "방문 카드" },
  { room: "bedroom", parts: [["배터리", false], ["는 ", true], ["침대 ", false], ["아래에 있어요", true], [".", false]], target: "under-bed", item: "배터리" },
  { room: "bedroom", parts: [["단서", false], ["를 듣고 ", true], ["비밀번호", false], ["를 ", true], ["숫자", false], ["로 말하세요", true], [".", false]], target: "keypad", item: "방문 잠금 해제" },
  { room: "bedroom", parts: [["방문 ", false], ["옆에 있는 ", true], ["스위치", false], ["를 누르세요", true], [".", false]], target: "switch", item: "거실 이동", collect: false },
  { room: "living", parts: [["휴대전화", false], ["는 ", true], ["탁자 ", false], ["위에 있어요", true], [".", false]], target: "phone", item: "휴대전화" },
  { room: "living", parts: [["리모컨", false], ["은 ", true], ["소파", false], ["와 ", true], ["쿠션 ", false], ["사이에 있어요", true], [".", false]], target: "remote", item: "리모컨" },
  { room: "living", parts: [["동전", false], ["은 ", true], ["탁자 ", false], ["아래에 있어요", true], [".", false]], target: "coin", item: "동전" },
  { room: "living", parts: [["부엌 문", false], ["은 ", true], ["텔레비전 ", false], ["옆에 있어요", true], [".", false]], target: "kitchen-door", item: "부엌 이동", collect: false },
  { room: "kitchen", parts: [["컵", false], ["은 ", true], ["찬장 ", false], ["안에 있어요", true], [".", false]], target: "cabinet", item: "컵" },
  { room: "kitchen", parts: [["타이머", false], ["는 ", true], ["냉장고 ", false], ["위에 있어요", true], [".", false]], target: "timer", item: "타이머" },
  { room: "kitchen", parts: [["거실 문", false], ["은 ", true], ["싱크대 ", false], ["옆에 있어요", true], [".", false]], target: "living-door", item: "거실 이동", collect: false },
  { room: "living", parts: [["슬리퍼", false], ["는 ", true], ["소파 ", false], ["앞에 있어요", true], [".", false]], target: "slippers", item: "슬리퍼" },
  { room: "living", parts: [["현관 쪽지", false], ["는 ", true], ["커튼 ", false], ["뒤에 있어요", true], [".", false]], target: "curtain", item: "현관 쪽지" },
  { room: "living", parts: [["현관문 열쇠", false], ["는 ", true], ["서랍 ", false], ["안에 있어요", true], [".", false]], target: "drawer", item: "현관문 열쇠" },
  { room: "living", parts: [["현관문", false], ["은 ", true], ["책장 ", false], ["옆에 있어요", true], [".", false]], target: "exit-door", item: "탈출", collect: false },
] as const;

const REVEAL_MESSAGES: Record<string, string> = {
  frame: "액자가 움직였습니다. 뒤에 나타난 쪽지를 클릭하세요.",
  bag: "가방이 열렸습니다. 안에 나타난 방문 카드를 클릭하세요.",
  cabinet: "찬장이 열렸습니다. 안에 나타난 컵을 클릭하세요.",
  curtain: "커튼이 움직였습니다. 뒤에 나타난 쪽지를 클릭하세요.",
  drawer: "서랍이 열렸습니다. 안에 나타난 열쇠를 클릭하세요.",
};

export function EscapeRoomGame() {
  const [started, setStarted] = useState(false);
  const [stage, setStage] = useState(0);
  const [inventory, setInventory] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [message, setMessage] = useState("단서를 듣고 집 안을 살펴보세요.");
  const [code, setCode] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [escaped, setEscaped] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [recentItem, setRecentItem] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const collectionTimerRef = useRef<number | null>(null);

  const currentRoom = escaped ? "outside" : STEPS[stage].room;
  const activeTarget = started && !escaped ? STEPS[stage].target : "";
  const ui = UI_TRANSLATIONS[language];
  const learnedSteps = [
    ...STEPS.slice(0, escaped ? STEPS.length : stage),
    ...(!escaped && revealed.includes(STEPS[stage].target) ? [STEPS[stage]] : []),
  ];
  const foundPositionWords = new Set(
    POSITION_WORDS.filter((word) => learnedSteps.some((step) =>
      step.parts.some(([text, isGrammar]) => isGrammar && text.includes(word)),
    )),
  );

  function nounLabel(korean: NounLabelKey, floating = false) {
    return (
      <span className={`noun-label${floating ? " floating" : ""}`}>
        <strong>{korean}</strong>
        <small dir={language === "ar" ? "rtl" : "auto"}>{NOUN_TRANSLATIONS[language][korean]}</small>
      </span>
    );
  }

  function playAudio(index: number | "success" | "try-again") {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    const name = typeof index === "number" ? `clue-${index + 1}` : index;
    audio.src = `/audio/${name}.mp3?v=${AUDIO_VERSION}`;
    audio.currentTime = 0;
    void audio.play().catch((error) => {
      console.error("[audio] playback failed", error);
    });
  }

  function advance() {
    const currentStep = STEPS[stage];
    const nextStage = stage + 1;

    if (!("collect" in currentStep) || currentStep.collect !== false) {
      setInventory((current) => [...current, currentStep.item]);
      setRecentItem(currentStep.item);
      if (collectionTimerRef.current !== null) window.clearTimeout(collectionTimerRef.current);
      collectionTimerRef.current = window.setTimeout(() => setRecentItem(null), 900);
    }

    if (nextStage >= STEPS.length) {
      setMessage("현관문이 열렸습니다.");
      setEscaped(true);
      playAudio("success");
      return;
    }

    const nextStep = STEPS[nextStage];
    setStage(nextStage);
    setMessage(
      currentStep.room === nextStep.room
        ? `${currentStep.item}을(를) 찾았습니다.`
        : `${ROOM_NAMES[nextStep.room]}로 이동했습니다.`,
    );
    playAudio(nextStage);
  }

  function inspect(target: string) {
    if (!started || escaped || STEPS[stage].target === "keypad") return;

    if (STEPS[stage].target !== target) {
      setMistakes((current) => current + 1);
      setMessage("아무것도 없어요. 위치 단서를 다시 확인해 보세요.");
      return;
    }

    if (REVEAL_MESSAGES[target]) {
      setRevealed((current) => current.includes(target) ? current : [...current, target]);
      setMessage(REVEAL_MESSAGES[target]);
      return;
    }

    advance();
  }

  function collectHiddenItem(target: string) {
    if (STEPS[stage].target !== target || !revealed.includes(target)) return;
    advance();
  }

  function listenForPassword() {
    if (STEPS[stage].target !== "keypad" || isListening) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!Recognition) {
      setMessage("이 브라우저에서는 말하기 인식을 사용할 수 없어요. Chrome에서 열어 주세요.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      setMessage("목소리를 듣지 못했어요. 마이크를 확인하고 다시 말해 주세요.");
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim();
      const normalized = transcript.replace(/[\s,.!?]/gu, "");
      setIsListening(false);

      if (normalized === "삼백십오" || normalized === "315") {
        setCode("315");
        setMessage(`“${transcript}”로 들렸어요. 방문이 열립니다.`);
        advance();
        return;
      }

      setMistakes((current) => current + 1);
      setMessage(`“${transcript}”로 들렸어요. 따라 해 보세요.`);
      playAudio("try-again");
    };
    setIsListening(true);
    setMessage("듣고 있어요. 비밀번호를 한국어로 말해 주세요.");
    recognition.start();
  }

  function startGame() {
    setStarted(true);
    setMessage("첫 번째 단서가 재생됩니다.");
    playAudio(0);
  }

  function resetGame() {
    audioRef.current?.pause();
    setStarted(false);
    setStage(0);
    setInventory([]);
    setRevealed([]);
    setMessage("단서를 듣고 집 안을 살펴보세요.");
    setCode("");
    setIsListening(false);
    setEscaped(false);
    setMistakes(0);
    setRecentItem(null);
    if (collectionTimerRef.current !== null) window.clearTimeout(collectionTimerRef.current);
  }

  return (
    <main className="escape-app">
      <audio ref={audioRef} preload="auto" playsInline aria-hidden="true" />
      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">한국어 위치 표현 · 아파트 방탈출</p>
          <div className="brand-wordmark">
            <img src="/brand/korean-edu-logo.png" alt="한국어교육AI연구개발원" />
            <strong><span>KOREAN</span> <span>EDU</span></strong>
          </div>
        </div>
        <div className="top-instruction">
          <div className="instruction-copy">
            <strong>대화를 듣고 물건을 찾으세요.</strong>
            <small dir={language === "ar" ? "rtl" : "auto"}>{ui.instruction}</small>
          </div>
          <img className="teacher-mark" src="/brand/tk-teacher-original.png" alt="TK쌤" />
        </div>
        <div className="room-status">
          <label className="language-picker">
            <span>{ui.language}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as LanguageCode)} aria-label={ui.language}>
              {LANGUAGE_OPTIONS.map((option) => <option value={option.code} key={option.code}>{option.label}</option>)}
            </select>
          </label>
          <strong>{escaped ? "탈출 완료" : `${stage + 1} / ${STEPS.length}`}</strong>
        </div>
      </header>

      <section className="game-layout">
        <aside className="mission-column">
          <h1 className="room-title">{escaped ? "집 밖" : ROOM_NAMES[STEPS[stage].room]}</h1>
          <div className="mission-panel">
          <div className="mission-heading">
            <span>{ui.currentClue}</span>
            <button type="button" className="listen-button" onClick={() => playAudio(stage)} disabled={!started || escaped}>
              ▶ {ui.listen}
            </button>
          </div>
          <p className="clue">
            {escaped ? "집 밖으로 나왔습니다. 탈출 성공!" : STEPS[stage].parts.map(([text, isGrammar], index) =>
              isGrammar ? (
                <strong className="grammar-emphasis" key={`${text}-${index}`}>{text}</strong>
              ) : (
                <span key={`${text}-${index}`}>{text}</span>
              ),
            )}
          </p>
          {!escaped ? <p className="clue-translation" dir={language === "ar" ? "rtl" : "auto"}><span>{ui.translation}</span>{CLUE_TRANSLATIONS[language][stage]}</p> : null}

          {activeTarget === "keypad" ? (
            <div className="code-entry">
              <span>음성 비밀번호</span>
              <div>
                <button type="button" className="repeat-password" onClick={() => playAudio(stage)}>▶  315 다시 듣기</button>
                <button type="button" className={isListening ? "listening" : ""} data-testid="speak-password" onClick={listenForPassword}>
                  {isListening ? "듣고 있어요…" : `●  ${ui.speakPassword}`}
                </button>
              </div>
            </div>
          ) : null}

          <p className="feedback" key={message} aria-live="polite">{!started && !escaped ? ui.initialMessage : message}</p>

          <div className="map-panel" aria-label="집 구조도와 현재 위치">
            <div className="map-heading"><span>{ui.floorPlan}</span><b>● {ui.currentLocation}</b></div>
            <div className="floor-plan">
              <div className={`map-room bedroom ${currentRoom === "bedroom" ? "active" : ""}`}><span>침실<small>{ui.bedroom}</small></span><i className="plan-door bedroom-door" /></div>
              <div className={`map-room living ${currentRoom === "living" ? "active" : ""}`}><span>거실<small>{ui.living}</small></span><i className="plan-door living-door-plan" /></div>
              <div className={`map-room kitchen ${currentRoom === "kitchen" ? "active" : ""}`}><span>부엌<small>{ui.kitchen}</small></span><i className="plan-door kitchen-door-plan" /></div>
              <div className={`map-room entrance ${currentRoom === "outside" ? "active" : ""}`}><span>현관<small>{ui.entrance}</small></span></div>
            </div>
          </div>

          <div className="inventory">
            <span>{ui.inventory}</span>
            <div>{inventory.length ? inventory.map((item) => <b className={item === recentItem ? "recent-item" : undefined} key={item}>{item}</b>) : <em>{ui.empty}</em>}</div>
          </div>

          <div className="learning-note">
            <span>{ui.positionWords}</span>
            <p>
              {POSITION_WORDS.map((word, index) => (
                <span className={foundPositionWords.has(word) ? "found-position" : undefined} key={word}>
                  {word}{index < POSITION_WORDS.length - 1 ? " · " : ""}
                </span>
              ))}
            </p>
          </div>
          </div>
        </aside>

        <div className={`room-scene ${currentRoom}-scene ${escaped ? "escaped" : ""}`} aria-label={escaped ? "집 밖" : ROOM_NAMES[STEPS[stage].room]}>
          {currentRoom === "bedroom" ? (
            <>
              <div className="ceiling-light">{nounLabel("전등", true)}</div>
              <div className="window"><i /><i />{nounLabel("창문")}</div>
              <button type="button" className={`picture-frame object ${revealed.includes("frame") ? "searched" : ""}`} aria-label="액자" onClick={() => inspect("frame")}><span className="frame-art">SEOUL</span>{nounLabel("액자")}</button>
              {revealed.includes("frame") && !inventory.includes("비밀번호 쪽지") ? <button type="button" className="picture-note object" aria-label="액자 뒤의 비밀번호 쪽지" onClick={() => collectHiddenItem("frame")}>315{nounLabel("비밀번호 쪽지", true)}</button> : null}
              <div className="desk"><div className="desk-top" /><div className="desk-drawer" /><i className="desk-leg left" /><i className="desk-leg right" />{nounLabel("책상")}</div>
              <div className="desk-lamp"><i /><span />{nounLabel("스탠드", true)}</div>
              <button type="button" className={`room-key object ${inventory.includes("열쇠") ? "found" : ""}`} aria-label="열쇠" onClick={() => inspect("key")}><i />{nounLabel("열쇠", true)}</button>
              <div className="bed"><div className="headboard" /><div className="pillow" /><div className="blanket" />{nounLabel("침대")}</div>
              <button type="button" className={`under-bed object ${inventory.includes("배터리") ? "found" : ""}`} aria-label="배터리" onClick={() => inspect("under-bed")}><span>AA</span>{nounLabel("배터리", true)}</button>
              <button type="button" className={`travel-bag object ${revealed.includes("bag") ? "opened" : ""}`} aria-label="여행 가방" onClick={() => inspect("bag")}><i />{nounLabel("여행 가방")}</button>
              {revealed.includes("bag") && !inventory.includes("방문 카드") ? <button type="button" className="room-card object" aria-label="가방 안의 방문 카드" onClick={() => collectHiddenItem("bag")}>방문{nounLabel("방문 카드", true)}</button> : null}
              <div className="door"><i className="door-handle" />{nounLabel("방문")}</div>
              <div className="keypad" aria-hidden="true"><span>{code || "— — —"}</span>{nounLabel("비밀번호", true)}</div>
              <button type="button" className="wall-switch object" aria-label="방문 옆의 스위치" onClick={() => inspect("switch")}><i />{nounLabel("스위치", true)}</button>
            </>
          ) : null}

          {currentRoom === "living" ? (
            <>
              <div className="living-window"><div className={`curtain ${revealed.includes("curtain") ? "moved" : ""}`} />{nounLabel("커튼")}</div>
              <button type="button" className="curtain-hit object" aria-label="커튼" onClick={() => inspect("curtain")} />
              {revealed.includes("curtain") && !inventory.includes("현관 쪽지") ? <button type="button" className="exit-note object" aria-label="커튼 뒤의 현관 쪽지" onClick={() => collectHiddenItem("curtain")}>문{nounLabel("현관 쪽지", true)}</button> : null}
              <div className="bookshelf"><i /><i /><i />{nounLabel("책장")}</div>
              <div className="television"><i />{nounLabel("텔레비전")}</div>
              <button type="button" className="kitchen-door object" aria-label="부엌 문" onClick={() => inspect("kitchen-door")}>{nounLabel("부엌 문")}</button>
              <button type="button" className="exit-door object" aria-label="현관문" onClick={() => inspect("exit-door")}>{nounLabel("현관문")}<i /></button>
              <div className="sofa"><i className="sofa-cushion left" /><i className="sofa-cushion right" />{nounLabel("소파")}</div>
              <button type="button" className={`remote object ${inventory.includes("리모컨") ? "found" : ""}`} aria-label="리모컨" onClick={() => inspect("remote")}>●{nounLabel("리모컨", true)}</button>
              <div className="coffee-table">{nounLabel("탁자")}</div>
              <button type="button" className={`phone object ${inventory.includes("휴대전화") ? "found" : ""}`} aria-label="휴대전화" onClick={() => inspect("phone")}>{nounLabel("휴대전화", true)}</button>
              <button type="button" className={`coin object ${inventory.includes("동전") ? "found" : ""}`} aria-label="동전" onClick={() => inspect("coin")}>₩{nounLabel("동전", true)}</button>
              <button type="button" className={`slippers object ${inventory.includes("슬리퍼") ? "found" : ""}`} aria-label="슬리퍼" onClick={() => inspect("slippers")}><i /><i />{nounLabel("슬리퍼", true)}</button>
              <div className="tv-cabinet"><button type="button" className={`living-drawer object ${revealed.includes("drawer") ? "opened" : ""}`} aria-label="서랍" onClick={() => inspect("drawer")} />{nounLabel("서랍장")}</div>
              {revealed.includes("drawer") && !inventory.includes("현관문 열쇠") ? <button type="button" className="spare-key object" aria-label="서랍 안의 현관문 열쇠" onClick={() => collectHiddenItem("drawer")}><i />{nounLabel("현관문 열쇠", true)}</button> : null}
              <div className="plant"><i />{nounLabel("화분")}</div>
            </>
          ) : null}

          {currentRoom === "kitchen" ? (
            <>
              <div className="kitchen-window"><i /><i />{nounLabel("창문")}</div>
              <div className="counter"><div className="sink" />{nounLabel("싱크대")}</div>
              <button type="button" className={`cabinet object ${revealed.includes("cabinet") ? "opened" : ""}`} aria-label="찬장" onClick={() => inspect("cabinet")}><i />{nounLabel("찬장")}</button>
              {revealed.includes("cabinet") && !inventory.includes("컵") ? <button type="button" className="cup object" aria-label="찬장 안의 컵" onClick={() => collectHiddenItem("cabinet")}><i />{nounLabel("컵", true)}</button> : null}
              <div className="refrigerator"><i />{nounLabel("냉장고")}</div>
              <button type="button" className={`timer object ${inventory.includes("타이머") ? "found" : ""}`} aria-label="타이머" onClick={() => inspect("timer")}>00:30{nounLabel("타이머", true)}</button>
              <div className="stove"><i /><i />{nounLabel("가스레인지")}</div>
              <div className="kitchen-table">{nounLabel("식탁")}</div>
              <button type="button" className="living-door object" aria-label="거실 문" onClick={() => inspect("living-door")}>{nounLabel("거실 문")}</button>
            </>
          ) : null}

          {recentItem ? <div className="collection-toast" aria-hidden="true"><span>찾았어요</span><strong>{recentItem}</strong></div> : null}

          {!started ? (
            <div className="start-overlay"><div><span>ESCAPE HOME</span><h2>{ui.startTitle}</h2><p>{ui.startDescription}</p><button type="button" onClick={startGame}>{ui.start}</button></div></div>
          ) : null}

          {escaped ? (
            <div className="success-overlay"><div><span>ESCAPED</span><h2>{ui.success}</h2><p>집 안의 위치 단서 {STEPS.length}개를 모두 해결했습니다.</p><p className="score-line">실수 {mistakes}회</p><button type="button" onClick={resetGame}>{ui.retry}</button></div></div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
