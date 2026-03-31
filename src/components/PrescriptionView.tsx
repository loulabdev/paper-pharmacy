import React, {
  useEffect, useMemo, useState, useRef, useCallback, useLayoutEffect,
} from "react";
import {
  Quote, Sparkles, AlertCircle, Heart, Bookmark, MapPin, ExternalLink,
  ChevronDown, ChevronUp, BookOpen, ArrowLeft, Search, RotateCcw,
} from "lucide-react";
import { LibraryAvailability, LibrarySearchMeta, Prescription } from "../types";
import { getBookBookmarks, toggleBookBookmark } from "../services/storageService";
import { getBookCoverUrl } from "../services/bookCoverService";
import {
  findNearbyLibrariesByBook,
  findLibrariesByBookNationwide,
  findLibrariesByMultipleIsbns,
} from "../services/libraryService";
import { getCurrentLocation, type UserLocation } from "../services/locationService";
import BookCover from "./BookCover";
import { emotionBooks } from "../data/emotionBooks";
import { findLatestEdition, formatPubdate, type LatestEditionResult } from "../services/bookSearchOrchestrator";
import { collectAllEditionIsbns, collectAllEditionIsbnsWithStats } from "../services/editionIsbnService";

interface Props {
  data: Prescription;
  onReset: () => void;
  onBookmarksChange?: () => void;
}

type RecommendedBook = Prescription["recommended_books"][number];

// ─── 폰트 / 색상 토큰 ────────────────────────────────────────────────────────
const SE: React.CSSProperties = { fontFamily: "'Special Elite', 'Courier New', monospace" };
const GB: React.CSSProperties = { fontFamily: "'Gowun Batang', serif" };

const C = {
  page1: "#f2ead8",
  page2: "#f5f0e4",
  cover1: "#506e5c",
  cover2: "#2e4a38",
  ink: "#2e2414",
  ink2: "#6e5428",
  ink3: "#96845a",
  bdr: "rgba(110,84,40,0.22)",
  box: "rgba(255,251,236,0.55)",
  ribbon: "#b08040",
  seal: "#7a3a2a",
  green: "#2d8040",
  greenDark: "#1a3a20",
  greenMid: "#3a7a50",
};

// ─── 페이퍼 질감 ──────────────────────────────────────────────────────────────
const linesBg = `repeating-linear-gradient(0deg,transparent,transparent 27px,rgba(110,84,40,0.05) 27px,rgba(110,84,40,0.05) 28px)`;
const paperStyle = (bg: string): React.CSSProperties => ({
  backgroundColor: bg,
  backgroundImage: linesBg,
});

// ─── 타자기 훅 ────────────────────────────────────────────────────────────────
function useTypewriter() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const type = useCallback((
    setText: React.Dispatch<React.SetStateAction<string>>,
    setDone: React.Dispatch<React.SetStateAction<boolean>>,
    text: string,
    speed = 60,
  ) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setText(""); setDone(false);
    const chars = [...text]; let i = 0;
    const next = () => {
      if (i < chars.length) {
        setText(prev => prev + chars[i++]);
        timerRef.current = setTimeout(next, speed + Math.floor(Math.random() * 22));
      } else { setDone(true); }
    };
    timerRef.current = setTimeout(next, speed);
  }, []);
  const cancel = useCallback(() => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return { type, cancel };
}

// ─── 섹션 헤더 ────────────────────────────────────────────────────────────────
const SH = ({ label }: { label: string }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 5, margin: "8px 0 5px" }}>
    <div style={{ flex: 1, height: 1, background: C.bdr }} />
    <span style={{ ...SE, fontSize: 8.5, color: C.ink2, letterSpacing: "0.08em", whiteSpace: "nowrap", fontWeight: 700 }}>{label}</span>
    <div style={{ flex: 1, height: 1, background: C.bdr }} />
  </div>
);

// ─── 가름끈 (녹색 리본 + 하단 네잎클로버) ────────────────────────────────────
const Spine = ({ height = "100%" }: { height?: string | number }) => (
  <div style={{ width: "clamp(16px,2.2vw,24px)", flexShrink: 0, position: "relative", zIndex: 10, backgroundColor: C.page1, height }}>
    {/* 녹색 리본 세로줄 */}
    <div style={{
      position: "absolute", top: 0, bottom: 28, left: "50%", transform: "translateX(-50%)",
      width: 8,
      background: `linear-gradient(90deg, ${C.greenDark} 0%, #2e6040 20%, ${C.greenMid} 45%, #4a9060 50%, ${C.greenMid} 55%, #2e6040 80%, ${C.greenDark} 100%)`,
      zIndex: 11,
    }} />
    {/* 네잎클로버: 잎 4개 (box-shadow) */}
    <div style={{ position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)", width: 20, height: 20, zIndex: 13 }}>
      <div style={{
        position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
        width: 6, height: 6, borderRadius: "50%",
        background: "radial-gradient(circle, #5aaa60 30%, #2e6a38 100%)",
        boxShadow: "0 -6px 0 1.5px #3a8848, 0 6px 0 1.5px #3a8848, -6px 0 0 1.5px #3a8848, 6px 0 0 1.5px #3a8848",
      }} />
      {/* 중앙 원 */}
      <div style={{
        position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
        width: 5, height: 5, borderRadius: "50%",
        background: "radial-gradient(circle, #7acc80 30%, #3a7a48 100%)",
        zIndex: 2,
      }} />
    </div>
  </div>
);

// ─── 책 사이드 엣지 ───────────────────────────────────────────────────────────
const edgePattern = (dir: "left" | "right") => ({
  width: "clamp(8px,1.2vw,13px)" as string | number,
  flexShrink: 0 as number,
  zIndex: 5,
  position: "relative" as const,
  background: dir === "left"
    ? "repeating-linear-gradient(to right, #ede3ce 0, #ede3ce 1.5px, #c8b888 2px, #f0e6d4 4px, #c8b888 4.5px, #ede3ce 6px, #c8b888 6.5px, #f0e6d4 8.5px, #c8b888 9px, #ede3ce 13px)"
    : "repeating-linear-gradient(to left, #ede3ce 0, #ede3ce 1.5px, #c8b888 2px, #f0e6d4 4px, #c8b888 4.5px, #ede3ce 6px, #c8b888 6.5px, #f0e6d4 8.5px, #c8b888 9px, #ede3ce 13px)",
});

// ─── 책 표지 3D ───────────────────────────────────────────────────────────────
function Cover3D({ book, coverUrl, w, h }: { book: RecommendedBook; coverUrl?: string | null; w: number; h: number }) {
  return (
    <div style={{ width: w, height: h, flexShrink: 0, position: "relative", borderRadius: "2px 5px 5px 2px", overflow: "hidden", boxShadow: "2px 5px 14px rgba(0,0,0,0.32)" }}>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(160deg,${C.cover1},${C.cover2})` }} />
      {coverUrl
        ? <img src={coverUrl} alt={book.title} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        : (
          <div style={{ position: "absolute", top: "22%", left: 0, right: 0, textAlign: "center", padding: "0 8px", zIndex: 2 }}>
            <span style={{ ...GB, fontSize: Math.max(9, w * 0.12), fontWeight: 700, color: "rgba(255,255,255,0.88)", lineHeight: 1.3 }}>{book.title}</span>
          </div>
        )
      }
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "18%", background: "#d2c6a4", borderTop: "1px solid rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ ...SE, fontSize: 6, color: "#6a5828" }}>{book.author}</span>
      </div>
      <div style={{ position: "absolute", bottom: "20%", right: 7, ...SE, fontSize: w * 0.18, color: "rgba(255,255,255,0.1)" }}>R</div>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 8, background: "linear-gradient(90deg,rgba(0,0,0,0.32),rgba(0,0,0,0.06))" }} />
    </div>
  );
}

// ─── 추가 검색 항목 ───────────────────────────────────────────────────────────
const SEARCH_ITEMS = [
  { id: "library_all", label: "소장 도서관 전체 보기" },
  { id: "latest",      label: "최신판 + 전체판본 검색" },
  { id: "book_search", label: "도서 검색" },
  { id: "similar",     label: "감정 유사 도서 추천" },
  { id: "author",      label: "동일 저자 더 보기" },
];

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
const PrescriptionView: React.FC<Props> = ({ data, onReset, onBookmarksChange }) => {
  const [bookmarks, setBookmarks]           = useState(getBookBookmarks());
  const [coverUrls, setCoverUrls]           = useState<Record<string, string | null>>({});
  const [libraryResults, setLibraryResults] = useState<Record<string, LibraryAvailability[]>>({});
  const [libraryErrors, setLibraryErrors]   = useState<Record<string, string | null>>({});
  const [searchedBooks, setSearchedBooks]   = useState<Record<string, boolean>>({});
  const [loadingBooks, setLoadingBooks]     = useState<Record<string, boolean>>({});
  const [latestResults, setLatestResults]   = useState<Record<string, LatestEditionResult | null>>({});
  const [loadingLatest, setLoadingLatest]   = useState<Record<string, boolean>>({});
  const [expandedLibraries, setExpandedLibraries] = useState<Record<string, boolean>>({});
  const [librarySearchMeta, setLibrarySearchMeta] = useState<Record<string, LibrarySearchMeta | null>>({});
  const [searchPanelOpen, setSearchPanelOpen] = useState<Record<string, boolean>>({});
  const [searchChecked, setSearchChecked]   = useState<Record<string, Record<string, boolean>>>({});

  // 오픈북 상태
  const [openBookKey, setOpenBookKey]   = useState<string | null>(null);
  const [closingKey, setClosingKey]     = useState<string | null>(null);
  const [panelUp, setPanelUp]           = useState(false);
  const [isFlipping, setIsFlipping]     = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  // 타자기
  const [quoteText, setQuoteText] = useState("");
  const [quoteDone, setQuoteDone] = useState(false);
  const { type: typeText, cancel: cancelType } = useTypewriter();

  // 반응형
  const [isTablet, setIsTablet] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const h = (e: MediaQueryListEvent) => setIsTablet(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  const bookmarkedKeys = useMemo(
    () => new Set(bookmarks.map(b => `${b.book.title}__${b.book.author}__${b.book.publisher}`)),
    [bookmarks],
  );
  const getBookKey = (b: RecommendedBook) => `${b.title}__${b.author}__${b.publisher}`;
  const detectedEmotion = data.emotional_analysis.detected_emotion?.trim() || "";
  const curatedBooks = emotionBooks[detectedEmotion] || [];

  // ── 닫기 ──────────────────────────────────────────────────────────────────
  const closePanel = useCallback(() => {
    cancelType(); setPanelUp(false);
    setTimeout(() => { setQuoteText(""); setQuoteDone(false); }, 280);
  }, [cancelType]);

  // ── 카드 클릭 → 페이지 넘기기 애니메이션 ─────────────────────────────────
  const handleCardClick = useCallback((book: RecommendedBook) => {
    const key = getBookKey(book);
    if (openBookKey === key) {
      closePanel();
      setClosingKey(key);
      setTimeout(() => { setOpenBookKey(null); setClosingKey(null); }, 400);
      return;
    }
    if (openBookKey) { setClosingKey(openBookKey); closePanel(); setTimeout(() => setClosingKey(null), 350); }
    setIsFlipping(true);
    setTimeout(() => {
      setIsFlipping(false);
      setOpenBookKey(key);
      setPanelUp(true);
      typeText(setQuoteText, setQuoteDone, book.quote ?? "", 58);
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }, 900);
  }, [openBookKey, closePanel, typeText]);

  // ── 다음 책 ────────────────────────────────────────────────────────────────
  const handleNextBook = useCallback(() => {
    if (!openBookKey) return;
    const books = data.recommended_books;
    const idx = books.findIndex(b => getBookKey(b) === openBookKey);
    if (idx < books.length - 1) {
      const nextBook = books[idx + 1];
      closePanel();
      setTimeout(() => {
        setOpenBookKey(getBookKey(nextBook));
        setPanelUp(true);
        typeText(setQuoteText, setQuoteDone, nextBook.quote ?? "", 58);
      }, 300);
    }
  }, [openBookKey, data.recommended_books, closePanel, typeText]);

  // ── 북마크 ────────────────────────────────────────────────────────────────
  const handleToggleBookmark = (book: RecommendedBook) => {
    setBookmarks(toggleBookBookmark(book)); onBookmarksChange?.();
  };

  // ── 도서관 검색 ────────────────────────────────────────────────────────────
  const searchLibraries = async (book: RecommendedBook, rk: string) => {
    setLoadingBooks(p => ({ ...p, [rk]: true })); setLibraryErrors(p => ({ ...p, [rk]: null }));
    try {
      let result: LibraryAvailability[] = [];
      try {
        const loc = await getCurrentLocation();
        result = await findNearbyLibrariesByBook(book, loc);
      } catch {
        result = await findLibrariesByBookNationwide(book);
        setLibraryErrors(p => ({ ...p, [rk]: "위치 확인 불가 — 전국 기준 결과입니다." }));
      }
      setLibraryResults(p => ({ ...p, [rk]: result }));
      setSearchedBooks(p => ({ ...p, [rk]: true }));
      if (result.length > 0) setExpandedLibraries(p => ({ ...p, [rk]: true }));
    } catch (e) {
      setLibraryResults(p => ({ ...p, [rk]: [] }));
      setLibraryErrors(p => ({ ...p, [rk]: e instanceof Error ? e.message : "도서관 정보를 불러오지 못했습니다." }));
      setSearchedBooks(p => ({ ...p, [rk]: true }));
    } finally { setLoadingBooks(p => ({ ...p, [rk]: false })); }
  };

  const handleFindLibraries = async (book: RecommendedBook) => {
    const key = getBookKey(book);
    const rawIsbn = (book.isbn || "").replace(/[^0-9Xx]/g, "");
    setLibrarySearchMeta(p => ({ ...p, [key]: { isbnCount: rawIsbn.length >= 10 ? 1 : 0, regionCount: 17 } }));
    await searchLibraries(book, key);
  };

  const handleFindLatestEdition = async (book: RecommendedBook) => {
    const key = getBookKey(book);
    setLoadingLatest(p => ({ ...p, [key]: true })); setLoadingBooks(p => ({ ...p, [key]: true })); setLibraryErrors(p => ({ ...p, [key]: null }));
    try {
      const lr = await findLatestEdition(book.title, book.author, book.isbn);
      setLatestResults(p => ({ ...p, [key]: lr }));
      const { isbns, stats } = await collectAllEditionIsbnsWithStats(book.title, book.author);
      const isbnSet = new Set(isbns);
      if (book.isbn) isbnSet.add(book.isbn.replace(/[^0-9Xx]/g, ""));
      if (lr.latest?.isbn13) isbnSet.add(lr.latest.isbn13);
      for (const ed of lr.allEditions) { if (ed.isbn13) isbnSet.add(ed.isbn13); }
      const finalIsbns = [...isbnSet].filter(x => x.length >= 10);
      setLibrarySearchMeta(p => ({ ...p, [key]: { isbnCount: finalIsbns.length, regionCount: 17, isbnStats: stats } }));
      let loc: UserLocation | undefined;
      try { loc = await getCurrentLocation(); } catch { setLibraryErrors(p => ({ ...p, [key]: "위치 확인 불가 — 전국 기준 결과입니다." })); }
      const libs = await findLibrariesByMultipleIsbns(finalIsbns, loc);
      setLibraryResults(p => ({ ...p, [key]: libs }));
      setSearchedBooks(p => ({ ...p, [key]: true }));
      if (libs.length > 0) setExpandedLibraries(p => ({ ...p, [key]: true }));
    } catch (e) {
      setLibraryResults(p => ({ ...p, [key]: [] }));
      setLibraryErrors(p => ({ ...p, [key]: e instanceof Error ? e.message : "검색 중 오류가 발생했습니다." }));
      setSearchedBooks(p => ({ ...p, [key]: true }));
    } finally { setLoadingLatest(p => ({ ...p, [key]: false })); setLoadingBooks(p => ({ ...p, [key]: false })); }
  };

  const handleSearchAction = async (book: RecommendedBook, itemId: string) => {
    const key = getBookKey(book);
    setSearchChecked(p => ({ ...p, [key]: { ...(p[key] || {}), [itemId]: true } }));
    if (itemId === "library_all") await handleFindLibraries(book);
    else if (itemId === "latest") await handleFindLatestEdition(book);
    else if (itemId === "book_search") window.open(`https://www.google.com/search?q=${encodeURIComponent(`${book.title} ${book.author} 구매`)}`, "_blank");
  };

  const toggleLibraryExpand = (key: string) => setExpandedLibraries(p => ({ ...p, [key]: !p[key] }));

  useEffect(() => {
    (async () => {
      const entries = await Promise.all(data.recommended_books.map(async b => [getBookKey(b), await getBookCoverUrl(b.title, b.author)] as const));
      const r: Record<string, string | null> = {};
      for (const [k, u] of entries) r[k] = u;
      setCoverUrls(r);
    })();
  }, [data]);

  // ── 도서관 블록 ────────────────────────────────────────────────────────────
  const LibraryBlock = ({ book }: { book: RecommendedBook }) => {
    const key = getBookKey(book);
    const libraries = libraryResults[key] || [];
    const libraryError = libraryErrors[key];
    const isLoading = !!loadingBooks[key];
    const hasSearched = !!searchedBooks[key];
    const isLibExp = !!expandedLibraries[key];
    const loanableCount = libraries.filter(l => l.loanAvailable === true).length;
    const latestResult = latestResults[key];
    const meta = librarySearchMeta[key];
    return (
      <>
        {!hasSearched && !isLoading && (
          <p style={{ ...SE, fontSize: 10, color: C.ink3, textAlign: "center", padding: "4px 0" }}>추가 검색에서 도서관 조회를 선택하세요</p>
        )}
        {isLoading && <p style={{ ...SE, fontSize: 10, color: C.ink3, textAlign: "center", padding: "4px 0" }}>조회 중...</p>}
        {libraryError && !isLoading && (
          <div style={{ ...SE, fontSize: 10, color: "#c05030", padding: "3px 7px", background: "rgba(255,200,180,0.3)", borderRadius: 4, marginBottom: 4 }}>{libraryError}</div>
        )}
        {hasSearched && !isLoading && libraries.length === 0 && !libraryError && (
          <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 4, padding: "6px 8px", background: C.box, marginBottom: 5 }}>
            {(!meta || meta.isbnCount === 0)
              ? <p style={{ ...SE, fontSize: 10, color: "#a06020" }}>ISBN 매칭 실패 — 미등록 도서일 수 있습니다</p>
              : <p style={{ ...SE, fontSize: 10, color: C.ink3 }}>소장 도서관이 없습니다</p>}
          </div>
        )}
        {libraries.length > 0 && (
          <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 4, overflow: "hidden", marginBottom: 5, background: C.box }}>
            <button type="button" onClick={() => toggleLibraryExpand(key)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: "none", border: "none", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ ...SE, fontSize: 10, color: C.ink, fontWeight: 700 }}>소장 도서관</span>
                <span style={{ ...SE, fontSize: 10, padding: "1px 5px", borderRadius: 8, background: "rgba(110,84,40,0.12)", color: C.ink2 }}>{libraries.length}곳</span>
                {loanableCount > 0 && <span style={{ ...SE, fontSize: 10, padding: "1px 5px", borderRadius: 8, background: "rgba(80,140,80,0.13)", color: "#2a6a2a" }}>대출가능 {loanableCount}</span>}
              </div>
              {isLibExp ? <ChevronUp style={{ width: 12, height: 12, color: C.ink3 }} /> : <ChevronDown style={{ width: 12, height: 12, color: C.ink3 }} />}
            </button>
            {isLibExp && (
              <ul style={{ padding: "0 8px 7px" }}>
                {libraries.map((lib, idx) => (
                  <li key={`${lib.libCode || lib.libraryName}-${idx}`} style={{ borderBottom: idx < libraries.length - 1 ? `1px dotted rgba(110,84,40,0.18)` : "none", padding: "4px 0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: lib.loanAvailable ? "#5a9a5a" : lib.hasBook ? "#c87a3a" : "#aaa", flexShrink: 0 }} />
                        <span style={{ ...GB, fontSize: 10, color: C.ink, fontWeight: 700 }}>{lib.libraryName}</span>
                      </div>
                      <span style={{ ...SE, fontSize: 10, padding: "1px 5px", borderRadius: 8, whiteSpace: "nowrap", background: lib.hasBook ? (lib.loanAvailable ? "rgba(80,140,80,0.13)" : "rgba(110,84,40,0.1)") : "rgba(0,0,0,0.06)", color: lib.hasBook ? (lib.loanAvailable ? "#2a6a2a" : C.ink2) : "#888" }}>
                        {lib.hasBook ? (lib.loanAvailable ? "대출 가능" : "소장") : "미소장"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {latestResult?.found && latestResult?.latest && (
          <div style={{ border: `1px solid rgba(80,120,200,0.25)`, borderRadius: 4, padding: "7px 9px", marginBottom: 5, background: "rgba(220,235,255,0.35)" }}>
            {latestResult.isNewer
              ? <><p style={{ ...SE, fontSize: 10, color: "#2050a0", marginBottom: 3 }}>최신판 발견!</p><p style={{ ...SE, fontSize: 10, color: C.ink, fontWeight: 700 }}>{latestResult.latest.title}</p><p style={{ ...SE, fontSize: 10, color: C.ink3 }}>{formatPubdate(latestResult.latest.pubdate)} · {latestResult.latest.publisher}</p></>
              : <p style={{ ...SE, fontSize: 10, color: "#2050a0" }}>이미 최신판입니다</p>}
          </div>
        )}
      </>
    );
  };

  // ── 추가 검색 드롭업 ──────────────────────────────────────────────────────
  const SearchDropup = ({ book }: { book: RecommendedBook }) => {
    const key = getBookKey(book);
    const panelOpen = !!searchPanelOpen[key];
    const checked = searchChecked[key] || {};
    return (
      <div style={{ position: "relative", marginTop: 6 }}>
        <button type="button" onClick={() => setSearchPanelOpen(p => ({ ...p, [key]: !p[key] }))}
          style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px", border: `1px solid rgba(42,62,46,0.20)`, borderRadius: 4, background: "rgba(42,62,46,0.08)", cursor: "pointer" }}>
          <Search style={{ width: 7, height: 7, color: C.ink2 }} />
          <span style={{ ...SE, fontSize: 7.5, color: "#3a5030", letterSpacing: "0.04em" }}>추가  검색</span>
          {panelOpen ? <ChevronDown style={{ width: 6, height: 6, color: C.ink3 }} /> : <ChevronUp style={{ width: 6, height: 6, color: C.ink3 }} />}
        </button>
        {panelOpen && (
          <div style={{ position: "absolute", bottom: "calc(100% + 3px)", left: 0, minWidth: 180, border: `1px solid ${C.bdr}`, borderRadius: 5, background: "#f8f4e8", boxShadow: "0 -4px 12px rgba(0,0,0,0.12)", zIndex: 50, overflow: "hidden" }}>
            {SEARCH_ITEMS.map(item => (
              <button key={item.id} type="button" onClick={() => handleSearchAction(book, item.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", border: "none", borderBottom: `1px solid rgba(110,84,40,0.11)`, background: checked[item.id] ? "rgba(80,110,92,0.1)" : "transparent", cursor: "pointer", textAlign: "left" }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: checked[item.id] ? C.cover1 : "rgba(110,84,40,0.3)", flexShrink: 0 }} />
                <span style={{ ...SE, fontSize: 9, color: checked[item.id] ? C.cover2 : C.ink, fontWeight: checked[item.id] ? 700 : 400 }}>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── 코너 터치존 ────────────────────────────────────────────────────────────
  const CornerZone = ({ side, label, onClick }: { side: "left" | "right"; label: string; onClick: () => void }) => (
    <div
      onClick={onClick}
      style={{
        position: "absolute", bottom: 0,
        [side]: 0,
        width: 90, height: 70,
        cursor: "pointer", zIndex: 30,
      }}
      className={`corner-zone corner-${side}`}
    >
      <div className="corner-pill" style={{
        position: "absolute", bottom: 12,
        [side === "left" ? "left" : "right"]: 10,
        whiteSpace: "nowrap",
        background: "rgba(14,32,18,0.82)", color: "rgba(255,255,255,0.95)",
        ...SE, fontSize: 9,
        padding: "4px 10px", borderRadius: 12,
      }}>{label}</div>
    </div>
  );

  // ── 태블릿 오픈북 렌더 ────────────────────────────────────────────────────
  const renderTabletDetail = (book: RecommendedBook) => {
    const key = getBookKey(book);
    const isBookmarked = bookmarkedKeys.has(key);
    const coverUrl = coverUrls[key];
    const bookIdx = data.recommended_books.findIndex(b => getBookKey(b) === key);
    const isLastBook = bookIdx === data.recommended_books.length - 1;

    return (
      <div ref={detailRef} style={{ position: "relative" }}>
        {/* 페이지 넘기기 오버레이 */}
        <style>{`
          @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
          @keyframes turnLeft{0%{transform:rotateY(0deg)}25%{transform:rotateY(-20deg)}65%{transform:rotateY(-80deg)}100%{transform:rotateY(-180deg)}}
          .flip-page{transform-origin:left center;backface-visibility:hidden;animation:turnLeft 0.9s cubic-bezier(0.42,0,0.58,1) forwards;}
          .corner-zone .corner-pill{opacity:0;transform:translateY(4px);transition:opacity 0.2s,transform 0.2s;pointer-events:none;}
          .corner-zone:hover .corner-pill{opacity:1;transform:translateY(0);}
        `}</style>

        {/* 오픈북 */}
        <div style={{
          display: "flex", borderRadius: 2, overflow: "hidden",
          border: "3px solid #1a3a24",
          boxShadow: "0 16px 40px rgba(0,0,0,0.60), 0 4px 10px rgba(0,0,0,0.30)",
          position: "relative",
        }}>
          {/* 상단 책등 */}
          <div style={{ position: "absolute", left: -3, right: -3, top: -13, height: 13, background: "linear-gradient(to bottom,#0f2018,#1a3224 60%,#2e4a38)", border: "3px solid #1a3a24", borderBottom: "none", borderRadius: "4px 4px 0 0", zIndex: 20 }} />
          {/* 하단 */}
          <div style={{ position: "absolute", left: 6, right: 6, bottom: -8, height: 8, background: "linear-gradient(to bottom,#d0c09a,#a89060)", borderRadius: "0 0 3px 3px", zIndex: 20 }} />

          {/* 왼쪽 엣지 */}
          <div style={{ ...edgePattern("left"), position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: -13, bottom: 0, width: 6, background: "#1a3224" }} />
          </div>

          {/* 왼쪽 페이지 */}
          <div style={{ flex: 1, padding: "20px 16px 60px 20px", position: "relative", ...paperStyle(C.page1) }}>
            {/* 헤더 */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <button type="button" onClick={onReset} style={{ ...SE, fontSize: 9, color: C.ink3, background: "none", border: "none", cursor: "pointer", borderBottom: `1px dotted rgba(110,84,40,0.36)`, padding: "0 0 1px" }}>마음서재  ·  Mind Library</button>
                <button type="button" onClick={onReset} style={{ background: "none", border: "none", cursor: "pointer", color: C.ink3, opacity: 0.65, fontSize: 13, padding: 0, lineHeight: 1 }}>↺</button>
              </div>
            </div>
            {/* 책 표지 */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
              <div style={{ position: "relative" }}>
                <Cover3D book={book} coverUrl={coverUrl} w={96} h={124} />
                <button type="button" onClick={() => handleToggleBookmark(book)} style={{ position: "absolute", top: -2, right: 13, width: 13, height: isBookmarked ? 29 : 24, background: isBookmarked ? C.seal : C.ribbon, clipPath: "polygon(0 0,100% 0,100% 100%,50% 84%,0 100%)", border: "none", cursor: "pointer", transition: "background 0.2s,height 0.18s", zIndex: 5 }} />
              </div>
            </div>
            {/* 제목 */}
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <div style={{ ...SE, fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 2 }}>{book.title}</div>
              <div style={{ ...GB, fontSize: 11, color: C.ink3 }}>{book.author} 지음</div>
              <div style={{ ...GB, fontSize: 11, color: C.ink3 }}>{book.publisher} · {book.year}</div>
            </div>
            {/* 태그 */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center", marginBottom: 10 }}>
              {[book.genre, ...(book.tags || [])].filter(Boolean).map((t, i) => (
                <span key={i} style={{ ...SE, fontSize: 10, padding: "2px 7px", border: `1px solid rgba(110,84,40,0.35)`, borderRadius: 9, color: "#6a5030", background: "rgba(255,248,220,0.7)" }}>{t}</span>
              ))}
            </div>
            {/* 추천 이유 */}
            <SH label="추천  이유" />
            <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 4, padding: "8px 10px", background: C.box, marginBottom: 8 }}>
              <p style={{ ...GB, fontSize: 10.5, color: C.ink, lineHeight: 1.85, textAlign: "justify" }}>{book.why_this_book}</p>
            </div>
            {/* 한 문장 */}
            <SH label="이  책의  한  문장" />
            <div style={{ background: "rgba(175,155,110,0.16)", borderLeft: "3px solid rgba(155,130,80,0.5)", borderRadius: "0 4px 4px 0", padding: "8px 10px" }}>
              <p style={{ ...SE, fontSize: 10.5, color: "#3c2e14", lineHeight: 1.7, fontStyle: "italic", minHeight: 20 }}>
                {quoteText || <span style={{ opacity: 0.28 }}>· · ·</span>}
                {quoteText && !quoteDone && <span style={{ display: "inline-block", width: 1.5, height: 11, background: "#3c2e14", marginLeft: 1, verticalAlign: "middle", animation: "blink 0.8s step-end infinite" }} />}
              </p>
              <p style={{ ...SE, fontSize: 10, color: C.ink3, marginTop: 3 }}>— {book.title}, {book.author}</p>
            </div>
            {/* 왼쪽 하단 코너: 목록으로 돌아가기 */}
            <CornerZone side="left" label="← 목록으로 돌아가기" onClick={closePanel} />
          </div>

          {/* 가름끈 */}
          <Spine />

          {/* 오른쪽 페이지 */}
          <div style={{ flex: 1, padding: "20px 20px 60px 16px", position: "relative", ...paperStyle(C.page2) }}>
            <div style={{ ...SE, fontSize: 9, color: C.ink3, letterSpacing: "0.12em", textAlign: "right", marginBottom: 10 }}>서재 기록  No. {String(bookIdx + 1).padStart(4, "0")}</div>
            {/* 치유 포인트 */}
            <SH label="치유  포인트" />
            <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 4, padding: "7px 9px", marginBottom: 6, background: C.box }}>
              {book.healing_point?.split(/[.。]\s*/).filter(Boolean).map((pt, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 5, marginBottom: i < 2 ? 4 : 0 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: ["#7a9d72", "#c09878", "#9898bb"][i % 3], flexShrink: 0, marginTop: 4 }} />
                  <span style={{ ...GB, fontSize: 10.5, color: C.ink, lineHeight: 1.65 }}>{pt.trim()}.</span>
                </div>
              )) || <span style={{ ...GB, fontSize: 10.5, color: C.ink }}>{book.healing_point}</span>}
            </div>
            {/* 읽기 가이드 */}
            <SH label="읽기  가이드" />
            <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 4, padding: "7px 9px", marginBottom: 6, background: "rgba(255,255,255,0.5)" }}>
              {book.reading_guide?.split(/\d+\.\s*/).filter(Boolean).map((g, i) => (
                <div key={i} style={{ display: "flex", gap: 5, marginBottom: i < 2 ? 3 : 0 }}>
                  <span style={{ ...SE, fontSize: 10, color: C.ink3, flexShrink: 0 }}>0{i + 1}.</span>
                  <span style={{ ...GB, fontSize: 10.5, color: C.ink, lineHeight: 1.65 }}>{g.trim()}</span>
                </div>
              )) || <span style={{ ...GB, fontSize: 10.5, color: C.ink }}>{book.reading_guide}</span>}
            </div>
            {/* 도서관 */}
            <SH label="근처  소장  도서관" />
            <LibraryBlock book={book} />
            {/* 추가 검색 (하단 왼쪽) */}
            <div style={{ marginTop: "auto", paddingTop: 6 }}>
              <SearchDropup book={book} />
            </div>
            {/* 오른쪽 하단 코너: 다음 책 보기 */}
            {!isLastBook && (
              <CornerZone side="right" label="다음 책 보기 →" onClick={handleNextBook} />
            )}
          </div>

          {/* 오른쪽 엣지 */}
          <div style={{ ...edgePattern("right"), position: "relative" }}>
            <div style={{ position: "absolute", right: 0, top: -13, bottom: 0, width: 6, background: "#1a3224" }} />
          </div>
        </div>
      </div>
    );
  };

  // ── 모바일 렌더 ───────────────────────────────────────────────────────────
  const renderMobileDetail = (book: RecommendedBook) => {
    const key = getBookKey(book);
    const isBookmarked = bookmarkedKeys.has(key);
    const coverUrl = coverUrls[key];
    const bookIdx = data.recommended_books.findIndex(b => getBookKey(b) === key);
    const joinGrad = "repeating-linear-gradient(90deg,#ede4ce 0,#e2d9c3 2px,#e8dfca 4px,#ddd4be 6px,#e7dec9 8px,#ebe2cc 10px)";

    return (
      <div ref={detailRef} style={{
        borderRadius: 16, overflow: "hidden",
        boxShadow: "0 16px 40px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.35)",
        border: "3px solid #1a3a24",
        maxWidth: 360, margin: "0 auto",
      }}>
        {/* 상단 바 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 15px 9px", background: C.page1, borderBottom: `1px solid rgba(180,160,120,0.2)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ ...SE, fontSize: 10, color: "#222", letterSpacing: "1px" }}>마음서재</span>
            <button type="button" onClick={onReset} style={{ background: "none", border: "none", cursor: "pointer", color: C.ink3, opacity: 0.6, fontSize: 12, padding: 0 }}>↺</button>
          </div>
          <span style={{ ...SE, fontSize: 9, color: "#888", letterSpacing: "1px" }}>No. {String(bookIdx + 1).padStart(4, "0")}</span>
        </div>

        {/* 페이지1 */}
        <div style={{ ...paperStyle(C.page1), padding: "14px 15px 14px" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 11 }}>
            <div style={{ position: "relative" }}>
              <Cover3D book={book} coverUrl={coverUrl} w={70} h={90} />
              <button type="button" onClick={() => handleToggleBookmark(book)} style={{ position: "absolute", top: -1, right: 8, width: 11, height: isBookmarked ? 23 : 19, background: isBookmarked ? C.seal : C.ribbon, clipPath: "polygon(0 0,100% 0,100% 100%,50% 84%,0 100%)", border: "none", cursor: "pointer", zIndex: 5 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...SE, fontSize: 13, color: C.ink, fontWeight: 700, marginBottom: 2 }}>{book.title}</div>
              <div style={{ ...GB, fontSize: 10, color: C.ink3, marginBottom: 5 }}>{book.author} 지음 · {book.publisher} · {book.year}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                {[book.genre, ...(book.tags || [])].filter(Boolean).map((t, i) => (
                  <span key={i} style={{ ...SE, fontSize: 8.5, padding: "1.5px 6px", border: `1px solid rgba(110,84,40,0.33)`, borderRadius: 8, color: "#6a5030", background: "rgba(255,248,220,0.7)" }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
          <SH label="추천  이유" />
          <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 4, padding: "8px 10px", background: C.box, marginBottom: 4 }}>
            <p style={{ ...GB, fontSize: 10, color: C.ink, lineHeight: 1.85 }}>{book.why_this_book}</p>
          </div>
          <SH label="이  책의  한  문장" />
          <div style={{ background: "rgba(175,155,110,0.16)", borderLeft: "3px solid rgba(155,130,80,0.5)", borderRadius: "0 4px 4px 0", padding: "8px 10px" }}>
            <p style={{ ...SE, fontSize: 10, color: "#3c2e14", lineHeight: 1.7, fontStyle: "italic", minHeight: 18 }}>
              {quoteText || <span style={{ opacity: 0.28 }}>· · ·</span>}
              {quoteText && !quoteDone && <span style={{ display: "inline-block", width: 1.5, height: 10, background: "#3c2e14", marginLeft: 1, verticalAlign: "middle", animation: "blink 0.8s step-end infinite" }} />}
            </p>
            <p style={{ ...SE, fontSize: 9, color: C.ink3, marginTop: 3 }}>— {book.title}, {book.author}</p>
          </div>
        </div>

        {/* 페이지 연결선 + 가름끈 */}
        <div style={{ height: 11, position: "relative", background: joinGrad }}>
          <div style={{ position: "absolute", top: -8, bottom: -8, left: "50%", transform: "translateX(-50%)", width: 7, background: `linear-gradient(90deg,${C.greenDark},${C.greenMid} 35%,#c8a050 50%,${C.greenMid} 65%,${C.greenDark})`, zIndex: 3 }} />
          {/* 모바일 네잎클로버 */}
          <div style={{ position: "absolute", bottom: -16, left: "50%", transform: "translateX(-50%)", width: 14, height: 14, zIndex: 4 }}>
            <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 4, height: 4, borderRadius: "50%", background: "radial-gradient(circle,#5aaa60 30%,#2e6a38 100%)", boxShadow: "0 -4.5px 0 1px #3a8848, 0 4.5px 0 1px #3a8848, -4.5px 0 0 1px #3a8848, 4.5px 0 0 1px #3a8848" }} />
            <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 3.5, height: 3.5, borderRadius: "50%", background: "radial-gradient(circle,#7acc80 30%,#3a7a48 100%)", zIndex: 2 }} />
          </div>
        </div>

        {/* 페이지2 */}
        <div style={{ ...paperStyle(C.page2), padding: "20px 15px 14px" }}>
          <SH label="치유  포인트" />
          <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 4, padding: "7px 9px", marginBottom: 5, background: C.box }}>
            {book.healing_point?.split(/[.。]\s*/).filter(Boolean).map((pt, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 5, marginBottom: i < 2 ? 3 : 0 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: ["#7a9d72", "#c09878", "#9898bb"][i % 3], flexShrink: 0, marginTop: 3 }} />
                <span style={{ ...GB, fontSize: 10, color: C.ink, lineHeight: 1.65 }}>{pt.trim()}.</span>
              </div>
            )) || <span style={{ ...GB, fontSize: 10, color: C.ink }}>{book.healing_point}</span>}
          </div>
          <SH label="읽기  가이드" />
          <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 4, padding: "7px 9px", marginBottom: 5, background: "rgba(255,255,255,0.5)" }}>
            {book.reading_guide?.split(/\d+\.\s*/).filter(Boolean).map((g, i) => (
              <div key={i} style={{ display: "flex", gap: 4, marginBottom: i < 2 ? 3 : 0 }}>
                <span style={{ ...SE, fontSize: 9, color: C.ink3, flexShrink: 0 }}>0{i + 1}.</span>
                <span style={{ ...GB, fontSize: 10, color: C.ink, lineHeight: 1.65 }}>{g.trim()}</span>
              </div>
            )) || <span style={{ ...GB, fontSize: 10, color: C.ink }}>{book.reading_guide}</span>}
          </div>
          <SH label="근처  소장  도서관" />
          <LibraryBlock book={book} />
          <SearchDropup book={book} />
        </div>

        {/* 하단 네비 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 15px", background: `rgba(243,236,218,0.97)`, borderTop: `1px solid ${C.bdr}` }}>
          <button type="button" onClick={closePanel} style={{ ...SE, fontSize: 9, color: C.ink2, background: "none", border: "none", cursor: "pointer" }}>← 목록으로</button>
          <div style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(110,84,40,0.28)" }} />
          {bookIdx < data.recommended_books.length - 1
            ? <button type="button" onClick={handleNextBook} style={{ ...SE, fontSize: 9, color: C.ink2, background: "none", border: "none", cursor: "pointer" }}>다음 책 →</button>
            : <span style={{ ...SE, fontSize: 9, color: "rgba(110,84,40,0.3)" }}>마지막 책</span>}
        </div>
      </div>
    );
  };

  // ── 책 목록 카드 ──────────────────────────────────────────────────────────
  const BookCard = ({ book, index }: { book: RecommendedBook; index: number }) => {
    const key = getBookKey(book);
    const isOpen = openBookKey === key;
    const coverUrl = coverUrls[key];
    const isBookmarked = bookmarkedKeys.has(key);
    return (
      <button
        type="button"
        onClick={() => handleCardClick(book)}
        style={{
          background: "#FAFAF5", borderRadius: 14,
          border: isOpen ? `1.5px solid #8A9D82` : `1.5px solid rgba(0,0,0,0.055)`,
          display: "flex", alignItems: "stretch", minHeight: 90,
          cursor: "pointer", transition: "transform 0.18s ease, box-shadow 0.22s ease",
          position: "relative", overflow: "hidden", textAlign: "left", width: "100%",
          boxShadow: isOpen ? "0 0 0 1.5px rgba(138,157,130,0.22),0 4px 16px rgba(138,157,130,0.13)" : "0 1px 4px rgba(0,0,0,0.04)",
          WebkitTapHighlightColor: "transparent",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(90,110,80,0.12)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = isOpen ? "0 0 0 1.5px rgba(138,157,130,0.22),0 4px 16px rgba(138,157,130,0.13)" : "0 1px 4px rgba(0,0,0,0.04)"; }}
      >
        <div style={{ width: 70, flexShrink: 0, borderRadius: "12px 0 0 12px", overflow: "hidden", position: "relative" }}>
          {coverUrl
            ? <img src={coverUrl} alt={book.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ width: "100%", height: "100%", background: `linear-gradient(160deg,${C.cover1},${C.cover2})`, display: "flex", alignItems: "center", justifyContent: "center" }}><BookOpen style={{ width: 20, height: 20, color: "rgba(255,255,255,0.7)" }} /></div>}
        </div>
        <div style={{ flex: 1, padding: "12px 13px 11px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ ...SE, fontSize: 13.5, color: "#3A3630", lineHeight: 1.32, marginBottom: 3 }}>{book.title}</div>
            <div style={{ ...SE, fontSize: 10.5, color: "#9A9488", letterSpacing: "0.03em", marginBottom: 7 }}>{book.author}</div>
          </div>
          <div><span style={{ ...SE, fontSize: 9.5, padding: "2px 7px", borderRadius: 18, background: "rgba(110,84,40,0.1)", color: C.ink2 }}>{book.genre}</span></div>
        </div>
        <div style={{ position: "absolute", top: 10, right: 11, ...SE, fontSize: 9.5, color: "#C0BAB4", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          {isBookmarked && <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.seal, display: "block" }} />}
        </div>
      </button>
    );
  };

  // ── 렌더링 ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes flipOut{0%{transform:perspective(1400px) rotateY(0deg);opacity:1;}40%{transform:perspective(1400px) rotateY(-30deg);box-shadow:-12px 0 28px rgba(0,0,0,0.2);}80%{transform:perspective(1400px) rotateY(-80deg);opacity:0.6;}100%{transform:perspective(1400px) rotateY(-180deg);opacity:0;}}
        .book-detail-panel{transition:opacity 0.3s ease,transform 0.3s ease;}
        .book-detail-panel.is-open{opacity:1;transform:translateY(0);}
        .book-detail-panel.is-closed{opacity:0;transform:translateY(-8px);}
        .corner-zone .corner-pill{opacity:0;transform:translateY(4px);transition:opacity 0.2s,transform 0.2s;pointer-events:none;}
        .corner-zone:hover .corner-pill{opacity:1;transform:translateY(0);}
      `}</style>

      {/* 페이지 넘기기 오버레이 */}
      {isFlipping && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, pointerEvents: "none", display: "flex", justifyContent: "center", alignItems: "center", background: "rgba(40,36,30,0.15)" }}>
          <div style={{
            width: "50vw", maxWidth: 480, height: "70vh", maxHeight: 600,
            background: C.page2,
            backgroundImage: linesBg,
            transformOrigin: "left center",
            animation: "flipOut 0.9s cubic-bezier(0.42,0,0.58,1) forwards",
            boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
            borderRadius: "0 4px 4px 0",
          }} />
        </div>
      )}

      <div className="animate-fade-in" style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px 80px" }}>

        {/* 감정 진단 */}
        <section style={{ background: "rgba(255,255,255,0.7)", border: `1px solid ${C.bdr}`, borderRadius: 16, padding: "18px 20px", marginBottom: 24, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${C.cover1},${C.cover2},${C.cover1})` }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <h2 style={{ ...SE, fontSize: 16, color: C.ink, display: "flex", alignItems: "center", gap: 6 }}>
                <Heart style={{ width: 16, height: 16, color: C.seal }} /> 마음 기록
              </h2>
              <p style={{ ...SE, fontSize: 10, marginTop: 2, color: C.ink3, fontStyle: "italic" }}>Record of the Mind</p>
            </div>
            <div style={{ ...SE, fontSize: 12, padding: "3px 12px", borderRadius: 20, background: "rgba(242,234,216,0.9)", color: C.ink2, fontWeight: 700 }}>강도 {data.emotional_analysis.intensity}/10</div>
          </div>
          <p style={{ ...GB, fontSize: 15, color: C.ink, marginBottom: 10 }}>
            감지된 감정 : <span style={{ marginLeft: 6, color: C.seal, textDecoration: "underline", textUnderlineOffset: 4 }}>{data.emotional_analysis.detected_emotion}</span>
          </p>
          <p style={{ ...GB, fontSize: 13.5, background: C.page1, padding: "12px 14px", borderRadius: 10, color: C.ink, lineHeight: 1.75 }}>"{data.emotional_analysis.empathy_message}"</p>
        </section>

        {/* 추천 도서 목록 */}
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ ...SE, fontSize: 18, textAlign: "center", color: C.ink, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ flex: 1, height: 1, background: C.bdr }} />추천 도서<span style={{ flex: 1, height: 1, background: C.bdr }} />
          </h3>
          <p style={{ ...SE, fontSize: 10, textAlign: "center", color: C.ink3, marginBottom: 14 }}>책을 선택하면 서재 기록이 펼쳐집니다</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.recommended_books.map((book, index) => {
              const key = getBookKey(book);
              const isOpen = openBookKey === key;
              const isClosing = closingKey === key;
              return (
                <React.Fragment key={`book-${key || index}`}>
                  <BookCard book={book} index={index} />
                  {(isOpen || isClosing) && (
                    <div className={`book-detail-panel ${panelUp ? "is-open" : "is-closed"}`} style={{ marginTop: 8 }}>
                      {isTablet ? renderTabletDetail(book) : renderMobileDetail(book)}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </section>

        {/* 마음을 위한 추가 추천 */}
        {curatedBooks.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h3 style={{ ...SE, fontSize: 18, textAlign: "center", color: C.ink, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ flex: 1, height: 1, background: C.bdr }} />마음을 위한 추가 추천<span style={{ flex: 1, height: 1, background: C.bdr }} />
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {curatedBooks.map((book, idx) => (
                <article key={`${book.title}-${idx}`} style={{ background: "rgba(255,255,255,0.7)", border: `1px solid ${C.bdr}`, borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ width: 56, height: 76, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.bdr}`, background: C.page1, flexShrink: 0 }}>
                      <BookCover title={book.title} image={null} className="w-full h-full object-cover" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{ ...GB, fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 3 }}>{book.title}</h4>
                      {book.author && <p style={{ ...GB, fontSize: 12, color: C.ink2, marginBottom: 6 }}>{book.author}</p>}
                      <p style={{ ...GB, fontSize: 12, color: C.ink, lineHeight: 1.7, marginBottom: 6 }}>{book.description}</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        <span style={{ ...SE, fontSize: 10, padding: "2px 7px", background: C.page1, borderRadius: 5, color: C.ink2 }}>{book.type}</span>
                        {book.source && <span style={{ ...SE, fontSize: 10, padding: "2px 7px", background: C.page1, borderRadius: 5, color: C.ink2 }}>{book.source}</span>}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* 추가 제안 */}
        <section style={{ background: C.page1, border: `1px solid ${C.bdr}`, padding: "16px 20px", borderRadius: 12, marginBottom: 24 }}>
          <h3 style={{ ...SE, fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 10 }}>추가 제안 및 활동</h3>
          <ul style={{ listStyleType: "disc", paddingLeft: 18 }}>
            {data.additional_care.activities.map((act, idx) => (
              <li key={idx} style={{ ...GB, fontSize: 13, color: C.ink, lineHeight: 1.7, marginBottom: 5 }}>{act}</li>
            ))}
          </ul>
          {data.additional_care.professional_help && (
            <div style={{ display: "flex", gap: 7, marginTop: 12, background: "rgba(255,230,225,0.6)", border: "1px solid rgba(200,100,80,0.2)", padding: "10px 12px", borderRadius: 8 }}>
              <AlertCircle style={{ width: 15, height: 15, flexShrink: 0, color: "#c05030", marginTop: 1 }} />
              <span style={{ ...GB, fontSize: 12, color: "#a04028" }}>{data.additional_care.professional_help}</span>
            </div>
          )}
        </section>

        <div style={{ paddingTop: 8 }}>
          <button type="button" onClick={onReset} style={{ ...SE, display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "6px 14px", borderRadius: 20, border: `1px solid ${C.ink}`, background: C.ink, color: C.page1, cursor: "pointer" }}>
            새로운 기록 시작하기
          </button>
        </div>
      </div>
    </>
  );
};

export default PrescriptionView;