import React, { useEffect, useState } from "react";
import PrescriptionView from "./components/PrescriptionView";
import { getPrescription } from "./services/geminiService";
import {
  deleteSavedPrescription,
  getBookBookmarks,
  getSavedPrescriptions,
  resetAllStorage,
  savePrescriptionToStorage,
} from "./services/storageService";
import { AppState, Prescription, SavedPrescription, BookBookmark } from "./types";
import {
  Clock3, Trash2, Bookmark, ChevronDown, ChevronUp, X, BookOpen, Leaf,
} from "lucide-react";

// ─── 마음 계절 옵션 ────────────────────────────────────────────────────────────
type SeasonOption = {
  label: string;
  emoji: string;
  text: string;
  emotions: string[];
};

const SEASON_OPTIONS: SeasonOption[] = [
  {
    label: "봄",
    emoji: "🌸",
    text: "마음 계절: 봄. 설렘과 기대가 있지만 아직은 조심스럽고 여린 마음도 함께 있어요.",
    emotions: ["설렘", "기대", "희망", "새로움", "두근거림", "풋풋함"],
  },
  {
    label: "여름",
    emoji: "☀️",
    text: "마음 계절: 여름. 에너지가 넘치거나, 너무 뜨거워 조금 지쳐 있을 수도 있어요.",
    emotions: ["열정", "에너지", "강렬함", "지침", "답답함", "생동감"],
  },
  {
    label: "가을",
    emoji: "🍂",
    text: "마음 계절: 가을. 고요한 성찰과 그리움 속에서 마음이 천천히 깊어지고 있어요.",
    emotions: ["고독", "그리움", "쓸쓸함", "감사", "성찰", "깊이"],
  },
  {
    label: "겨울",
    emoji: "❄️",
    text: "마음 계절: 겨울. 조용히 웅크리며 회복을 기다리는 시간일 수 있어요.",
    emotions: ["고요", "무기력", "침잠", "단절", "회복", "정적"],
  },
];

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
const formatRxNum = (id: string) => `No. ${id.slice(0, 4).toUpperCase()}`;
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });

// ─── 디자인 토큰 ───────────────────────────────────────────────────────────────
const F         = "'Gowun Batang', 'Noto Serif KR', Georgia, serif";   // 제목·브랜드·사서의 한 마디
const GB_FONT   = "'Gowun Mono', 'Courier New', monospace";             // 본문·라벨·버튼
const BG        = "#f5efe3";
const PAGE1     = "#f5efe3";
const PAGE2     = "#f8f4ea";
const GREEN_DARK = "#1a3a20";
const GREEN_MID  = "#3a7a50";
const INK       = "#2a241b";
const BROWN     = "#3a2a18";
const GOLD_DIM  = "rgba(200,160,64,0.70)";
const BORDER    = "rgba(110,84,40,0.16)";
const MUTED     = "#8e7a5b";

const linesBg = `repeating-linear-gradient(0deg,transparent,transparent 30px,rgba(110,84,40,0.025) 30px,rgba(110,84,40,0.025) 31px)`;
const paperStyle = (bg: string): React.CSSProperties => ({ backgroundColor: bg, backgroundImage: linesBg });

// ─── 앱 ───────────────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const [input,              setInput]              = useState("");
  const [appState,           setAppState]           = useState<AppState>(AppState.IDLE);
  const [prescription,       setPrescription]       = useState<Prescription | null>(null);
  const [error,              setError]              = useState<string | null>(null);
  const [savedPrescriptions, setSavedPrescriptions] = useState<SavedPrescription[]>([]);
  const [bookmarks,          setBookmarks]          = useState<BookBookmark[]>([]);
  const [isSavedOpen,        setIsSavedOpen]        = useState(false);
  const [isBookmarksOpen,    setIsBookmarksOpen]    = useState(false);
  const [selectedSeason,     setSelectedSeason]     = useState<SeasonOption | null>(null);
  const [emotionPopupSeason, setEmotionPopupSeason] = useState<SeasonOption | null>(null);
  const [pickedEmotions,     setPickedEmotions]     = useState<string[]>([]);
  const [isMenuOpen,         setIsMenuOpen]         = useState(false);

  useEffect(() => {
    setSavedPrescriptions(getSavedPrescriptions());
    setBookmarks(getBookBookmarks());
    // 마지막 처방 복원
    try {
      const raw = localStorage.getItem("lastPrescription");
      if (raw) {
        const { prescription: p, userInput: u } = JSON.parse(raw);
        if (p && u) {
          setPrescription(p);
          setInput(u);
          setAppState(AppState.PRESCRIBED);
        }
      }
    } catch { /* 복원 실패 시 조용히 무시 */ }
  }, []);

  const refreshBookmarks = () => setBookmarks(getBookBookmarks());

  const handleShare = async () => {
    setIsMenuOpen(false);
    const lines: string[] = ["📚 마음서가 기록\n"];
    if (savedPrescriptions.length > 0) {
      lines.push("[ 서가 기록 ]");
      savedPrescriptions.slice(0, 5).forEach(p => {
        lines.push(`• ${p.userInput.slice(0, 30)}${p.userInput.length > 30 ? "…" : ""}`);
        p.prescription.recommended_books.slice(0, 2).forEach(b => {
          lines.push(`  └ 《${b.title}》 ${b.author}`);
        });
      });
    }
    if (bookmarks.length > 0) {
      lines.push("\n[ 북마크 도서 ]");
      bookmarks.slice(0, 10).forEach(b => {
        lines.push(`• 《${b.book.title}》 ${b.book.author}`);
      });
    }
    const text = lines.join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: "마음서가 기록", text });
      } else {
        await navigator.clipboard.writeText(text);
        alert("클립보드에 복사되었습니다!");
      }
    } catch { /* 취소 시 무시 */ }
  };

  const handleResetStorage = () => {
    if (!window.confirm("북마크와 서가 기록을 모두 삭제할까요?\n이 작업은 되돌릴 수 없습니다.")) return;
    resetAllStorage();
    try { localStorage.removeItem("lastPrescription"); } catch { /* 무시 */ }
    setBookmarks([]); setSavedPrescriptions([]); setPrescription(null);
    setInput(""); setSelectedSeason(null); setEmotionPopupSeason(null);
    setPickedEmotions([]); setError(null); setAppState(AppState.IDLE);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    setError(null);
    setAppState(AppState.ANALYZING);
    try {
      const result = await getPrescription(input);
      setPrescription(result);
      const savedItem: SavedPrescription = {
        id: crypto.randomUUID(), createdAt: new Date().toISOString(),
        userInput: input, prescription: result,
      };
      setSavedPrescriptions(savePrescriptionToStorage(savedItem));
      try { localStorage.setItem("lastPrescription", JSON.stringify({ prescription: result, userInput: input })); } catch { /* 저장 실패 무시 */ }
      refreshBookmarks();
      setAppState(AppState.PRESCRIBED);
    } catch (err) {
      console.error(err);
      setError("죄송합니다. 추천을 생성하는 도중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      setAppState(AppState.ERROR);
    }
  };

  const handleReset = () => {
    setInput(""); setPrescription(null); setError(null);
    refreshBookmarks(); setSelectedSeason(null);
    setEmotionPopupSeason(null); setPickedEmotions([]);
    setAppState(AppState.IDLE);
    // 새로운 기록 시작 시 복원 데이터 제거
    try { localStorage.removeItem("lastPrescription"); } catch { /* 무시 */ }
  };

  const handleOpenSaved = (item: SavedPrescription) => {
    setPrescription(item.prescription); setInput(item.userInput);
    refreshBookmarks(); setAppState(AppState.PRESCRIBED);
  };

  const handleDeleteSaved = (id: string) => setSavedPrescriptions(deleteSavedPrescription(id));

  const handleSeasonSelect = (season: SeasonOption) => {
    setSelectedSeason(season);
    setEmotionPopupSeason(emotionPopupSeason?.label === season.label ? null : season);
    setPickedEmotions([]);
    setInput(prev => {
      const cleaned = SEASON_OPTIONS.reduce((acc, opt) => acc.replace(opt.text, "").trim(), prev.trim());
      return cleaned ? `${season.text}\n\n${cleaned}` : season.text;
    });
  };

  const handleClearSeason = () => {
    setSelectedSeason(null); setEmotionPopupSeason(null); setPickedEmotions([]);
    setInput(prev => SEASON_OPTIONS.reduce((acc, opt) => acc.replace(opt.text, "").trim(), prev.trim()));
  };

  const toggleEmotion = (e: string) => {
    setPickedEmotions(prev => {
      const next = prev.includes(e) ? prev.filter(p => p !== e) : [...prev, e];
      // 입력창에 이전 감정 제거 후 새 감정 추가
      setInput(inp => {
        let cleaned = inp;
        prev.forEach(p => { cleaned = cleaned.replace(p, "").replace(/\s+/g, " ").trim(); });
        if (next.length > 0) cleaned = cleaned ? cleaned + " " + next.join(" ") : next.join(" ");
        return cleaned;
      });
      return next;
    });
  };

  const closeEmotionPopup = () => {
    setEmotionPopupSeason(null); setPickedEmotions([]);
  };

  const handleOutsideClick = (e: React.MouseEvent) => {
    if (emotionPopupSeason && !(e.target as Element).closest("#seasonWrap")) {
      closeEmotionPopup();
    }
  };

  // ── IDLE ──────────────────────────────────────────────────────────────────
  if (appState === AppState.IDLE) {
    return (
      <div
        style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: BG, fontFamily: F }}
        onClick={handleOutsideClick}
      >
        <main style={{ flex: 1, padding: "clamp(12px,3vw,28px) clamp(10px,3vw,20px) 48px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <style dangerouslySetInnerHTML={{ __html: `
            @media (max-width: 767px) {
              .book-inner { flex-direction: column !important; }
              .book-left-page { border-right: none !important; border-bottom: 1px dashed rgba(110,84,40,0.16) !important; }
              .book-spine { display: none !important; }
              .book-edge-l, .book-edge-r { display: none !important; }
            }
            @keyframes fadeInAnalyze { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
            @keyframes dotPulse { 0%,80%,100%{opacity:0.2;transform:scale(0.9);} 40%{opacity:1;transform:scale(1.2);} }
            @keyframes maplefall {
              0%   { transform: translate(0,-28px) rotate(-30deg) scale(0.2); opacity:0; }
              20%  { opacity:1; }
              70%  { transform: translate(0,4px) rotate(6deg) scale(1.05); }
              85%  { transform: translate(0,-1px) rotate(4deg) scale(0.98); }
              100% { transform: translate(0,0px) rotate(5deg) scale(1); opacity:1; }
            }
            .maple-g { animation: maplefall 2s cubic-bezier(0.4,0,0.2,1) both; animation-delay:0.4s; }
            @media(prefers-reduced-motion:reduce){ .maple-g { animation:none; transform:translate(0,0) rotate(5deg) scale(1); opacity:1; } }
          ` }} />

          {/* 오픈북 외곽 */}
          <div style={{ width: "100%", maxWidth: 920, border: `3px solid ${GREEN_DARK}`, borderRadius: 6, boxShadow: "0 10px 26px rgba(0,0,0,0.16),0 2px 8px rgba(0,0,0,0.08)", position: "relative", marginTop: 12 }}>
            <div style={{ position: "absolute", left: -3, right: -3, top: -13, height: 13, background: `linear-gradient(to bottom,#0f2018,${GREEN_DARK} 60%,#4f6b59)`, border: `3px solid ${GREEN_DARK}`, borderBottom: "none", borderRadius: "4px 4px 0 0", zIndex: 20 }} />


            <div className="book-inner" style={{ display: "flex" }}>
              {/* 왼쪽 엣지 */}
              <div className="book-edge-l" style={{ width: "clamp(8px,1.2vw,13px)", flexShrink: 0, zIndex: 5, position: "relative", background: "repeating-linear-gradient(to right,#ede3ce 0,#ede3ce 1.5px,#c8b888 2px,#f0e6d4 4px,#c8b888 4.5px,#ede3ce 6px,#c8b888 6.5px,#f0e6d4 8.5px,#c8b888 9px,#ede3ce 13px)" }}>
                <div style={{ position: "absolute", left: 0, top: -13, bottom: 0, width: 6, background: GREEN_DARK }} />
              </div>

              {/* ── 왼쪽 페이지: 이용 안내 ── */}
              <div className="book-left-page" style={{ flex: 1, ...paperStyle(PAGE1), padding: "22px 18px 30px 20px", borderRight: `1px dashed ${BORDER}`, display: "flex", flexDirection: "column", gap: 0 }}>
                {/* 로고 배너 */}
                <div style={{ background: `linear-gradient(135deg,${GREEN_DARK} 0%,#1a3224 100%)`, borderRadius: 10, padding: "14px 16px", marginBottom: 16, boxShadow: "0 6px 18px rgba(0,0,0,0.12)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                    <div style={{ flexShrink: 0, width: 52, marginTop: -8, display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
                      <svg width="52" height="80" viewBox="-22 -42 44 62" xmlns="http://www.w3.org/2000/svg">
                        {/* 책1: 민트 — 라벤더 방향(오른쪽)으로 기댐 */}
                        <g transform="rotate(20, -2, 18)">
                          <rect x="-18" y="-4" width="11" height="22" rx="2" fill="#a8d8c8"/>
                          <rect x="-18" y="-4" width="2.5" height="22" fill="#7ab8a4"/>
                        </g>
                        {/* 책2: 라벤더 — 곧게 */}
                        <rect x="-2"  y="-22" width="14" height="40" rx="2" fill="#c4b8d8"/>
                        <rect x="-2"  y="-22" width="2.5" height="40" fill="#a098b8"/>
                        {/* Twemoji 단풍잎 — 두 책 사이 */}
                        <g className="maple-g" style={{ transformOrigin: "-5px -10px" }}>
                          <g transform="translate(-5,-10) scale(0.48) translate(-18,-18)">
                            <path fill="#DD2E44" d="M36 20.917c0-.688-2.895-.5-3.125-1s3.208-4.584 2.708-5.5s-5.086 1.167-5.375.708c-.288-.458.292-3.5-.208-3.875s-5.25 4.916-5.917 4.292c-.666-.625 1.542-10.5 1.086-10.698c-.456-.198-3.419 1.365-3.793 1.282C21.002 6.042 18.682 0 18 0s-3.002 6.042-3.376 6.125c-.374.083-3.337-1.48-3.793-1.282c-.456.198 1.752 10.073 1.085 10.698C11.25 16.166 6.5 10.875 6 11.25s.08 3.417-.208 3.875c-.289.458-4.875-1.625-5.375-.708s2.939 5 2.708 5.5s-3.125.312-3.125 1s8.438 5.235 9 5.771c.562.535-2.914 2.802-2.417 3.229c.576.496 3.839-.83 10.417-.957V35a1 1 0 1 0 2 0v-6.04c6.577.127 9.841 1.453 10.417.957c.496-.428-2.979-2.694-2.417-3.229c.562-.536 9-5.084 9-5.771z"/>
                          </g>
                        </g>
                        {/* 선반 */}
                        <rect x="-22" y="18"  width="40" height="5.5" rx="1.5" fill="#a07828"/>
                        <rect x="-20" y="23"  width="36" height="2.5" rx="1"   fill="#8a6420" opacity="0.55"/>
                      </svg>
                    </div>
                    <div>
                      <p style={{ fontFamily: F, fontSize: 9, letterSpacing: "0.14em", color: GOLD_DIM, marginBottom: 3 }}>마음서가 · Mind Shelf</p>
                      <h1 style={{ fontFamily: F, fontSize: 16, color: PAGE2, lineHeight: 1.35, marginBottom: 4 }}>마음을 기록하는, 작은 서가</h1>
                      <p style={{ fontFamily: GB_FONT, fontSize: 12, color: "rgba(245,240,228,0.7)", lineHeight: 1.7 }}>감정을 기록하면 마음과 공명하는 책을 골라드립니다.</p>
                    </div>
                  </div>
                </div>

                {/* 이용 안내 용지 */}
                <div style={{ flex: 1, borderRadius: 8, overflow: "hidden", border: `1px solid ${BORDER}`, background: "#fdf8ee" }}>
                  <div style={{ padding: "7px 14px", borderBottom: `1px dashed ${BORDER}`, background: "rgba(245,240,228,0.55)", display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ color: GOLD_DIM, fontFamily: F, fontSize: 11 }}>✦</span>
                    <span style={{ fontFamily: F, fontSize: 9.5, letterSpacing: "0.1em", color: MUTED }}>이용 안내 및 주의사항</span>
                  </div>
                  <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 11 }}>
                    {[
                      { icon: "📖", title: "마음서가란?",      body: "감정을 언어로 꺼내고, 그 감정에 공명하는 책을 추천하는 AI사서 북큐레이션 서비스입니다." },
                      { icon: "🗺️", title: "이렇게 사용하세요", body: "① 마음의 계절 선택  ② 감정·고민 입력  ③ 추천 받기  ④ 도서관 소장 확인" },
                      { icon: "🤖", title: "AI 추천의 한계",   body: "추천 결과는 AI가 생성하며 개인 상황에 따라 맞지 않을 수 있습니다. 이 서비스는 의료행위가 아닙니다." },
                      { icon: "🔒", title: "개인정보 미수집",  body: "입력 텍스트는 추천 생성에만 사용됩니다. 서가 기록은 이 기기의 로컬 스토리지에만 저장됩니다." },
                    ].map(({ icon, title, body }, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <div style={{ borderTop: "1px dashed rgba(180,160,120,0.14)" }} />}
                        <div style={{ display: "flex", gap: 9 }}>
                          <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                          <div>
                            <p style={{ fontFamily: F, fontSize: 9.5, color: GREEN_MID, fontWeight: 700, marginBottom: 2 }}>{title}</p>
                            <p style={{ fontFamily: GB_FONT, fontSize: 11.5, color: INK, lineHeight: 1.8 }}>{body}</p>
                          </div>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  <div style={{ padding: "6px 14px", borderTop: "1px dashed rgba(180,160,120,0.14)", background: "rgba(245,240,228,0.4)", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: F, fontSize: 8.5, color: MUTED }}>© 2026 마음서가 by lou</span>
                    <span style={{ fontFamily: F, fontSize: 8.5, color: MUTED }}>Powered by Google Gemini</span>
                  </div>
                </div>
              </div>

              {/* ── 가름대 ── */}
              <div className="book-spine" style={{ width: "clamp(16px,2.2vw,24px)", flexShrink: 0, position: "relative", zIndex: 10, backgroundColor: PAGE1 }}>
                <div style={{ position: "absolute", top: 0, bottom: 24, left: "50%", transform: "translateX(-50%)", width: 7, background: `linear-gradient(90deg,${GREEN_DARK} 0%,#2e6040 20%,${GREEN_MID} 45%,#4a9060 50%,${GREEN_MID} 55%,#2e6040 80%,${GREEN_DARK} 100%)`, zIndex: 11 }} />
                <div style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", width: 14, height: 14, zIndex: 13 }}>
                  <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 4.5, height: 4.5, borderRadius: "50%", background: "radial-gradient(circle,#5aaa60 30%,#2e6a38 100%)", boxShadow: "0 -4.5px 0 1px #3a8848,0 4.5px 0 1px #3a8848,-4.5px 0 0 1px #3a8848,4.5px 0 0 1px #3a8848" }} />
                  <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 3.5, height: 3.5, borderRadius: "50%", background: "radial-gradient(circle,#7acc80 30%,#3a7a48 100%)", zIndex: 2 }} />
                </div>
              </div>

              {/* ── 오른쪽 페이지: 타이틀 + 계절 선택 + 입력 + 서재 ── */}
              <div style={{ flex: 1, ...paperStyle(PAGE2), padding: "22px 20px 30px 18px", display: "flex", flexDirection: "column", gap: 13, position: "relative", overflow: "visible" }}>

                {/* 타이틀 */}
                <div style={{ paddingBottom: 10, borderBottom: `1px dashed ${BORDER}`, position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 3 }}>
                    <button type="button" onClick={handleReset} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, opacity: 0.7, padding: 2, display: "flex", alignItems: "center" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                    </button>
                    <h2 style={{ fontFamily: F, fontSize: 21, color: INK, letterSpacing: "0.04em", margin: 0 }}>마음서가</h2>
                    <span style={{ fontFamily: F, fontSize: 12, color: MUTED }}>·</span>
                    <span style={{ fontFamily: F, fontSize: 11, color: MUTED, letterSpacing: "0.06em" }}>Mind Shelf</span>
                    {/* ⋯ 메뉴 */}
                    <div style={{ position: "relative" }}>
                      <button type="button" onClick={() => setIsMenuOpen(p => !p)}
                        style={{ background: isMenuOpen ? "rgba(110,84,40,0.08)" : "none", border: `1px solid rgba(110,84,40,0.3)`, borderRadius: 5, cursor: "pointer", padding: "4px 7px", display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 20, transition: "all 0.15s" }}>
                        <svg width="10" height="7" viewBox="0 0 10 7">
                          {isMenuOpen
                            ? <path d="M1 6L5 1L9 6" fill="none" stroke="rgba(110,84,40,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            : <path d="M1 1L5 6L9 1" fill="none" stroke="rgba(142,122,91,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          }
                        </svg>
                      </button>
                      {isMenuOpen && (
                        <>
                          {/* 바깥 클릭 닫기 */}
                          <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setIsMenuOpen(false)} />
                          <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 100, background: "#fdf8ee", border: `1px solid ${BORDER}`, borderRadius: 8, boxShadow: "0 4px 14px rgba(0,0,0,0.10)", minWidth: 130, overflow: "hidden" }}>
                            <button type="button" onClick={handleShare}
                              style={{ width: "100%", textAlign: "left", padding: "9px 13px", fontFamily: F, fontSize: 11, color: INK, background: "none", border: "none", cursor: "pointer", borderBottom: `1px dashed ${BORDER}`, display: "flex", alignItems: "center", gap: 6 }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                              공유하기
                            </button>
                            <button type="button" onClick={() => { setIsMenuOpen(false); handleResetStorage(); }}
                              style={{ width: "100%", textAlign: "left", padding: "9px 13px", fontFamily: F, fontSize: 11, color: "#9a4a3a", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                              ⚠ 기록 전체 삭제
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <p style={{ fontFamily: GB_FONT, fontSize: 12, color: MUTED, textAlign: "center" }}>마음을 기록하고, 책을 만나보세요</p>
                </div>

                {/* 마음의 계절 선택 */}
                <div id="seasonWrap" style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                    <span style={{ fontFamily: F, fontSize: 9.5, letterSpacing: "0.1em", color: "#6e5428" }}>── 마음의 계절 선택 ──</span>
                    {selectedSeason && (
                      <button type="button" onClick={handleClearSeason} style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: F, fontSize: 9, color: "#6e5428", background: "none", border: "none", cursor: "pointer", opacity: 0.75 }}>
                        <X style={{ width: 9, height: 9 }} /> 선택 해제
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {SEASON_OPTIONS.map(s => {
                      const isSel = selectedSeason?.label === s.label;
                      return (
                        <button key={s.label} type="button" onClick={() => handleSeasonSelect(s)}
                          style={{ fontFamily: F, fontSize: 10.5, padding: "4px 10px", borderRadius: 18, border: "1px solid", cursor: "pointer", transition: "all 0.15s", background: isSel ? GREEN_DARK : "rgba(255,255,255,0.55)", color: isSel ? PAGE2 : INK, borderColor: isSel ? GREEN_MID : BORDER, boxShadow: isSel ? "0 2px 8px rgba(46,74,56,0.16)" : "none" }}>
                          {s.emoji} {s.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* 감정 팝업 — 여러 개 선택 후 바깥 클릭 또는 완료 버튼으로 닫힘 */}
                  {emotionPopupSeason && (
                    <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50, background: "#fdf8ee", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                        <p style={{ fontFamily: F, fontSize: 8.5, color: MUTED, letterSpacing: "0.08em" }}>
                          {emotionPopupSeason.emoji} {emotionPopupSeason.label} 계절의 마음
                        </p>
                        <button type="button" onClick={closeEmotionPopup} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, fontSize: 12, padding: "0 2px" }}>✕</button>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {emotionPopupSeason.emotions.map((e, i) => {
                          const isPicked = pickedEmotions.includes(e);
                          return (
                            <span key={i} onClick={() => toggleEmotion(e)}
                              style={{ fontFamily: GB_FONT, fontSize: 10.5, padding: "2px 8px", borderRadius: 10, cursor: "pointer", transition: "all 0.15s", background: isPicked ? GREEN_DARK : "rgba(46,74,56,0.08)", color: isPicked ? PAGE2 : GREEN_DARK, border: `1px solid ${isPicked ? GREEN_MID : "rgba(46,74,56,0.14)"}` }}>
                              {e}
                            </span>
                          );
                        })}
                      </div>
                      {pickedEmotions.length > 0 && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontFamily: F, fontSize: 8.5, color: GREEN_MID }}>{pickedEmotions.join(", ")} 선택됨</span>
                          <button type="button" onClick={closeEmotionPopup}
                            style={{ fontFamily: F, fontSize: 9, padding: "3px 10px", borderRadius: 12, background: GREEN_DARK, color: PAGE2, border: "none", cursor: "pointer" }}>
                            완료
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 감정 입력창 */}
                <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${BORDER}`, background: "#fdf8ee", boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
                  <div style={{ padding: "6px 12px", borderBottom: `1px dashed ${BORDER}`, background: "rgba(245,240,228,0.52)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: F, fontSize: 9.5, color: MUTED }}>✍️ 오늘의 마음 기록</span>
                    {selectedSeason && (
                      <span style={{ fontFamily: F, fontSize: 9.5, padding: "2px 7px", borderRadius: 10, background: GREEN_DARK, color: PAGE2 }}>
                        {selectedSeason.emoji} {selectedSeason.label}
                      </span>
                    )}
                  </div>
                  <div style={{ position: "relative" }}>
                    <textarea
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
                      placeholder="요즘 마음은 어느 계절에 가까운가요?"
                      rows={4}
                      style={{ width: "100%", padding: "14px 50px 14px 14px", background: "transparent", border: "none", outline: "none", fontFamily: GB_FONT, fontSize: 13.5, color: INK, lineHeight: 1.85, resize: "none", boxSizing: "border-box" }}
                    />
                    <button type="button" onClick={() => handleSubmit()} disabled={!input.trim()}
                      style={{ position: "absolute", right: 10, bottom: 10, width: 34, height: 34, borderRadius: "50%", background: input.trim() ? GREEN_DARK : "rgba(110,84,40,0.14)", color: PAGE2, border: "none", cursor: input.trim() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", boxShadow: input.trim() ? "0 3px 8px rgba(46,74,56,0.18)" : "none" }}
                      aria-label="감정 제출">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"/>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                      </svg>
                    </button>
                  </div>
                  <div style={{ padding: "5px 12px", borderTop: `1px dashed ${BORDER}`, display: "flex", alignItems: "center", gap: 5 }}>
                    <Leaf style={{ width: 9, height: 9, color: MUTED, flexShrink: 0 }} />
                    <span style={{ fontFamily: F, fontSize: 9, color: MUTED }}>마음의 계절 기록 · 맞춤형 읽기 가이드</span>
                  </div>
                </div>

                {/* 서가 기록 */}
                <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${BORDER}`, background: PAGE2 }}>
                  <button type="button" onClick={() => setIsSavedOpen(p => !p)}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 13px", background: "none", border: "none", cursor: "pointer" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: F, fontSize: 11.5, color: BROWN }}>
                      <Clock3 style={{ width: 11, height: 11, color: "#6e5428" }} />
                      서가 기록
                      <span style={{ fontFamily: F, fontSize: 8.5, padding: "1px 5px", borderRadius: 10, background: GREEN_DARK, color: PAGE2 }}>{savedPrescriptions.length}</span>
                    </span>
                    {isSavedOpen ? <ChevronUp style={{ width: 11, height: 11, color: MUTED }} /> : <ChevronDown style={{ width: 11, height: 11, color: MUTED }} />}
                  </button>
                  {isSavedOpen && (
                    <div style={{ height: 150, overflowY: "auto", borderTop: `1px dashed ${BORDER}`, padding: "7px 11px 9px" }}>
                      {savedPrescriptions.length === 0 ? (
                        <p style={{ fontFamily: F, fontSize: 10, color: MUTED, textAlign: "center", paddingTop: 6 }}>아직 서가 기록이 없어요.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {savedPrescriptions.map(item => (
                            <div key={item.id} style={{ borderRadius: 6, padding: "7px 9px", background: "rgba(255,255,255,0.55)", border: `1px solid rgba(110,84,40,0.12)` }}>
                              <button type="button" onClick={() => handleOpenSaved(item)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                                <p style={{ fontFamily: GB_FONT, fontSize: 11.5, color: INK, lineHeight: 1.6, marginBottom: 2, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{item.userInput}</p>
                                <p style={{ fontFamily: F, fontSize: 9, color: MUTED }}>{formatRxNum(item.id)} · {formatDate(item.createdAt)}</p>
                              </button>
                              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                                <button type="button" onClick={() => handleDeleteSaved(item.id)} style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: F, fontSize: 9, color: "#a04030", background: "none", border: "none", cursor: "pointer", opacity: 0.6 }}>
                                  <Trash2 style={{ width: 9, height: 9 }} /> 삭제
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 북마크 도서 */}
                <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${BORDER}`, background: PAGE2 }}>
                  <button type="button" onClick={() => setIsBookmarksOpen(p => !p)}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 13px", background: "none", border: "none", cursor: "pointer" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: F, fontSize: 11.5, color: BROWN }}>
                      <Bookmark style={{ width: 11, height: 11, color: "#6e5428" }} />
                      북마크 도서
                      <span style={{ fontFamily: F, fontSize: 8.5, padding: "1px 5px", borderRadius: 10, background: GREEN_DARK, color: PAGE2 }}>{bookmarks.length}</span>
                    </span>
                    {isBookmarksOpen ? <ChevronUp style={{ width: 11, height: 11, color: MUTED }} /> : <ChevronDown style={{ width: 11, height: 11, color: MUTED }} />}
                  </button>
                  {isBookmarksOpen && (
                    <div style={{ maxHeight: 180, overflowY: "auto", borderTop: `1px dashed ${BORDER}`, padding: "7px 11px 9px" }}>
                      {bookmarks.length === 0 ? (
                        <p style={{ fontFamily: F, fontSize: 10, color: MUTED, textAlign: "center", paddingTop: 6 }}>북마크한 도서가 없어요.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {bookmarks.slice(0, 10).map(item => (
                            <div key={item.id} style={{ borderRadius: 6, padding: "7px 9px", background: "rgba(255,255,255,0.55)", border: `1px solid rgba(110,84,40,0.12)` }}>
                              <p style={{ fontFamily: GB_FONT, fontSize: 11.5, color: BROWN }}>
                                <BookOpen style={{ width: 9, height: 9, display: "inline", marginRight: 4, color: GREEN_MID, verticalAlign: "middle" }} />
                                {item.book.title}
                              </p>
                              <p style={{ fontFamily: F, fontSize: 9, color: MUTED, marginTop: 2 }}>{item.book.author} · {item.book.publisher}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>

              {/* 오른쪽 엣지 */}
              <div className="book-edge-r" style={{ width: "clamp(8px,1.2vw,13px)", flexShrink: 0, zIndex: 5, position: "relative", background: "repeating-linear-gradient(to left,#ede3ce 0,#ede3ce 1.5px,#c8b888 2px,#f0e6d4 4px,#c8b888 4.5px,#ede3ce 6px,#c8b888 6.5px,#f0e6d4 8.5px,#c8b888 9px,#ede3ce 13px)" }}>
                <div style={{ position: "absolute", right: 0, top: -13, bottom: 0, width: 6, background: GREEN_DARK }} />
              </div>
            </div>
          </div>
        </main>

        <footer style={{ padding: "11px", textAlign: "center", fontFamily: F, fontSize: 9.5, color: "rgba(90,70,40,0.38)", borderTop: `1px solid ${BORDER}`, background: BG }}>
          © 2026 마음서가 by lou · Powered by Google Gemini
        </footer>
      </div>
    );
  }

  // ── ANALYZING ─────────────────────────────────────────────────────────────
  if (appState === AppState.ANALYZING) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: BG, fontFamily: F }}>
        <style dangerouslySetInnerHTML={{ __html: `
          .analyze-wrap { animation: fadeInAnalyze 0.4s ease both; }
          @keyframes wave { 0%,60%,100%{transform:translateY(0);} 30%{transform:translateY(-10px);} }
          .dot-wave { display:inline-block; width:9px; height:9px; border-radius:50%; background:rgba(200,160,64,0.85); margin:0 5px; animation:wave 1.2s ease infinite; }
          .dot-wave:nth-child(2){animation-delay:0.18s;}
          .dot-wave:nth-child(3){animation-delay:0.36s;}
        ` }} />
        <div className="analyze-wrap" style={{ background: PAGE2, border: `1px solid rgba(180,160,120,0.38)`, borderRadius: 14, padding: "32px 48px 28px", boxShadow: "0 8px 24px rgba(0,0,0,0.08)", textAlign: "center" }}>
          <p style={{ fontFamily: F, fontSize: 14, color: GREEN_DARK, letterSpacing: "0.05em", marginBottom: 16 }}>당신의 마음에 맞는 책을 서가에서 고르는 중이에요</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 28 }}>
            <span className="dot-wave" />
            <span className="dot-wave" />
            <span className="dot-wave" />
          </div>

        </div>
      </div>
    );
  }

  // ── PRESCRIBED ────────────────────────────────────────────────────────────
  if (appState === AppState.PRESCRIBED && prescription) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: BG }}>
        <main style={{ flex: 1 }}>
          <PrescriptionView data={prescription} onReset={handleReset} onBookmarksChange={refreshBookmarks} />
        </main>
      </div>
    );
  }

  // ── ERROR ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px", background: BG, fontFamily: F }}>
      <div style={{ maxWidth: 400, width: "100%", textAlign: "center", padding: "32px", borderRadius: 16, background: PAGE2, border: "1px solid rgba(180,80,60,0.2)", boxShadow: "0 6px 18px rgba(0,0,0,0.06)" }}>
        <p style={{ fontFamily: GB_FONT, fontSize: 13.5, color: "#7a3020", marginBottom: 20, lineHeight: 1.7 }}>{error}</p>
        <button type="button" onClick={() => setAppState(AppState.IDLE)} style={{ fontFamily: F, fontSize: 12, color: GREEN_DARK, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>
          다시 시도하기
        </button>
      </div>
    </div>
  );
};

export default App;
