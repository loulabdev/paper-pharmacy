import React, { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { PrescriptionView } from "./components/PrescriptionView";
import { getPrescription } from "./services/geminiService";
import {
  deleteSavedPrescription,
  getBookBookmarks,
  getSavedPrescriptions,
  resetAllStorage,
  savePrescriptionToStorage,
} from "./services/storageService";
import {
  AppState,
  Prescription,
  SavedPrescription,
  BookBookmark,
} from "./types";
import {
  PenTool,
  Send,
  Clock3,
  Trash2,
  Bookmark,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";

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
    selectedClass: "bg-amber-100 text-amber-900 border-amber-300",
    tagClass: "bg-amber-50 text-amber-900 border-amber-200",
  },
  {
    label: "흐림",
    emoji: "⛅",
    text: "마음 날씨: 흐림. 이유를 정확히 모르겠지만 마음이 조금 가라앉아 있어요.",
    selectedClass: "bg-stone-200 text-stone-900 border-stone-300",
    tagClass: "bg-stone-100 text-stone-900 border-stone-200",
  },
  {
    label: "비",
    emoji: "🌧",
    text: "마음 날씨: 비. 우울하고 축 처지는 느낌이 들어요.",
    selectedClass: "bg-slate-200 text-slate-900 border-slate-300",
    tagClass: "bg-slate-100 text-slate-900 border-slate-200",
  },
  {
    label: "천둥",
    emoji: "⛈",
    text: "마음 날씨: 천둥. 불안과 걱정이 커서 마음이 시끄러워요.",
    selectedClass: "bg-indigo-200 text-indigo-950 border-indigo-300",
    tagClass: "bg-indigo-50 text-indigo-950 border-indigo-200",
  },
  {
    label: "강풍",
    emoji: "🌪",
    text: "마음 날씨: 강풍. 생각이 많고 혼란스러워서 중심을 잡기 어려워요.",
    selectedClass: "bg-violet-200 text-violet-950 border-violet-300",
    tagClass: "bg-violet-50 text-violet-950 border-violet-200",
  },
  {
    label: "눈",
    emoji: "❄️",
    text: "마음 날씨: 눈. 무기력하고 에너지가 거의 없어요.",
    selectedClass: "bg-sky-100 text-sky-900 border-sky-200",
    tagClass: "bg-sky-50 text-sky-900 border-sky-200",
  },
];

const App: React.FC = () => {
  const [input, setInput] = useState("");
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedPrescriptions, setSavedPrescriptions] = useState<SavedPrescription[]>([]);
  const [bookmarks, setBookmarks] = useState<BookBookmark[]>([]);

  const [isSavedOpen, setIsSavedOpen] = useState(true);
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(true);
  const [selectedWeather, setSelectedWeather] = useState<WeatherOption | null>(null);

  useEffect(() => {
    setSavedPrescriptions(getSavedPrescriptions());
    setBookmarks(getBookBookmarks());
  }, []);

  const refreshBookmarks = () => {
    setBookmarks(getBookBookmarks());
  };

  const refreshSavedPrescriptions = () => {
    setSavedPrescriptions(getSavedPrescriptions());
  };

  const handleResetStorage = () => {
    const confirmed = window.confirm(
      "북마크와 처방 기록을 모두 삭제할까요?\n이 작업은 되돌릴 수 없습니다."
    );

    if (!confirmed) return;

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

      const updatedSaved = savePrescriptionToStorage(savedItem);
      setSavedPrescriptions(updatedSaved);
      refreshBookmarks();

      setAppState(AppState.PRESCRIBED);
    } catch (err) {
      console.error(err);
      setError("죄송합니다. 처방을 생성하는 도중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
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

  const handleOpenSavedPrescription = (item: SavedPrescription) => {
    setPrescription(item.prescription);
    setInput(item.userInput);
    refreshBookmarks();
    setAppState(AppState.PRESCRIBED);
  };

  const handleDeleteSavedPrescription = (id: string) => {
    const updated = deleteSavedPrescription(id);
    setSavedPrescriptions(updated);
  };

  const handleWeatherSelect = (weather: WeatherOption) => {
    setSelectedWeather(weather);

    setInput((prev) => {
      const trimmed = prev.trim();
      const cleaned = WEATHER_OPTIONS.reduce((acc, option) => {
        return acc.replace(option.text, "").trim();
      }, trimmed);

      if (!cleaned) return weather.text;
      return `${weather.text}\n\n${cleaned}`;
    });
  };

  const handleClearSelectedWeather = () => {
    setSelectedWeather(null);

    setInput((prev) => {
      const trimmed = prev.trim();
      const cleaned = WEATHER_OPTIONS.reduce((acc, option) => {
        return acc.replace(option.text, "").trim();
      }, trimmed);
      return cleaned;
    });
  };

  return (
    <div className="min-h-screen bg-paper-50 selection:bg-paper-300 selection:text-ink-900 flex flex-col">
      <Header onResetStorage={handleResetStorage} />

      <main className="flex-grow container mx-auto px-4 py-8 md:py-12">
        {appState === AppState.IDLE && (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.9fr)] gap-6">
            <section className="animate-fade-in-up">
              <div className="bg-white border border-paper-200 rounded-2xl shadow-sm px-6 py-7 md:px-8 md:py-9">
                <div className="max-w-2xl mx-auto">
                  <div className="text-center">
                    <p className="text-xs tracking-[0.18em] uppercase text-paper-800/60 mb-3">
                      Mind Weather Check-in
                    </p>
                    <label
                      htmlFor="symptom"
                      className="block font-serif text-2xl md:text-[1.75rem] leading-snug text-ink-900"
                    >
                      오늘 당신의 마음 날씨는 어떤가요?
                    </label>
                    <p className="mt-3 text-sm md:text-[15px] text-ink-800/65 leading-relaxed">
                      지금 떠오르는 감정, 생각, 고민을 편안하게 적어주세요.
                      <br className="hidden sm:block" />
                      아래 버튼으로 마음 날씨를 고른 뒤 시작해도 괜찮아요.
                    </p>
                  </div>

                  {selectedWeather && (
                    <div className="mt-5 flex justify-center">
                      <div
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm shadow-sm ${selectedWeather.tagClass}`}
                      >
                        <span>{selectedWeather.emoji}</span>
                        <span className="font-medium">
                          선택한 날씨: {selectedWeather.label}
                        </span>
                        <button
                          type="button"
                          onClick={handleClearSelectedWeather}
                          className="ml-1 opacity-70 hover:opacity-100 transition-opacity"
                          aria-label="선택한 날씨 지우기"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="mt-6 relative">
                    <textarea
                      id="symptom"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="지금 마음의 날씨를 들려주세요..."
                      className="w-full h-32 md:h-36 p-5 pr-16 bg-paper-50 border border-paper-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-paper-300 focus:border-transparent resize-none text-[15px] leading-relaxed text-ink-800 placeholder:text-paper-400/90 transition-shadow"
                    />
                    <button
                      type="submit"
                      disabled={!input.trim()}
                      className="absolute right-4 bottom-4 bg-ink-900 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-ink-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg active:scale-95"
                      aria-label="처방 요청 보내기"
                    >
                      <Send className="w-4 h-4 ml-0.5" />
                    </button>
                  </form>

                  <div className="mt-5 rounded-2xl bg-paper-50 border border-paper-200 p-4 md:p-5">
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                      <p className="text-sm font-medium text-ink-900">
                        마음 날씨 빠르게 선택하기
                      </p>
                      <p className="text-xs text-ink-800/55">
                        버튼을 눌러 입력을 시작할 수 있어요
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2.5">
                      {WEATHER_OPTIONS.map((weather) => {
                        const isSelected =
                          selectedWeather?.label === weather.label &&
                          selectedWeather?.emoji === weather.emoji;

                        return (
                          <button
                            key={`${weather.emoji}-${weather.label}`}
                            type="button"
                            onClick={() => handleWeatherSelect(weather)}
                            className={`px-3.5 py-2 rounded-full text-sm border transition-all ${
                              isSelected
                                ? weather.selectedClass
                                : "bg-white text-ink-900 border-paper-300 hover:bg-paper-100"
                            }`}
                          >
                            <span className="mr-1.5">{weather.emoji}</span>
                            {weather.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5 flex justify-center text-xs text-paper-800/60 gap-4 flex-wrap">
                    <span className="flex items-center gap-1">
                      <PenTool className="w-3 h-3" /> AI 북큐레이터
                    </span>
                    <span>•</span>
                    <span>한국어 도서 추천</span>
                    <span>•</span>
                    <span>맞춤형 읽기 가이드</span>
                  </div>
                </div>
              </div>
            </section>

            <aside className="space-y-5">
              <div className="bg-white border border-paper-200 rounded-2xl shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsSavedOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                >
                  <h3 className="font-serif text-lg text-ink-900 flex items-center gap-2">
                    <Clock3 className="w-4 h-4" />
                    저장된 처방
                    <span className="text-sm font-sans text-ink-800/50">
                      ({savedPrescriptions.length})
                    </span>
                  </h3>
                  {isSavedOpen ? (
                    <ChevronUp className="w-4 h-4 text-ink-800/70" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-ink-800/70" />
                  )}
                </button>

                {isSavedOpen && (
                  <div className="px-5 pb-5 border-t border-paper-100">
                    <div className="pt-4">
                      {savedPrescriptions.length === 0 ? (
                        <p className="text-sm text-ink-800/60">
                          아직 저장된 처방이 없습니다.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {savedPrescriptions.slice(0, 5).map((item) => (
                            <div
                              key={item.id}
                              className="border border-paper-200 rounded-xl p-3 bg-paper-50"
                            >
                              <button
                                onClick={() => handleOpenSavedPrescription(item)}
                                className="text-left w-full"
                              >
                                <p className="text-sm font-medium text-ink-900 line-clamp-2 leading-relaxed">
                                  {item.userInput}
                                </p>
                                <p className="text-xs text-ink-800/60 mt-1.5">
                                  {new Date(item.createdAt).toLocaleString("ko-KR")}
                                </p>
                              </button>

                              <div className="mt-3 flex justify-end">
                                <button
                                  onClick={() => handleDeleteSavedPrescription(item.id)}
                                  className="text-xs text-red-700 inline-flex items-center gap-1 hover:underline"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  삭제
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white border border-paper-200 rounded-2xl shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsBookmarksOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                >
                  <h3 className="font-serif text-lg text-ink-900 flex items-center gap-2">
                    <Bookmark className="w-4 h-4" />
                    북마크 도서
                    <span className="text-sm font-sans text-ink-800/50">
                      ({bookmarks.length})
                    </span>
                  </h3>
                  {isBookmarksOpen ? (
                    <ChevronUp className="w-4 h-4 text-ink-800/70" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-ink-800/70" />
                  )}
                </button>

                {isBookmarksOpen && (
                  <div className="px-5 pb-5 border-t border-paper-100">
                    <div className="pt-4">
                      {bookmarks.length === 0 ? (
                        <p className="text-sm text-ink-800/60">
                          아직 북마크한 도서가 없습니다.
                        </p>
                      ) : (
                        <ul className="space-y-3">
                          {bookmarks.slice(0, 5).map((item) => (
                            <li
                              key={item.id}
                              className="border border-paper-200 rounded-xl p-3 bg-paper-50"
                            >
                              <p className="text-sm font-medium text-ink-900 leading-relaxed">
                                {item.book.title}
                              </p>
                              <p className="text-xs text-ink-800/60 mt-1.5">
                                {item.book.author} | {item.book.publisher}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}

        {appState === AppState.ANALYZING && (
          <div className="flex flex-col items-center justify-center py-20 animate-pulse">
            <div className="w-16 h-16 border-4 border-paper-200 border-t-ink-900 rounded-full animate-spin mb-6"></div>
            <h2 className="text-xl font-serif text-ink-900 mb-2">
              당신의 마음을 읽고 있습니다...
            </h2>
            <p className="text-ink-800/60">적절한 문장을 고르는 중입니다.</p>
          </div>
        )}

        {appState === AppState.PRESCRIBED && prescription && (
          <PrescriptionView
            data={prescription}
            onReset={handleReset}
            onBookmarksChange={refreshBookmarks}
          />
        )}

        {appState === AppState.ERROR && (
          <div className="max-w-md mx-auto text-center py-20">
            <div className="text-red-800 bg-red-50 p-6 rounded-lg border border-red-100 mb-6">
              {error}
            </div>
            <button
              onClick={() => setAppState(AppState.IDLE)}
              className="text-ink-900 underline underline-offset-4 hover:text-ink-700"
            >
              다시 시도하기
            </button>
          </div>
        )}
      </main>

      <footer className="py-6 text-center text-ink-800/40 text-xs border-t border-paper-200 mt-auto px-4">
        <p>© 2026 Paper Pharmacy. Powered by Google Gemini.</p>
        <p className="mt-1">
          본 서비스는 의료행위가 아니며, 심각한 심리적 고통이나 위기 상황에서는 전문기관의 도움을 받으세요.
        </p>
      </footer>
    </div>
  );
};

export default App;