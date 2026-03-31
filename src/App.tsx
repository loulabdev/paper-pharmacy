import React, { useEffect, useState } from "react";
import { Header } from "./components/Header";
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
import { Send, Clock3, Trash2, Bookmark, ChevronDown, ChevronUp, X, BookOpen, Leaf } from "lucide-react";

// ─── 마음 날씨 옵션 (확장) ───────────────────────────────────────────
type WeatherOption = {
  label: string;
  emoji: string;
  text: string;
  selectedClass: string;
  tagClass: string;
};

const WEATHER_OPTIONS: WeatherOption[] = [
  {
    label: "맑음",
    emoji: "☀️",
    text: "마음 날씨: 맑음. 요즘 비교적 괜찮지만, 더 단단해지고 싶어요.",
    selectedClass: "bg-amber-100 text-amber-900 border-amber-400",
    tagClass: "bg-amber-50 text-amber-900 border-amber-200",
  },
  {
    label: "흐림",
    emoji: "⛅",
    text: "마음 날씨: 흐림. 이유를 정확히 모르겠지만 마음이 조금 가라앉아 있어요.",
    selectedClass: "bg-stone-200 text-stone-900 border-stone-400",
    tagClass: "bg-stone-100 text-stone-900 border-stone-200",
  },
  {
    label: "안개",
    emoji: "🌫️",
    text: "마음 날씨: 안개. 앞이 잘 보이지 않고 모든 것이 흐릿하게 느껴져요.",
    selectedClass: "bg-gray-200 text-gray-800 border-gray-400",
    tagClass: "bg-gray-100 text-gray-800 border-gray-200",
  },
  {
    label: "이슬비",
    emoji: "🌦️",
    text: "마음 날씨: 이슬비. 딱히 슬프진 않은데 마음 한켠이 촉촉하게 젖어 있어요.",
    selectedClass: "bg-blue-100 text-blue-900 border-blue-300",
    tagClass: "bg-blue-50 text-blue-900 border-blue-200",
  },
  {
    label: "비",
    emoji: "🌧️",
    text: "마음 날씨: 비. 우울하고 축 처지는 느낌이 들어요.",
    selectedClass: "bg-slate-200 text-slate-900 border-slate-400",
    tagClass: "bg-slate-100 text-slate-900 border-slate-200",
  },
  {
    label: "천둥",
    emoji: "⛈️",
    text: "마음 날씨: 천둥. 불안과 걱정이 커서 마음이 시끄러워요.",
    selectedClass: "bg-indigo-200 text-indigo-950 border-indigo-400",
    tagClass: "bg-indigo-50 text-indigo-950 border-indigo-200",
  },
  {
    label: "강풍",
    emoji: "🌪️",
    text: "마음 날씨: 강풍. 생각이 많고 혼란스러워서 중심을 잡기 어려워요.",
    selectedClass: "bg-violet-200 text-violet-950 border-violet-400",
    tagClass: "bg-violet-50 text-violet-950 border-violet-200",
  },
  {
    label: "눈",
    emoji: "❄️",
    text: "마음 날씨: 눈. 무기력하고 에너지가 거의 없어요.",
    selectedClass: "bg-sky-100 text-sky-900 border-sky-300",
    tagClass: "bg-sky-50 text-sky-900 border-sky-200",
  },
  {
    label: "황사",
    emoji: "🟡",
    text: "마음 날씨: 황사. 뭔가 탁하고 답답한 느낌이 떠나지 않아요.",
    selectedClass: "bg-yellow-200 text-yellow-900 border-yellow-400",
    tagClass: "bg-yellow-50 text-yellow-900 border-yellow-200",
  },
  {
    label: "무더위",
    emoji: "🌡️",
    text: "마음 날씨: 무더위. 지치고 짜증스럽고 아무것도 하기 싫어요.",
    selectedClass: "bg-orange-200 text-orange-900 border-orange-400",
    tagClass: "bg-orange-50 text-orange-900 border-orange-200",
  },
  {
    label: "서리",
    emoji: "🥶",
    text: "마음 날씨: 서리. 감각이 무뎌지고 마음이 차갑게 굳어 있는 것 같아요.",
    selectedClass: "bg-cyan-100 text-cyan-900 border-cyan-300",
    tagClass: "bg-cyan-50 text-cyan-900 border-cyan-200",
  },
  {
    label: "무지개",
    emoji: "🌈",
    text: "마음 날씨: 무지개. 힘든 일이 있었지만 조금씩 나아지는 것 같아요.",
    selectedClass: "bg-pink-100 text-pink-900 border-pink-300",
    tagClass: "bg-pink-50 text-pink-900 border-pink-200",
  },
];

// ─── 유틸 ────────────────────────────────────────────────────────────
const formatRxNum = (id: string) => `No. ${id.slice(0, 4).toUpperCase()}`;
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

// ─── 공통 스타일 변수 ─────────────────────────────────────────────────
const F = "'Special Elite', 'Courier New', monospace";
const BG = "#f2ead8";
const BG2 = "#f5f0e4";
const GREEN_DARK = "#2e4a38";
const GREEN_MID = "#4a6e50";
const INK = "#1a1a18";
const BROWN = "#3a2a18";
const GOLD_DIM = "rgba(200,160,64,0.70)";
const BORDER = "rgba(180,160,120,0.30)";
const MUTED = "#9a8060";

// ════════════════════════════════════════════════════════════════════
const App: React.FC = () => {
  const [input, setInput] = useState("");
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedPrescriptions, setSavedPrescriptions] = useState<SavedPrescription[]>([]);
  const [bookmarks, setBookmarks] = useState<BookBookmark[]>([]);
  const [isSavedOpen, setIsSavedOpen] = useState(true);
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false);
  const [selectedWeather, setSelectedWeather] = useState<WeatherOption | null>(null);

  useEffect(() => {
    setSavedPrescriptions(getSavedPrescriptions());
    setBookmarks(getBookBookmarks());
  }, []);

  const refreshBookmarks = () => setBookmarks(getBookBookmarks());
  const refreshSaved = () => setSavedPrescriptions(getSavedPrescriptions());

  const handleResetStorage = () => {
    if (!window.confirm("북마크와 서재 기록을 모두 삭제할까요?\n이 작업은 되돌릴 수 없습니다.")) return;
    resetAllStorage();
    setBookmarks([]);
    setSavedPrescriptions([]);
    setPrescription(null);
    setInput("");
    setSelectedWeather(null);
    setError(null);
    setAppState(AppState.IDLE);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setAppState(AppState.ANALYZING);
    setError(null);
    try {
      const result = await getPrescription(input);
      setPrescription(result);
      const savedItem: SavedPrescription = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        userInput: input,
        prescription: result,
      };
      setSavedPrescriptions(savePrescriptionToStorage(savedItem));
      refreshBookmarks();
      setAppState(AppState.PRESCRIBED);
    } catch (err) {
      console.error(err);
      setError("죄송합니다. 추천을 생성하는 도중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      setAppState(AppState.ERROR);
    }
  };

  const handleReset = () => {
    setInput("");
    setPrescription(null);
    setError(null);
    refreshBookmarks();
    setSelectedWeather(null);
    setAppState(AppState.IDLE);
  };

  const handleOpenSaved = (item: SavedPrescription) => {
    setPrescription(item.prescription);
    setInput(item.userInput);
    refreshBookmarks();
    setAppState(AppState.PRESCRIBED);
  };

  const handleDeleteSaved = (id: string) => {
    setSavedPrescriptions(deleteSavedPrescription(id));
  };

  const handleWeatherSelect = (weather: WeatherOption) => {
    setSelectedWeather(weather);
    setInput((prev) => {
      const cleaned = WEATHER_OPTIONS.reduce(
        (acc, opt) => acc.replace(opt.text, "").trim(),
        prev.trim()
      );
      return cleaned ? `${weather.text}\n\n${cleaned}` : weather.text;
    });
  };

  const handleClearWeather = () => {
    setSelectedWeather(null);
    setInput((prev) =>
      WEATHER_OPTIONS.reduce((acc, opt) => acc.replace(opt.text, "").trim(), prev.trim())
    );
  };

  // ── IDLE ──────────────────────────────────────────────────────────
  if (appState === AppState.IDLE) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: BG, fontFamily: F }}>
        <Header onResetStorage={handleResetStorage} />

        <main className="flex-grow px-4 py-8 md:py-12">
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ══ 왼쪽: 앱 소개 + 주의사항 ══ */}
            <section className="flex flex-col gap-5">

              {/* 로고 배너 */}
              <div
                className="rounded-2xl px-6 py-7"
                style={{
                  background: `linear-gradient(135deg, ${GREEN_DARK} 0%, #1a3224 100%)`,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
                }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-lg"
                    style={{
                      background: "rgba(200,160,64,0.15)",
                      border: "1px solid rgba(200,160,64,0.35)",
                      color: GOLD_DIM,
                      fontFamily: F,
                    }}
                  >
                    ℞
                  </div>
                  <div>
                    <p className="text-xs tracking-widest mb-1.5" style={{ color: GOLD_DIM, fontFamily: F }}>
                      마음서재 · Mind Library
                    </p>
                    <h1 className="text-xl md:text-2xl leading-snug mb-2" style={{ color: BG2, fontFamily: F }}>
                      오늘 마음을 기록하는 작은 서재
                    </h1>
                    <p className="text-sm leading-relaxed" style={{ color: "rgba(245,240,228,0.58)", fontFamily: F }}>
                      감정을 기록하면 AI가 당신의 마음에 공명하는
                      <br />책을 찾아드립니다.
                    </p>
                  </div>
                </div>
              </div>

              {/* 이용 안내 — 서재 용지 스타일 */}
              <div
                className="rounded-2xl overflow-hidden flex-1"
                style={{
                  background: "#fdf8ee",
                  border: `1px solid ${BORDER}`,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.07)",
                }}
              >
                {/* 용지 헤더 */}
                <div
                  className="px-5 py-3 flex items-center gap-2"
                  style={{ borderBottom: "1px dashed rgba(180,160,120,0.30)", background: "rgba(245,240,228,0.6)" }}
                >
                  <span style={{ color: GOLD_DIM, fontFamily: F, fontSize: "14px" }}>✦</span>
                  <span className="text-xs tracking-widest" style={{ color: MUTED, fontFamily: F }}>
                    이용 안내 및 주의사항
                  </span>
                </div>

                <div className="px-6 py-5 space-y-5">

                  {/* 1. 앱 철학 */}
                  <div className="flex gap-3">
                    <span className="text-base flex-shrink-0 mt-0.5">📖</span>
                    <div>
                      <p className="text-xs font-semibold mb-1" style={{ color: GREEN_MID, fontFamily: F }}>
                        마음서재란?
                      </p>
                      <p className="text-xs leading-relaxed" style={{ color: BROWN, fontFamily: F }}>
                        감정을 언어로 꺼내고, 그 감정에 공명하는 책을 찾아드리는
                        AI 북큐레이션 서비스입니다. 서가에서 꺼낸 책 한 권이 당신의 하루를
                        안아줍니다.
                      </p>
                    </div>
                  </div>

                  <div style={{ borderTop: "1px dashed rgba(180,160,120,0.25)" }} />

                  {/* 2. 이용 방법 */}
                  <div className="flex gap-3">
                    <span className="text-base flex-shrink-0 mt-0.5">🗺️</span>
                    <div>
                      <p className="text-xs font-semibold mb-2" style={{ color: GREEN_MID, fontFamily: F }}>
                        이렇게 사용하세요
                      </p>
                      <ol className="space-y-1.5">
                        {[
                          "오른쪽에서 마음 날씨 태그를 선택하거나",
                          "지금의 감정·고민을 자유롭게 직접 입력하세요.",
                          "→ 버튼을 누르면 맞춤 문헌이 추천됩니다.",
                          "추천 결과에서 도서관 소장 여부도 확인할 수 있어요.",
                        ].map((step, i) => (
                          <li key={i} className="flex gap-2 items-start">
                            <span
                              className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
                              style={{
                                background: GREEN_DARK, color: BG2,
                                fontFamily: F, fontSize: "9px", marginTop: "1px",
                              }}
                            >
                              {i + 1}
                            </span>
                            <span className="text-xs leading-relaxed" style={{ color: BROWN, fontFamily: F }}>
                              {step}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>

                  <div style={{ borderTop: "1px dashed rgba(180,160,120,0.25)" }} />

                  {/* 3. AI 추천 한계 */}
                  <div className="flex gap-3">
                    <span className="text-base flex-shrink-0 mt-0.5">🤖</span>
                    <div>
                      <p className="text-xs font-semibold mb-1" style={{ color: GREEN_MID, fontFamily: F }}>
                        AI 추천의 한계
                      </p>
                      <p className="text-xs leading-relaxed" style={{ color: BROWN, fontFamily: F }}>
                        추천 결과는 Google Gemini AI가 생성하며, 개인의 상황에 따라
                        맞지 않을 수 있습니다. 본 서비스는{" "}
                        <strong>의료행위가 아니며</strong>, 심각한 심리적 고통이나
                        위기 상황에서는 반드시 전문기관의 도움을 받으세요.
                      </p>
                    </div>
                  </div>

                  <div style={{ borderTop: "1px dashed rgba(180,160,120,0.25)" }} />

                  {/* 4. 개인정보 미수집 */}
                  <div className="flex gap-3">
                    <span className="text-base flex-shrink-0 mt-0.5">🔒</span>
                    <div>
                      <p className="text-xs font-semibold mb-1" style={{ color: GREEN_MID, fontFamily: F }}>
                        개인정보 미수집
                      </p>
                      <p className="text-xs leading-relaxed" style={{ color: BROWN, fontFamily: F }}>
                        입력한 감정 텍스트는 AI 추천 생성에만 사용되며, 서버에
                        저장되지 않습니다. 서재 기록은 이 기기의 브라우저
                        로컬 스토리지에만 저장됩니다.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 용지 하단 */}
                <div
                  className="px-6 py-3 flex items-center justify-between"
                  style={{ borderTop: "1px dashed rgba(180,160,120,0.25)", background: "rgba(245,240,228,0.45)" }}
                >
                  <span className="text-xs" style={{ color: MUTED, fontFamily: F }}>© 2026 마음서재 by lou</span>
                  <span className="text-xs" style={{ color: MUTED, fontFamily: F }}>Powered by Google Gemini</span>
                </div>
              </div>
            </section>

            {/* ══ 오른쪽: 날씨 태그 + 입력 + 히스토리 ══ */}
            <aside className="flex flex-col gap-4">

              {/* 날씨 태그 */}
              <div
                className="rounded-2xl px-5 py-5"
                style={{ background: BG2, border: `1px solid ${BORDER}`, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs tracking-widest" style={{ color: "#6e5428", fontFamily: F }}>
                    ── 마음 날씨 빠른 선택 ──
                  </p>
                  {selectedWeather && (
                    <button
                      type="button"
                      onClick={handleClearWeather}
                      className="flex items-center gap-1 text-xs opacity-55 hover:opacity-100 transition-opacity"
                      style={{ color: "#6e5428", fontFamily: F }}
                    >
                      <X className="w-3 h-3" /> 선택 해제
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {WEATHER_OPTIONS.map((w) => {
                    const isSelected = selectedWeather?.label === w.label;
                    return (
                      <button
                        key={w.label}
                        type="button"
                        onClick={() => handleWeatherSelect(w)}
                        className="px-3 py-1.5 rounded-full text-xs border transition-all hover:scale-105 active:scale-95"
                        style={
                          isSelected
                            ? { background: GREEN_DARK, color: BG2, border: `1.5px solid ${GREEN_MID}`, fontFamily: F, boxShadow: `0 2px 8px rgba(46,74,56,0.28)` }
                            : { background: "rgba(255,255,255,0.55)", color: BROWN, border: `1px solid rgba(180,160,120,0.35)`, fontFamily: F }
                        }
                      >
                        {w.emoji} {w.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 마음 기록 입력 */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: "#fdf8ee", border: `1px solid ${BORDER}`, boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}
              >
                <div
                  className="px-5 py-2.5 flex items-center justify-between"
                  style={{ borderBottom: "1px dashed rgba(180,160,120,0.30)", background: "rgba(245,240,228,0.55)" }}
                >
                  <span className="text-xs" style={{ color: MUTED, fontFamily: F }}>✍️ 오늘의 마음 기록</span>
                  {selectedWeather && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: GREEN_DARK, color: BG2, fontFamily: F }}>
                      {selectedWeather.emoji} {selectedWeather.label}
                    </span>
                  )}
                </div>
                <form onSubmit={handleSubmit} className="relative">
                  <textarea
                    id="symptom"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="지금 마음의 날씨를 들려주세요..."
                    rows={5}
                    className="w-full p-5 pr-16 resize-none focus:outline-none"
                    style={{ background: "transparent", color: INK, fontFamily: F, fontSize: "14px", lineHeight: "1.9" }}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="absolute right-4 bottom-4 w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-md hover:shadow-lg active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed"
                    style={{ background: GREEN_DARK, color: BG2 }}
                    aria-label="기록 제출"
                  >
                    <Send className="w-4 h-4 ml-0.5" />
                  </button>
                </form>
                <div className="px-5 py-2 flex items-center gap-2" style={{ borderTop: "1px dashed rgba(180,160,120,0.22)" }}>
                  <Leaf className="w-3 h-3 flex-shrink-0" style={{ color: MUTED }} />
                  <span className="text-xs" style={{ color: MUTED, fontFamily: F }}>
                    AI 북큐레이터 · 한국어 도서 추천 · 맞춤형 읽기 가이드
                  </span>
                </div>
              </div>

              {/* 서재 기록 */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: BG2, border: `1px solid ${BORDER}`, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
              >
                <button
                  type="button"
                  onClick={() => setIsSavedOpen((p) => !p)}
                  className="w-full flex items-center justify-between px-4 py-3.5"
                >
                  <span className="flex items-center gap-2 text-sm" style={{ color: BROWN, fontFamily: F }}>
                    <Clock3 className="w-3.5 h-3.5" style={{ color: "#6e5428" }} />
                    서재 기록
                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: GREEN_DARK, color: BG2, fontSize: "10px", fontFamily: F }}>
                      {savedPrescriptions.length}
                    </span>
                  </span>
                  {isSavedOpen ? <ChevronUp className="w-3.5 h-3.5" style={{ color: MUTED }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: MUTED }} />}
                </button>
                {isSavedOpen && (
                  <div className="px-4 pb-4" style={{ borderTop: "1px dashed rgba(180,160,120,0.30)" }}>
                    <div className="pt-3 space-y-2">
                      {savedPrescriptions.length === 0 ? (
                        <p className="text-xs text-center py-3" style={{ color: MUTED, fontFamily: F }}>아직 서재 기록이 없어요.</p>
                      ) : (
                        savedPrescriptions.slice(0, 5).map((item) => (
                          <div key={item.id} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.55)", border: `1px solid rgba(180,160,120,0.22)` }}>
                            <button onClick={() => handleOpenSaved(item)} className="text-left w-full">
                              <p className="text-xs leading-relaxed line-clamp-2 mb-1" style={{ color: BROWN, fontFamily: F }}>{item.userInput}</p>
                              <p style={{ color: MUTED, fontFamily: F, fontSize: "10px" }}>{formatRxNum(item.id)} · {formatDate(item.createdAt)}</p>
                            </button>
                            <div className="mt-2 flex justify-end">
                              <button
                                onClick={() => handleDeleteSaved(item.id)}
                                className="flex items-center gap-1 opacity-45 hover:opacity-90 transition-opacity"
                                style={{ color: "#a04030", fontFamily: F, fontSize: "10px" }}
                              >
                                <Trash2 className="w-3 h-3" /> 삭제
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 북마크 */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: BG2, border: `1px solid ${BORDER}`, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
              >
                <button
                  type="button"
                  onClick={() => setIsBookmarksOpen((p) => !p)}
                  className="w-full flex items-center justify-between px-4 py-3.5"
                >
                  <span className="flex items-center gap-2 text-sm" style={{ color: BROWN, fontFamily: F }}>
                    <Bookmark className="w-3.5 h-3.5" style={{ color: "#6e5428" }} />
                    북마크 도서
                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: GREEN_DARK, color: BG2, fontSize: "10px", fontFamily: F }}>
                      {bookmarks.length}
                    </span>
                  </span>
                  {isBookmarksOpen ? <ChevronUp className="w-3.5 h-3.5" style={{ color: MUTED }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: MUTED }} />}
                </button>
                {isBookmarksOpen && (
                  <div className="px-4 pb-4" style={{ borderTop: "1px dashed rgba(180,160,120,0.30)" }}>
                    <div className="pt-3 space-y-2">
                      {bookmarks.length === 0 ? (
                        <p className="text-xs text-center py-3" style={{ color: MUTED, fontFamily: F }}>북마크한 도서가 없어요.</p>
                      ) : (
                        bookmarks.slice(0, 5).map((item) => (
                          <div key={item.id} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.55)", border: `1px solid rgba(180,160,120,0.22)` }}>
                            <p className="text-xs leading-snug" style={{ color: BROWN, fontFamily: F }}>
                              <BookOpen className="w-3 h-3 inline mr-1" style={{ color: GREEN_MID, verticalAlign: "middle" }} />
                              {item.book.title}
                            </p>
                            <p className="mt-1" style={{ color: MUTED, fontFamily: F, fontSize: "10px" }}>
                              {item.book.author} · {item.book.publisher}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </aside>

          </div>
        </main>

        <footer
          className="py-4 text-center text-xs border-t mt-auto"
          style={{
            color: "rgba(90,70,40,0.38)",
            borderColor: "rgba(180,160,120,0.22)",
            fontFamily: F,
            background: BG,
          }}
        >
          © 2026 마음서재 by lou · Powered by Google Gemini
        </footer>
      </div>
    );
  }

  // ── ANALYZING ────────────────────────────────────────────────────
  if (appState === AppState.ANALYZING) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: BG, fontFamily: F }}
      >
        <div
          className="text-center px-10 py-12 rounded-2xl"
          style={{
            background: BG2,
            border: `1px solid ${BORDER}`,
            boxShadow: "0 8px 32px rgba(0,0,0,0.10)",
          }}
        >
          <div
            className="w-12 h-12 rounded-full mx-auto mb-6 animate-spin"
            style={{
              border: "3px solid rgba(180,160,120,0.20)",
              borderTopColor: GREEN_DARK,
            }}
          />
          <p className="text-xs tracking-widest mb-3" style={{ color: MUTED, fontFamily: F }}>
            ── Rx ──
          </p>
          <h2 className="text-lg mb-2" style={{ color: INK, fontFamily: F }}>
            마음을 읽고 있습니다...
          </h2>
          <p className="text-sm" style={{ color: MUTED, fontFamily: F }}>
            서가에서 책을 고르는 중입니다.
          </p>
        </div>
      </div>
    );
  }

  // ── PRESCRIBED ───────────────────────────────────────────────────
  if (appState === AppState.PRESCRIBED && prescription) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: BG }}>
        <Header onResetStorage={handleResetStorage} />
        <main className="flex-grow container mx-auto px-4 py-8">
          <PrescriptionView
            data={prescription}
            onReset={handleReset}
            onBookmarksChange={refreshBookmarks}
          />
        </main>
      </div>
    );
  }

  // ── ERROR ────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: BG, fontFamily: F }}
    >
      <div
        className="max-w-md w-full text-center p-8 rounded-2xl"
        style={{ background: BG2, border: "1px solid rgba(180,80,60,0.25)" }}
      >
        <p className="text-sm mb-6" style={{ color: "#7a3020", fontFamily: F }}>
          {error}
        </p>
        <button
          onClick={() => setAppState(AppState.IDLE)}
          className="text-sm underline underline-offset-4 hover:opacity-70 transition-opacity"
          style={{ color: GREEN_DARK, fontFamily: F }}
        >
          다시 시도하기
        </button>
      </div>
    </div>
  );
};

export default App;