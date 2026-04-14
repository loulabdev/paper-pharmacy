import React, {
  useEffect, useMemo, useState, useRef, useCallback,
} from "react";
import {
  AlertCircle, Heart, ChevronDown, ChevronUp, BookOpen, Search,
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
import { collectAllEditionIsbnsWithStats } from "../services/editionIsbnService";

// ─── 네이버 책 소개문 fetch ──────────────────────────────────────────────────
async function fetchNaverBookDescription(title: string, author: string): Promise<string> {
  try {
    const query = encodeURIComponent(`${title} ${author}`.trim());
    const res = await fetch(`/api/naver-book?query=${query}&display=5`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return "";
    const data = await res.json();
    // 큰글자·점자·오디오 특수판본 제외하고 첫 번째 정상 결과 사용
    const SKIP_KEYWORDS = ["큰글자", "큰 글자", "점자", "오디오북", "오디오 북", "대활자"];
    const item = (data?.items ?? []).find(
      (i: { title?: string; description?: string }) =>
        !SKIP_KEYWORDS.some(kw => (i.title || "").includes(kw))
    );
    if (!item?.description) return "";
    const clean = item.description.replace(/<[^>]*>/g, "").trim();
    return clean;
  } catch {
    return "";
  }
}

interface Props {
  data: Prescription;
  onReset: () => void;
  onBookmarksChange?: () => void;
}

type RecommendedBook = Prescription["recommended_books"][number];

// ─── 폰트 / 색상 토큰 ────────────────────────────────────────────────────────
const SE: React.CSSProperties = { fontFamily: "'Gowun Batang', 'Noto Serif KR', Georgia, serif", fontStyle: "normal" };
const GB: React.CSSProperties = { fontFamily: "'Gowun Mono', monospace" };

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

const linesBg = `repeating-linear-gradient(0deg,transparent,transparent 27px,rgba(110,84,40,0.05) 27px,rgba(110,84,40,0.05) 28px)`;
const paperStyle = (bg: string): React.CSSProperties => ({
  backgroundColor: bg,
  backgroundImage: linesBg,
});

// ─── 구매처 ────────────────────────────────────────────────────────────────────
const SHOP_INFO = [
  {
    name: "교보문고", short: "교", bg: "#e8f0e8", tc: "#2a6a2a",
    url: (t: string) => `https://search.kyobobook.co.kr/search?keyword=${encodeURIComponent(t)}`,
  },
  {
    name: "알라딘", short: "알", bg: "#e8eef8", tc: "#2a4a8a",
    url: (t: string) => `https://www.aladin.co.kr/search/wsearchresult.aspx?SearchWord=${encodeURIComponent(t)}`,
  },
  {
    name: "인터파크", short: "인", bg: "#fff0e8", tc: "#8a3a10",
    url: (t: string) => `https://book.interpark.com/search/bookSearch.do?query=${encodeURIComponent(t)}`,
  },
];

// ─── 오디오북 플랫폼 ─────────────────────────────────────────────────────────────
const AUDIO_PLATFORMS: Record<string, { name: string; short: string; bg: string; tc: string; url: (t: string) => string }> = {
  "오디오북_밀리": {
    name: "밀리의서재", short: "밀", bg: "#fff3e8", tc: "#c05a00",
    url: (t) => `https://www.millie.co.kr/v3/search?keyword=${encodeURIComponent(t)}`,
  },
  "오디오북_윌라": {
    name: "윌라", short: "윌", bg: "#e8f4ff", tc: "#1a6ab0",
    url: (t) => `https://www.welaaa.com/search/total?keyword=${encodeURIComponent(t)}`,
  },
  "오디오북_네이버": {
    name: "네이버 오디오클립", short: "클", bg: "#e8ffe8", tc: "#1a7a1a",
    url: (t) => `https://audioclip.naver.com/search?q=${encodeURIComponent(t)}`,
  },
};

// ─── 타자기 훅 ────────────────────────────────────────────────────────────────
function useTypewriter() {
  const sessionRef = useRef<number>(0);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    sessionRef.current += 1;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const type = useCallback((
    setText: React.Dispatch<React.SetStateAction<string>>,
    setDone: React.Dispatch<React.SetStateAction<boolean>>,
    text: string,
    speed = 60,
  ) => {
    sessionRef.current += 1;
    const mySession = sessionRef.current;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setText(""); setDone(false);
    const chars = [...text]; let i = 0;
    const next = () => {
      if (sessionRef.current !== mySession) return;
      if (i < chars.length) {
        const ch = chars[i++];
        setText(prev => prev + ch);
        timerRef.current = setTimeout(next, speed + Math.floor(Math.random() * 18));
      } else {
        setDone(true);
      }
    };
    timerRef.current = setTimeout(next, speed);
  }, [cancel]);

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

// ─── 가름끈 ────────────────────────────────────────────────────────────────────
const Spine = ({ height = "100%" }: { height?: string | number }) => (
  <div className="book-spine-hide" style={{ width: "clamp(16px,2.2vw,24px)", flexShrink: 0, position: "relative", zIndex: 10, backgroundColor: C.page1, height }}>
    <div style={{
      position: "absolute", top: 0, bottom: 28, left: "50%", transform: "translateX(-50%)",
      width: 8,
      background: `linear-gradient(90deg, ${C.greenDark} 0%, #2e6040 20%, ${C.greenMid} 45%, #4a9060 50%, ${C.greenMid} 55%, #2e6040 80%, ${C.greenDark} 100%)`,
      zIndex: 11,
    }} />
    <div style={{ position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)", width: 20, height: 20, zIndex: 13 }}>
      <div style={{
        position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
        width: 6, height: 6, borderRadius: "50%",
        background: "radial-gradient(circle, #5aaa60 30%, #2e6a38 100%)",
        boxShadow: "0 -6px 0 1.5px #3a8848, 0 6px 0 1.5px #3a8848, -6px 0 0 1.5px #3a8848, 6px 0 0 1.5px #3a8848",
      }} />
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

// ─── 지브리풍 Canvas 일러스트 ────────────────────────────────────────────────
const GHIBLI_SCENES = [
  { spine: "#1a4028", bg1: "#2a5e3a", bg2: "#1a3a22", scene: "forest" },
  { spine: "#0a0820", bg1: "#1a1040", bg2: "#0a0820", scene: "night" },
  { spine: "#0e3060", bg1: "#1a5080", bg2: "#0e3060", scene: "sea" },
  { spine: "#1a4428", bg1: "#2a6e40", bg2: "#1a4428", scene: "field" },
];

const drawGhibli = (canvas: HTMLCanvasElement, scene: string, bg1: string, bg2: string) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, bg1); g.addColorStop(1, bg2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (scene === "forest") {
    ctx.fillStyle = "rgba(40,110,50,.85)"; ctx.beginPath(); ctx.arc(w * .5, h * .42, w * .32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(35,100,42,.8)"; ctx.beginPath(); ctx.arc(w * .3, h * .5, w * .22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(45,115,52,.8)"; ctx.beginPath(); ctx.arc(w * .7, h * .48, w * .25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(100,60,15,.7)"; ctx.fillRect(w * .44, h * .6, w * .12, h * .26);
  } else if (scene === "night") {
    ctx.fillStyle = "rgba(255,240,180,.9)";
    [[.2, .1], [.55, .06], [.82, .15], [.12, .27], [.72, .07]].forEach(([x, y]) => {
      ctx.beginPath(); ctx.arc(w * x, h * y, 1.5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = "rgba(255,235,140,.9)"; ctx.beginPath(); ctx.arc(w * .7, h * .2, w * .16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = bg1; ctx.beginPath(); ctx.arc(w * .74, h * .17, w * .13, 0, Math.PI * 2); ctx.fill();
  } else if (scene === "sea") {
    ctx.fillStyle = "rgba(255,215,70,.88)"; ctx.beginPath(); ctx.arc(w * .82, h * .15, w * .12, 0, Math.PI * 2); ctx.fill();
    const wg = ctx.createLinearGradient(0, h * .6, 0, h);
    wg.addColorStop(0, "rgba(30,110,160,.75)"); wg.addColorStop(1, "rgba(15,70,120,.85)");
    ctx.fillStyle = wg; ctx.beginPath(); ctx.moveTo(0, h * .62);
    for (let i = 0; i <= w; i += w / 6) ctx.quadraticCurveTo(i + w / 12, h * .56, i + w / 6, h * .62);
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
  } else {
    ctx.fillStyle = "rgba(255,215,70,.9)"; ctx.beginPath(); ctx.arc(w * .78, h * .15, w * .13, 0, Math.PI * 2); ctx.fill();
    const fg = ctx.createLinearGradient(0, h * .6, 0, h);
    fg.addColorStop(0, "rgba(40,110,50,.85)"); fg.addColorStop(1, "rgba(25,75,35,.9)");
    ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(0, h * .65); ctx.quadraticCurveTo(w * .5, h * .55, w, h * .65);
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
  }
};

// ─── 추가 검색 항목 ───────────────────────────────────────────────────────────
const SEARCH_ITEMS = [
  { id: "library_all", label: "소장 도서관 조회" },
  { id: "latest", label: "최신판 + 전체판본 검색" },
  { id: "book_search", label: "도서 검색 (구글)" },
  { id: "similar", label: "감정 유사 도서 추천" },
  { id: "author", label: "동일 저자 더 보기" },
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
  const [buyPanel, setBuyPanel]             = useState<string | null>(null);
  const [bookDescriptions, setBookDescriptions] = useState<Record<string, string>>({});
  const [userRegionName, setUserRegionName] = useState<string | null>(null); // 사용자 행정구역명 (예: "대전")
  const [showAllRegions, setShowAllRegions] = useState<Record<string, boolean>>({}); // 책별 전체보기 토글
  const [descExpanded, setDescExpanded]     = useState<Record<string, boolean>>({});

  const [openBookKey, setOpenBookKey]   = useState<string | null>(null);
  const [closingKey, setClosingKey]     = useState<string | null>(null);
  const [panelUp, setPanelUp]           = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const [quoteText, setQuoteText] = useState("");
  const [quoteDone, setQuoteDone] = useState(false);
  const { type: typeText, cancel: cancelType } = useTypewriter();

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

  const closePanel = useCallback(() => {
    cancelType(); setPanelUp(false);
    setTimeout(() => { setQuoteText(""); setQuoteDone(false); }, 280);
  }, [cancelType]);

  const handleCardClick = useCallback((book: RecommendedBook) => {
    const key = getBookKey(book);
    if (openBookKey === key) {
      closePanel(); setClosingKey(key);
      setTimeout(() => { setOpenBookKey(null); setClosingKey(null); }, 400);
      return;
    }
    if (openBookKey) { setClosingKey(openBookKey); closePanel(); setTimeout(() => setClosingKey(null), 350); }
    setOpenBookKey(key); setPanelUp(true);
    setQuoteText(""); setQuoteDone(false);
    // 치유포인트 타이핑 효과
    const healingText = (book.healing_point || "").trim();
    if (healingText) typeText(setQuoteText, setQuoteDone, healingText, 32);
    else setQuoteDone(true);
    // 네이버 소개문 fetch (캐시 없으면)
    if (!bookDescriptions[key]) {
      fetchNaverBookDescription(book.title, book.author).then(desc => {
        const text = (desc && desc.trim()) ? desc.trim() : (book.why_this_book || "").trim();
        if (text) setBookDescriptions(p => ({ ...p, [key]: text }));
      });
    }
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }, [openBookKey, closePanel, typeText, bookDescriptions]);

  const handleNextBook = useCallback(() => {
    if (!openBookKey) return;
    const books = data.recommended_books;
    const idx = books.findIndex(b => getBookKey(b) === openBookKey);
    if (idx < books.length - 1) {
      const nextBook = books[idx + 1];
      closePanel();
      setTimeout(() => {
        setOpenBookKey(getBookKey(nextBook)); setPanelUp(true);
        setQuoteText(""); setQuoteDone(false);
        const healingText = (nextBook.healing_point || "").trim();
        if (healingText) typeText(setQuoteText, setQuoteDone, healingText, 32);
        else setQuoteDone(true);
        const nextKey = getBookKey(nextBook);
        if (!bookDescriptions[nextKey]) {
          fetchNaverBookDescription(nextBook.title, nextBook.author).then(desc => {
            const text = (desc && desc.trim()) ? desc.trim() : (nextBook.why_this_book || "").trim();
            if (text) setBookDescriptions(p => ({ ...p, [nextKey]: text }));
          });
        }
      }, 300);
    }
  }, [openBookKey, data.recommended_books, closePanel, typeText]);

  const handleToggleBookmark = (book: RecommendedBook) => {
    setBookmarks(toggleBookBookmark(book)); onBookmarksChange?.();
  };

  const searchLibraries = async (book: RecommendedBook, rk: string) => {
    setLoadingBooks(p => ({ ...p, [rk]: true })); setLibraryErrors(p => ({ ...p, [rk]: null }));
    try {
      let result: LibraryAvailability[] = [];
      try {
        const loc = await getCurrentLocation();
        result = await findNearbyLibrariesByBook(book, loc);
        // 사용자 행정구역명 추출 (가장 가까운 도서관 주소 기반)
        if (result.length > 0 && !userRegionName) {
          const addr = result[0].address || "";
          const regionMatch = addr.match(/^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/);
          if (regionMatch) setUserRegionName(regionMatch[1]);
        }
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

      // ── 특수판본 제목 키워드 (큰글자·점자·오디오 등) — 도서관 조회에서 제외
      const SPECIAL_EDITION_KEYWORDS = ["큰글자", "큰 글자", "점자", "오디오북", "오디오 북", "대활자"];
      const isSpecialEdition = (title?: string) => {
        if (!title) return false;
        return SPECIAL_EDITION_KEYWORDS.some(kw => title.includes(kw));
      };

      // allEditions 기준으로 특수판본 ISBN 필터링
      const filteredIsbns = isbns.filter(isbn => {
        const ed = lr.allEditions.find(e => e.isbn13 === isbn);
        return !ed || !isSpecialEdition(ed.title);
      });

      const isbnSet = new Set(filteredIsbns);
      // 원본 ISBN은 특수판본이 아닌 경우에만 추가
      if (book.isbn && !isSpecialEdition(book.title)) isbnSet.add(book.isbn.replace(/[^0-9Xx]/g, ""));
      // 최신판·allEditions도 특수판본 제외
      if (lr.latest?.isbn13 && !isSpecialEdition(lr.latest.title)) isbnSet.add(lr.latest.isbn13);
      for (const ed of lr.allEditions) {
        if (ed.isbn13 && !isSpecialEdition(ed.title)) isbnSet.add(ed.isbn13);
      }
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
    setSearchPanelOpen(p => ({ ...p, [key]: false }));
    if (itemId === "library_all") await handleFindLibraries(book);
    else if (itemId === "latest") await handleFindLatestEdition(book);
    else if (itemId === "book_search") window.open(`https://www.google.com/search?q=${encodeURIComponent(`${book.title} ${book.author} 도서`)}`, "_blank");
    else if (itemId === "similar") window.open(`https://www.google.com/search?q=${encodeURIComponent(`${book.genre} 감성 책 추천`)}`, "_blank");
    else if (itemId === "author") window.open(`https://search.kyobobook.co.kr/search?keyword=${encodeURIComponent(book.author)}`, "_blank");
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

  // ── 오디오북 뱃지 / 토글 ────────────────────────────────────────────────────
  const AudiobookBadges = ({ book }: { book: RecommendedBook }) => {
    const key = getBookKey(book);
    const [open, setOpen] = React.useState(false);
    const audioPlatforms = (book.tags || [])
      .filter((t) => t in AUDIO_PLATFORMS)
      .map((t) => AUDIO_PLATFORMS[t]);
    if (audioPlatforms.length === 0) return null;

    // 1개면 바로 링크
    if (audioPlatforms.length === 1) {
      const p = audioPlatforms[0];
      return (
        <a href={p.url(book.title)} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 16, border: `1px solid rgba(110,84,40,0.28)`, background: "none", textDecoration: "none" }}>
          <span style={{ fontSize: 10 }}>🎧</span>
          <span style={{ ...GB, fontSize: 9, color: C.ink2 }}>{p.name}</span>
        </a>
      );
    }

    // 2개 이상이면 토글
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        <button type="button" onClick={() => setOpen(o => !o)}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 16, border: `1px solid rgba(110,84,40,0.28)`, background: open ? C.page1 : "none", cursor: "pointer" }}>
          <span style={{ fontSize: 10 }}>🎧</span>
          <span style={{ ...GB, fontSize: 9, color: C.ink2 }}>오디오북 {audioPlatforms.length}</span>
          <span style={{ ...GB, fontSize: 8, color: C.ink3 }}>{open ? "▲" : "▼"}</span>
        </button>
        {open && (
          <div style={{ position: "absolute", bottom: "calc(100% + 4px)", left: 0, zIndex: 30, background: "#f8f5ee", border: `1px solid rgba(110,84,40,0.22)`, borderRadius: 8, overflow: "hidden", minWidth: 130, boxShadow: "0 4px 12px rgba(0,0,0,0.12)" }}>
            {audioPlatforms.map((p) => (
              <a key={p.name} href={p.url(book.title)} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 11px", borderBottom: `1px solid rgba(180,160,120,0.16)`, textDecoration: "none" }}
                onClick={() => setOpen(false)}>
                <div style={{ width: 18, height: 18, borderRadius: 4, background: p.bg, color: p.tc, display: "flex", alignItems: "center", justifyContent: "center", ...SE, fontSize: 8, fontWeight: 700, flexShrink: 0 }}>{p.short}</div>
                <span style={{ ...GB, fontSize: 9, color: C.ink }}>{p.name}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── 구매 팝업 ──────────────────────────────────────────────────────────────
  const BuyPopup = ({ book }: { book: RecommendedBook }) => {
    const key = getBookKey(book);
    if (buyPanel !== key) return null;
    return (
      <div style={{ border: "1px solid rgba(46,74,56,0.18)", borderRadius: 8, overflow: "hidden", background: "#f8f5ee", marginTop: 6 }}>
        {SHOP_INFO.map(s => (
          <a key={s.name} href={s.url(book.title)} target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderBottom: "1px solid rgba(180,160,120,0.16)", textDecoration: "none" }}>
            <div style={{ width: 20, height: 20, borderRadius: 4, background: s.bg, color: s.tc, display: "flex", alignItems: "center", justifyContent: "center", ...SE, fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{s.short}</div>
            <div>
              <div style={{ ...SE, fontSize: 10, color: C.ink }}>{s.name}</div>
              <div style={{ ...GB, fontSize: 8, color: C.ink3 }}>{s.name}에서 검색하기</div>
            </div>
            <span style={{ marginLeft: "auto", color: C.ink3, fontSize: 11 }}>→</span>
          </a>
        ))}
      </div>
    );
  };

  // ── 도서관 블록 ────────────────────────────────────────────────────────────
  const LibraryBlock = ({ book }: { book: RecommendedBook }) => {
    const key = getBookKey(book);
    const allLibraries = libraryResults[key] || [];
    const libraryError = libraryErrors[key];
    const isLoading = !!loadingBooks[key];
    const hasSearched = !!searchedBooks[key];
    const isLibExp = !!expandedLibraries[key];
    const latestResult = latestResults[key];
    const meta = librarySearchMeta[key];

    // 검색 유형 판단: 최신판 검색이면 전국, 아니면 지역 내
    const isLatestSearch = !!latestResults[key];
    const showAll = !!showAllRegions[key];

    // 지역 필터 (주소에 userRegionName 포함 여부)
    const inRegion = (lib: LibraryAvailability) => {
      if (!userRegionName) return true; // 위치 미확인 시 전체 표시
      return (lib.address || "").includes(userRegionName);
    };

    // 필터 적용
    const filtered = (isLatestSearch || showAll)
      ? allLibraries  // 최신판 검색 or 전체보기: 전국
      : allLibraries.filter(inRegion); // 기본: 지역 내

    // 거리순 정렬 후 최신판 검색 시 상위 10개 제한
    const sorted = [...filtered].sort((a, b) => {
      if (typeof a.distanceKm === "number" && typeof b.distanceKm === "number") return a.distanceKm - b.distanceKm;
      if (typeof a.distanceKm === "number") return -1;
      if (typeof b.distanceKm === "number") return 1;
      return 0;
    });
    const libraries = isLatestSearch ? sorted.slice(0, 10) : sorted;
    const loanableCount = libraries.filter(l => l.loanAvailable === true).length;

    return (
      <>
        {hasSearched && !isLoading && (
        <div style={{ fontSize: 9, color: "#888", padding: "2px 4px" }}>
         전체:{allLibraries.length} / 필터:{filtered.length} / 지역:{userRegionName || "미확인"}
        </div>
        )}
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
              : <p style={{ ...SE, fontSize: 10, color: C.ink3 }}>{userRegionName ? `${userRegionName} 지역 내 소장 도서관이 없습니다` : "소장 도서관이 없습니다"}</p>}
          </div>
        )}
        {allLibraries.length > 0 && (
          <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 4, overflow: "hidden", marginBottom: 5, background: C.box }}>
            <button type="button" onClick={() => toggleLibraryExpand(key)}
              style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: "none", border: "none", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ ...SE, fontSize: 10, color: C.ink, fontWeight: 700 }}>소장 도서관</span>
                <span style={{ ...SE, fontSize: 10, padding: "1px 5px", borderRadius: 8, background: "rgba(110,84,40,0.12)", color: C.ink2 }}>{libraries.length}곳</span>
                {loanableCount > 0 && <span style={{ ...SE, fontSize: 10, padding: "1px 5px", borderRadius: 8, background: "rgba(80,140,80,0.13)", color: "#2a6a2a" }}>대출가능 {loanableCount}</span>}
              </div>
              {isLibExp ? <ChevronUp style={{ width: 12, height: 12, color: C.ink3 }} /> : <ChevronDown style={{ width: 12, height: 12, color: C.ink3 }} />}
            </button>
            {isLibExp && (
              <>
                {/* 지역 필터 토글 */}
                <div style={{ padding: "5px 8px 4px", borderTop: `1px dotted rgba(110,84,40,0.18)`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ ...SE, fontSize: 9, color: C.ink3 }}>
                    {isLatestSearch
                      ? `거리순 상위 10곳 (전국)`
                      : userRegionName ? `${userRegionName} 지역 내` : "전체"}
                  </span>
                  {!isLatestSearch && userRegionName && (
                    <button type="button"
                      onClick={() => setShowAllRegions(p => ({ ...p, [key]: !showAll }))}
                      style={{ ...SE, fontSize: 9, color: showAll ? C.cover1 : C.ink3, background: "none", border: `1px solid ${showAll ? C.cover1 : C.bdr}`, borderRadius: 8, padding: "1px 8px", cursor: "pointer" }}>
                      {showAll ? "지역 내만" : "전국 보기"}
                    </button>
                  )}
                </div>
                {/* 목록 스크롤 */}
                <ul style={{ padding: "0 8px 7px", maxHeight: 160, overflowY: "auto" }}>
                  {libraries.map((lib, idx) => (
                    <li key={`${lib.libCode || lib.libraryName}-${idx}`} style={{ borderBottom: idx < libraries.length - 1 ? `1px dotted rgba(110,84,40,0.18)` : "none", padding: "4px 0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div style={{ width: 5, height: 5, borderRadius: "50%", background: lib.loanAvailable ? "#5a9a5a" : lib.hasBook ? "#c87a3a" : "#aaa", flexShrink: 0 }} />
                          <a href={lib.homepage || `https://www.google.com/search?q=${encodeURIComponent(lib.libraryName)}`} target="_blank" rel="noopener noreferrer"
                            style={{ ...GB, fontSize: 10, color: C.cover2, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2 }}>
                            {lib.libraryName}
                          </a>
                          {typeof lib.distanceKm === "number" && (
                            <span style={{ ...SE, fontSize: 8.5, color: C.ink3 }}>{lib.distanceKm.toFixed(1)}km</span>
                          )}
                        </div>
                        <span style={{ ...SE, fontSize: 10, padding: "1px 5px", borderRadius: 8, whiteSpace: "nowrap", background: lib.hasBook ? (lib.loanAvailable ? "rgba(80,140,80,0.13)" : "rgba(110,84,40,0.1)") : "rgba(0,0,0,0.06)", color: lib.hasBook ? (lib.loanAvailable ? "#2a6a2a" : C.ink2) : "#888" }}>
                          {lib.hasBook ? (lib.loanAvailable ? "대출 가능" : "소장") : "미소장"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {latestResult?.found && latestResult?.latest && (() => {
          const latest = latestResult.latest;
          const samePublisher = latest.publisher?.replace(/\s/g, "") === book.publisher?.replace(/\s/g, "");
          const latestYear = latest.pubdate ? Number(String(latest.pubdate).slice(0, 4)) : 0;
          const bookYear = book.year ? Number(String(book.year).replace(/\D/g, "").slice(0, 4)) : 0;
          const notOlder = latestYear >= bookYear;
          if (!samePublisher || !notOlder) return null;
          return (
            <div style={{ border: `1px solid rgba(80,120,200,0.25)`, borderRadius: 4, padding: "7px 9px", marginBottom: 5, background: "rgba(220,235,255,0.35)" }}>
              {latestResult.isNewer
                ? <><p style={{ ...SE, fontSize: 10, color: "#2050a0", marginBottom: 3 }}>최신판 발견!</p><p style={{ ...SE, fontSize: 10, color: C.ink, fontWeight: 700 }}>{latest.title}</p><p style={{ ...SE, fontSize: 10, color: C.ink3 }}>{formatPubdate(latest.pubdate)} · {latest.publisher}</p></>
                : <p style={{ ...SE, fontSize: 10, color: "#2050a0" }}>이미 최신판입니다</p>}
            </div>
          );
        })()}
      </>
    );
  };

  // ── 추가 검색 드롭업 ──────────────────────────────────────────────────────
  const SearchDropup = ({ book }: { book: RecommendedBook }) => {
    const key = getBookKey(book);
    const panelOpen = !!searchPanelOpen[key];
    const checked = searchChecked[key] || {};
    return (
      <div style={{ position: "relative", zIndex: panelOpen ? 200 : 1 }}>
        <button
          type="button"
          onClick={() => setSearchPanelOpen(p => ({ ...p, [key]: !p[key] }))}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", border: `1px solid rgba(110,84,40,0.28)`, borderRadius: 16, background: panelOpen ? "rgba(110,84,40,0.06)" : "none", cursor: "pointer" }}
        >
          <Search style={{ width: 9, height: 9, color: C.ink3 }} />
          <span style={{ ...GB, fontSize: 9, color: C.ink2 }}>추가 검색</span>
          {panelOpen
            ? <ChevronUp style={{ width: 9, height: 9, color: C.ink3 }} />
            : <ChevronDown style={{ width: 9, height: 9, color: C.ink3 }} />}
        </button>
        {panelOpen && (
          <div style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            minWidth: 170,
            border: `1px solid ${C.bdr}`,
            borderRadius: 8,
            background: "#f8f4e8",
            boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
            zIndex: 200,
            overflow: "hidden",
          }}>
            {SEARCH_ITEMS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSearchAction(book, item.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 7, padding: "9px 12px", border: "none", borderBottom: `1px solid rgba(110,84,40,0.09)`, background: checked[item.id] ? "rgba(80,110,92,0.08)" : "transparent", cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: checked[item.id] ? C.cover1 : "rgba(110,84,40,0.25)", flexShrink: 0 }} />
                <span style={{ ...GB, fontSize: 10, color: checked[item.id] ? C.cover2 : C.ink }}>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── 코너 터치존 ────────────────────────────────────────────────────────────
  const CornerZone = ({ side, label, onClick }: { side: "left" | "right"; label: string; onClick: () => void }) => (
    <div onClick={onClick} style={{ position: "absolute", bottom: 0, [side]: 0, width: 90, height: 70, cursor: "pointer", zIndex: 30 }} className={`corner-zone corner-${side}`}>
      <div className="corner-pill" style={{ position: "absolute", bottom: 12, [side === "left" ? "left" : "right"]: 10, whiteSpace: "nowrap", background: "rgba(14,32,18,0.82)", color: "rgba(255,255,255,0.95)", ...SE, fontSize: 9, padding: "4px 10px", borderRadius: 12 }}>{label}</div>
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
        <style dangerouslySetInnerHTML={{ __html: `@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}.corner-zone .corner-pill{opacity:0;transform:translateY(4px);transition:opacity 0.2s,transform 0.2s;pointer-events:none;}.corner-zone:hover .corner-pill{opacity:1;transform:translateY(0);}` }} />
        <div style={{ display: "flex", borderRadius: 2, overflow: "hidden", border: "3px solid #1a3a24", boxShadow: "0 16px 40px rgba(0,0,0,0.60),0 4px 10px rgba(0,0,0,0.30)", position: "relative" }}>
          <div style={{ position: "absolute", left: -3, right: -3, top: -13, height: 13, background: "linear-gradient(to bottom,#0f2018,#1a3224 60%,#2e4a38)", border: "3px solid #1a3a24", borderBottom: "none", borderRadius: "4px 4px 0 0", zIndex: 20 }} />
          <div style={{ position: "absolute", left: 6, right: 6, bottom: -8, height: 8, background: "linear-gradient(to bottom,#d0c09a,#a89060)", borderRadius: "0 0 3px 3px", zIndex: 20 }} />
          <div style={{ ...edgePattern("left"), position: "relative" }}><div style={{ position: "absolute", left: 0, top: -13, bottom: 0, width: 6, background: "#1a3224" }} /></div>

          {/* 왼쪽 페이지 */}
          <div style={{ flex: 1, padding: "20px 16px 60px 20px", position: "relative", ...paperStyle(C.page1) }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
<<<<<<< HEAD
                <button type="button" onClick={onReset} style={{ ...SE, fontSize: 9, color: C.ink3, background: "none", border: "none", cursor: "pointer", borderBottom: `1px dotted rgba(110,84,40,0.36)`, padding: "0 0 1px" }}>마음서가  ·  Mind Shelf</button>
=======
                <button type="button" onClick={onReset} style={{ ...SE, fontSize: 9, color: C.ink3, background: "none", border: "none", cursor: "pointer", borderBottom: `1px dotted rgba(110,84,40,0.36)`, padding: "0 0 1px" }}>종이약국  ·  Paper-Pharmacy</button>
>>>>>>> parent of 082902b (fix: PrescriptionView 파일 수정)
                <button type="button" onClick={onReset} style={{ background: "none", border: "none", cursor: "pointer", color: C.ink3, opacity: 0.65, fontSize: 13, padding: 0, lineHeight: 1 }}>↺</button>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
              <div style={{ position: "relative", width: 88, height: 116, flexShrink: 0 }}>
                <div style={{ width: 88, height: 116, borderRadius: "2px 5px 5px 2px", overflow: "hidden", position: "relative", boxShadow: "2px 4px 12px rgba(0,0,0,0.24)" }}>
                  {coverUrl
                    ? <img src={coverUrl} alt={book.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <canvas ref={el => { if (el) { const s = GHIBLI_SCENES[bookIdx % GHIBLI_SCENES.length]; drawGhibli(el, s.scene, s.bg1, s.bg2); } }} width={88} height={116} style={{ width: "100%", height: "100%", display: "block" }} />}
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,transparent 35%,rgba(0,0,0,0.55))" }} />
                </div>
                <button type="button" onClick={() => handleToggleBookmark(book)} style={{ position: "absolute", top: -2, right: 10, width: 13, height: isBookmarked ? 29 : 24, background: isBookmarked ? C.seal : C.ribbon, clipPath: "polygon(0 0,100% 0,100% 100%,50% 84%,0 100%)", border: "none", cursor: "pointer", zIndex: 5 }} />
              </div>
            </div>
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <div style={{ ...SE, fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 2 }}>{book.title}</div>
              <div style={{ ...GB, fontSize: 11, color: C.ink3 }}>{book.author} 지음</div>
              <div style={{ ...GB, fontSize: 11, color: C.ink3 }}>{book.publisher} · {book.year}</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center", marginBottom: 10 }}>
              {[book.genre, ...(book.tags || [])].filter(Boolean).slice(0, 3).map((t, i) => (
                <span key={i} style={{ ...SE, fontSize: 10, padding: "2px 7px", border: `1px solid rgba(110,84,40,0.35)`, borderRadius: 9, color: "#6a5030", background: "rgba(255,248,220,0.7)" }}>{t}</span>
              ))}
            </div>
<<<<<<< HEAD
            <SH label="책  소개" />
            <div style={{ background: "rgba(175,155,110,0.16)", borderRadius: 4, padding: "8px 10px", marginBottom: 8 }}>
              {(() => {
                const naverDesc = bookDescriptions[key] || "";
                const desc = naverDesc || book.why_this_book || "";
                if (!desc) return <p style={{ ...SE, fontSize: 10, color: C.ink3, opacity: 0.5 }}>· · ·</p>;
                const isLong = desc.length > 100;
                const isExp = !!descExpanded[key];
                return (
                  <>
                    <div style={{ maxHeight: isLong && !isExp ? 68 : (isExp ? 160 : "none"), overflowY: isExp ? "auto" : "hidden", transition: "max-height 0.3s ease" }}>
                      <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 11, color: "#3c2e14", lineHeight: 1.85, wordBreak: "keep-all", letterSpacing: "normal", fontStyle: "normal" }}>{desc}</p>
                    </div>
                    {isLong && (
                      <button type="button" onClick={() => setDescExpanded(p => ({ ...p, [key]: !p[key] }))}
                        style={{ ...SE, fontSize: 9, color: C.ink2, background: "none", border: "none", cursor: "pointer", marginTop: 4, padding: 0, opacity: 0.75 }}>
                        {isExp ? "접기 ▲" : "더보기 ▼"}
                      </button>
                    )}
                    <p style={{ ...SE, fontSize: 9, color: C.ink3, marginTop: 3 }}>— 책 소개 · {book.title}</p>
                  </>
                );
              })()}
=======
            {/* 처방 이유 */}
            <SH label="처방  이유" />
            <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 4, padding: "8px 10px", background: C.box, marginBottom: 8 }}>
              <p style={{ ...GB, fontSize: 10.5, color: C.ink, lineHeight: 1.85, textAlign: "justify" }}>{book.why_this_book}</p>
>>>>>>> parent of 082902b (fix: PrescriptionView 파일 수정)
            </div>
            {/* 책소개와 추천이유가 다를 때만 추천이유 표시 */}
            {(bookDescriptions[key] || "") !== book.why_this_book && (
              <>
                <SH label="추천  이유" />
                <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 4, padding: "8px 10px", background: C.box }}>
                  <p style={{ ...GB, fontSize: 10.5, color: C.ink, lineHeight: 1.85, textAlign: "justify" }}>{book.why_this_book}</p>
                </div>
              </>
            )}
            <CornerZone side="left" label="← 목록으로 돌아가기" onClick={closePanel} />
          </div>

          <Spine />

          {/* 오른쪽 페이지 */}
          <div style={{ flex: 1, padding: "20px 20px 60px 16px", position: "relative", ...paperStyle(C.page2) }}>
<<<<<<< HEAD
            <div style={{ ...SE, fontSize: 9, color: C.ink3, letterSpacing: "0.12em", textAlign: "right", marginBottom: 10 }}>서가 기록  No. {String(bookIdx + 1).padStart(4, "0")}</div>
=======
            <div style={{ ...SE, fontSize: 9, color: C.ink3, letterSpacing: "0.12em", textAlign: "right", marginBottom: 10 }}>처방전  No. {String(bookIdx + 1).padStart(4, "0")}</div>
            {/* 치유 포인트 */}
>>>>>>> parent of 082902b (fix: PrescriptionView 파일 수정)
            <SH label="치유  포인트" />
            <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 4, padding: "7px 9px", marginBottom: 6, background: C.box }}>
              <p style={{ ...GB, fontSize: 10.5, color: C.ink, lineHeight: 1.75, minHeight: 20 }}>
                {quoteText || <span style={{ opacity: 0.28 }}>· · ·</span>}
                {quoteText && !quoteDone && <span style={{ display: "inline-block", width: 1.5, height: 11, background: C.ink, marginLeft: 1, verticalAlign: "middle", animation: "blink 0.8s step-end infinite" }} />}
              </p>
            </div>
            <SH label="읽기  가이드" />
            <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 4, padding: "7px 9px", marginBottom: 6, background: "rgba(255,255,255,0.5)" }}>
              {book.reading_guide?.split(/\d+\.\s*/).filter(Boolean).map((g, i) => (
                <div key={i} style={{ display: "flex", gap: 5, marginBottom: i < 2 ? 3 : 0 }}>
                  <span style={{ ...SE, fontSize: 10, color: C.ink3, flexShrink: 0 }}>0{i + 1}.</span>
                  <span style={{ ...GB, fontSize: 10.5, color: C.ink, lineHeight: 1.65 }}>{g.trim()}</span>
                </div>
              )) || <span style={{ ...GB, fontSize: 10.5, color: C.ink }}>{book.reading_guide}</span>}
            {book.music_keyword && (
              <div key="music" style={{ display: "flex", gap: 5, marginTop: 4, paddingTop: 4, borderTop: `1px dotted rgba(110,84,40,0.18)` }}>
                <span style={{ ...SE, fontSize: 10, color: C.ink3, flexShrink: 0 }}>🎵</span>
                <span style={{ ...GB, fontSize: 10.5, color: C.ink, lineHeight: 1.65 }}>
                  더 깊은 몰입감을 위한 음악 —{" "}
                  <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(book.music_keyword)}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ color: C.cover2, textDecoration: "underline", textUnderlineOffset: 2 }}>
                    {book.music_keyword}
                  </a>
                </span>
              </div>
            )}
            </div>
            <SH label="근처  소장  도서관" />
            <LibraryBlock book={book} />
            <div style={{ marginTop: "auto", paddingTop: 6, display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", position: "relative", zIndex: 10 }}>
                <button type="button" onClick={() => setBuyPanel(buyPanel === key ? null : key)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 16, border: `1px solid rgba(110,84,40,0.28)`, background: "none", cursor: "pointer", ...GB, fontSize: 9, color: C.ink2 }}>
                  구매하기
                </button>
                <SearchDropup book={book} />
                <AudiobookBadges book={book} />
              </div>
              <BuyPopup book={book} />
            </div>
            {!isLastBook && <CornerZone side="right" label="다음 책 보기 →" onClick={handleNextBook} />}
          </div>

          <div style={{ ...edgePattern("right"), position: "relative" }}><div style={{ position: "absolute", right: 0, top: -13, bottom: 0, width: 6, background: "#1a3224" }} /></div>
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
      <div ref={detailRef} style={{ borderRadius: 16, overflow: "visible", boxShadow: "0 16px 40px rgba(0,0,0,0.55),0 4px 12px rgba(0,0,0,0.35)", border: "3px solid #1a3a24", maxWidth: 360, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 15px 9px", background: C.page1, borderBottom: `1px solid rgba(180,160,120,0.2)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
<<<<<<< HEAD
            <span style={{ ...SE, fontSize: 10, color: "#222", letterSpacing: "1px" }}>마음서가</span>
=======
            <span style={{ ...SE, fontSize: 10, color: "#222", letterSpacing: "1px" }}>종이약국</span>
>>>>>>> parent of 082902b (fix: PrescriptionView 파일 수정)
            <button type="button" onClick={onReset} style={{ background: "none", border: "none", cursor: "pointer", color: C.ink3, opacity: 0.6, fontSize: 12, padding: 0 }}>↺</button>
          </div>
          <span style={{ ...SE, fontSize: 9, color: "#888", letterSpacing: "1px" }}>No. {String(bookIdx + 1).padStart(4, "0")}</span>
        </div>
        <div style={{ ...paperStyle(C.page1), padding: "14px 15px 14px" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 11 }}>
            <div style={{ position: "relative", width: 70, height: 90, flexShrink: 0 }}>
              <div style={{ width: 70, height: 90, borderRadius: "2px 4px 4px 2px", overflow: "hidden", boxShadow: "2px 4px 10px rgba(0,0,0,0.20)" }}>
                {coverUrl
                  ? <img src={coverUrl} alt={book.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <canvas ref={el => { if (el) { const s = GHIBLI_SCENES[bookIdx % GHIBLI_SCENES.length]; drawGhibli(el, s.scene, s.bg1, s.bg2); } }} width={70} height={90} style={{ width: "100%", height: "100%", display: "block" }} />}
                {!coverUrl && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,transparent 35%,rgba(0,0,0,0.5))" }} />}
              </div>
              <button type="button" onClick={() => handleToggleBookmark(book)} style={{ position: "absolute", top: -1, right: 8, width: 11, height: isBookmarked ? 23 : 19, background: isBookmarked ? C.seal : C.ribbon, clipPath: "polygon(0 0,100% 0,100% 100%,50% 84%,0 100%)", border: "none", cursor: "pointer", zIndex: 5 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...SE, fontSize: 13, color: C.ink, fontWeight: 700, marginBottom: 2 }}>{book.title}</div>
              <div style={{ ...GB, fontSize: 10, color: C.ink3, marginBottom: 5 }}>{book.author} 지음 · {book.publisher} · {book.year}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                {[book.genre, ...(book.tags || [])].filter(Boolean).slice(0, 3).map((t, i) => (
                  <span key={i} style={{ ...SE, fontSize: 8.5, padding: "1.5px 6px", border: `1px solid rgba(110,84,40,0.33)`, borderRadius: 8, color: "#6a5030", background: "rgba(255,248,220,0.7)" }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
<<<<<<< HEAD
          <SH label="책  소개" />
          <div style={{ background: "rgba(175,155,110,0.16)", borderRadius: 4, padding: "8px 10px", marginBottom: 4 }}>
            {(() => {
              const naverDesc = bookDescriptions[key] || "";
              const desc = naverDesc || book.why_this_book || "";
              if (!desc) return <p style={{ ...SE, fontSize: 10, color: C.ink3, opacity: 0.5 }}>· · ·</p>;
              const isLong = desc.length > 100;
              const isExp = !!descExpanded[key];
              return (
                <>
                  <div style={{ maxHeight: isLong && !isExp ? 60 : (isExp ? 140 : "none"), overflowY: isExp ? "auto" : "hidden", transition: "max-height 0.3s ease" }}>
                    <p style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 10.5, color: "#3c2e14", lineHeight: 1.85, wordBreak: "keep-all", letterSpacing: "normal", fontStyle: "normal" }}>{desc}</p>
                  </div>
                  {isLong && (
                    <button type="button" onClick={() => setDescExpanded(p => ({ ...p, [key]: !p[key] }))}
                      style={{ ...SE, fontSize: 9, color: C.ink2, background: "none", border: "none", cursor: "pointer", marginTop: 4, padding: 0, opacity: 0.75 }}>
                      {isExp ? "접기 ▲" : "더보기 ▼"}
                    </button>
                  )}
                  <p style={{ ...SE, fontSize: 9, color: C.ink3, marginTop: 3 }}>— 책 소개 · {book.title}</p>
                </>
              );
            })()}
=======
          <SH label="처방  이유" />
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
>>>>>>> parent of 082902b (fix: PrescriptionView 파일 수정)
          </div>
          {/* 책소개와 추천이유가 다를 때만 추천이유 표시 */}
          {(bookDescriptions[key] || "") !== book.why_this_book && (
            <>
              <SH label="추천  이유" />
              <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 4, padding: "8px 10px", background: C.box, marginBottom: 4 }}>
                <p style={{ ...GB, fontSize: 10, color: C.ink, lineHeight: 1.85 }}>{book.why_this_book}</p>
              </div>
            </>
          )}
        </div>
        <div style={{ height: 3, background: `linear-gradient(90deg,transparent,${C.bdr},transparent)` }} />
        <div style={{ ...paperStyle(C.page2), padding: "20px 15px 14px" }}>
          <SH label="치유  포인트" />
          <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 4, padding: "7px 9px", marginBottom: 5, background: C.box }}>
            <p style={{ ...GB, fontSize: 10, color: C.ink, lineHeight: 1.75, minHeight: 18 }}>
              {quoteText || <span style={{ opacity: 0.28 }}>· · ·</span>}
              {quoteText && !quoteDone && <span style={{ display: "inline-block", width: 1.5, height: 10, background: C.ink, marginLeft: 1, verticalAlign: "middle", animation: "blink 0.8s step-end infinite" }} />}
            </p>
          </div>
          <SH label="읽기  가이드" />
          <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 4, padding: "7px 9px", marginBottom: 5, background: "rgba(255,255,255,0.5)" }}>
            {book.reading_guide?.split(/\d+\.\s*/).filter(Boolean).map((g, i) => (
              <div key={i} style={{ display: "flex", gap: 4, marginBottom: i < 2 ? 3 : 0 }}>
                <span style={{ ...SE, fontSize: 9, color: C.ink3, flexShrink: 0 }}>0{i + 1}.</span>
                <span style={{ ...GB, fontSize: 10, color: C.ink, lineHeight: 1.65 }}>{g.trim()}</span>
              </div>
            )) || <span style={{ ...GB, fontSize: 10, color: C.ink }}>{book.reading_guide}</span>}
          {book.music_keyword && (
            <div key="music" style={{ display: "flex", gap: 4, marginTop: 4, paddingTop: 4, borderTop: `1px dotted rgba(110,84,40,0.18)` }}>
              <span style={{ ...SE, fontSize: 9, color: C.ink3, flexShrink: 0 }}>🎵</span>
              <span style={{ ...GB, fontSize: 10, color: C.ink, lineHeight: 1.65 }}>
                더 깊은 몰입감을 위한 음악 —{" "}
                <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(book.music_keyword)}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ color: C.cover2, textDecoration: "underline", textUnderlineOffset: 2 }}>
                  {book.music_keyword}
                </a>
              </span>
            </div>
          )}
          </div>
          <SH label="근처  소장  도서관" />
          <LibraryBlock book={book} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center", position: "relative", zIndex: 10, overflow: "visible" }}>
            <button type="button" onClick={() => setBuyPanel(buyPanel === key ? null : key)}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 16, border: `1px solid rgba(110,84,40,0.28)`, background: "none", cursor: "pointer", ...GB, fontSize: 9, color: C.ink2 }}>
              구매하기
            </button>
            <SearchDropup book={book} />
            <AudiobookBadges book={book} />
          </div>
          <BuyPopup book={book} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 15px", background: `rgba(243,236,218,0.97)`, borderTop: `1px solid ${C.bdr}` }}>
          <button type="button" onClick={closePanel} style={{ ...SE, fontSize: 9, color: C.ink2, background: "none", border: "none", cursor: "pointer" }}>← 목록으로</button>
          <div style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(110,84,40,0.28)" }} />
          {bookIdx < data.recommended_books.length - 1
            ? <button type="button" onClick={handleNextBook} style={{ ...SE, fontSize: 9, color: C.ink2, background: "none", border: "none", cursor: "pointer" }}>다음 책 →</button>
            : <span style={{ ...SE, fontSize: 9, color: "rgba(110,84,40,0.3)" }}>마지막 처방</span>}
        </div>
      </div>
    );
  };

  // ── 책 목록 카드 (그리드형) ───────────────────────────────────────────────
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
          background: "transparent", border: "none", padding: 0,
          cursor: "pointer", position: "relative", textAlign: "left",
          WebkitTapHighlightColor: "transparent",
          display: "flex", flexDirection: "column", alignItems: "center",
          transition: "transform 0.18s ease",
          width: "100%", maxWidth: isTablet ? 132 : 105,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
      >
        {/* 표지 */}
        <div style={{
          width: "100%", aspectRatio: "2/3", position: "relative",
          overflow: "hidden", borderRadius: 6,
          boxShadow: isOpen
            ? "0 6px 18px rgba(0,0,0,0.38)"
            : "2px 4px 12px rgba(0,0,0,0.22)",
          transition: "box-shadow 0.2s ease",
          transform: "perspective(400px) rotateY(-4deg)",
          transformOrigin: "left center",
        }}>
          {coverUrl
            ? <img src={coverUrl} alt={book.title} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            : <canvas
                ref={el => { if (el) { const s = GHIBLI_SCENES[index % GHIBLI_SCENES.length]; drawGhibli(el, s.scene, s.bg1, s.bg2); } }}
                width={120} height={180}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              />
          }
          {/* 책등 그림자 */}
          <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 10, background: "linear-gradient(90deg,rgba(0,0,0,0.30),transparent)", zIndex: 3 }} />
          {/* 표지 없을 때 제목 */}
          {!coverUrl && (
            <>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,transparent 40%,rgba(0,0,0,0.65))", zIndex: 2 }} />
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 6px 6px", zIndex: 4 }}>
                <div style={{ ...SE, fontSize: 8, color: "rgba(255,255,255,0.95)", lineHeight: 1.3, fontWeight: 700, textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}>{book.title}</div>
                <div style={{ ...GB, fontSize: 7, color: "rgba(255,255,255,0.72)", marginTop: 1 }}>{book.author}</div>
              </div>
            </>
          )}
          {/* 번호 뱃지 */}
          <div style={{
            position: "absolute", top: 5, right: 5, zIndex: 5,
            background: "rgba(0,0,0,0.42)", borderRadius: 4,
            padding: "1px 5px", ...SE, fontSize: 8, color: "rgba(255,255,255,0.9)",
          }}>{String(index + 1).padStart(2, "0")}</div>
          {/* 북마크 점 */}
          {isBookmarked && (
            <div style={{ position: "absolute", top: 5, left: 5, zIndex: 5, width: 6, height: 6, borderRadius: "50%", background: C.seal }} />
          )}
          {/* 선택됨 오버레이 */}
          {isOpen && (
            <div style={{ position: "absolute", inset: 0, border: `2px solid ${C.cover1}`, borderRadius: 6, zIndex: 6 }} />
          )}
        </div>
        {/* 제목 (표지 아래) */}
        <div style={{
          marginTop: 6, width: "100%", ...SE, fontSize: 9.5, color: C.ink,
          lineHeight: 1.3, textAlign: "center",
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
        }}>
          {book.title}
        </div>
      </button>
    );
  };

  // ── 렌더링 ────────────────────────────────────────────────────────────────
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        .book-detail-panel{transition:opacity 0.3s ease,transform 0.3s ease;}
        .book-detail-panel.is-open{opacity:1;transform:translateY(0);}
        .book-detail-panel.is-closed{opacity:0;transform:translateY(-8px);}
        .corner-zone .corner-pill{opacity:0;transform:translateY(4px);transition:opacity 0.2s,transform 0.2s;pointer-events:none;}
        .corner-zone:hover .corner-pill{opacity:1;transform:translateY(0);}
        @media(max-width:767px){.book-spine-hide{display:none!important;}}
      ` }} />

      <div className="animate-fade-in" style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px 80px" }}>

        {/* ── 감정 진단 ── */}
        <section style={{ background: "rgba(255,255,255,0.7)", border: `1px solid ${C.bdr}`, borderRadius: 16, padding: "18px 20px", marginBottom: 16, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${C.cover1},${C.cover2},${C.cover1})` }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <h2 style={{ ...SE, fontSize: 16, color: C.ink, display: "flex", alignItems: "center", gap: 6 }}>
                <Heart style={{ width: 16, height: 16, color: C.seal }} /> 감정 진단서
              </h2>
<<<<<<< HEAD
              <p style={{ ...GB, fontSize: 10, marginTop: 2, color: C.ink3 }}>Record of the Mind</p>
=======
              <p style={{ ...SE, fontSize: 10, marginTop: 2, color: C.ink3, fontStyle: "italic" }}>Diagnosis of the Soul</p>
>>>>>>> parent of 082902b (fix: PrescriptionView 파일 수정)
            </div>
            <div style={{ ...SE, fontSize: 12, padding: "3px 12px", borderRadius: 20, background: "rgba(242,234,216,0.9)", color: C.ink2, fontWeight: 700 }}>강도 {data.emotional_analysis.intensity}/10</div>
          </div>
          <p style={{ ...GB, fontSize: 15, color: C.ink, marginBottom: 10 }}>
            감지된 감정 : <span style={{ marginLeft: 6, color: C.seal, textDecoration: "underline", textUnderlineOffset: 4 }}>{data.emotional_analysis.detected_emotion}</span>
          </p>
          <p style={{ ...GB, fontSize: 13.5, background: C.page1, padding: "12px 14px", borderRadius: 10, color: C.ink, lineHeight: 1.75 }}>"{data.emotional_analysis.empathy_message}"</p>
        </section>

<<<<<<< HEAD
        {/* ── Healing Message ── */}
        {data.healing_message && (
          <section style={{ background: `linear-gradient(135deg, rgba(255,251,236,0.9), rgba(242,234,216,0.7))`, border: `1px solid rgba(155,130,80,0.3)`, borderRadius: 12, padding: "16px 20px", marginBottom: 24, textAlign: "center", position: "relative" }}>
            <div style={{ ...SE, fontSize: 9, color: C.ink3, letterSpacing: "0.1em", marginBottom: 8 }}>✦ 사서의 한 마디 ✦</div>
            <p style={{ ...GB, fontSize: 13.5, color: C.ink, lineHeight: 1.85 }}>"{data.healing_message}"</p>
          </section>
        )}

        {/* ── 추천 도서 목록 ── */}
=======
        {/* 처방 도서 목록 */}
>>>>>>> parent of 082902b (fix: PrescriptionView 파일 수정)
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ ...SE, fontSize: 18, textAlign: "center", color: C.ink, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ flex: 1, height: 1, background: C.bdr }} />처방 도서<span style={{ flex: 1, height: 1, background: C.bdr }} />
          </h3>
<<<<<<< HEAD
          <p style={{ ...SE, fontSize: 10, textAlign: "center", color: C.ink3, marginBottom: 14 }}>책을 선택하면 서가 기록이 펼쳐집니다</p>
          {/* 그리드 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(data.recommended_books.length, 4)}, minmax(0, 1fr))`,
            gap: 6,
            marginBottom: 16,
            justifyItems: "center",
          }}>
=======
          <p style={{ ...SE, fontSize: 10, textAlign: "center", color: C.ink3, marginBottom: 14 }}>책을 선택하면 처방전이 펼쳐집니다</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
>>>>>>> parent of 082902b (fix: PrescriptionView 파일 수정)
            {data.recommended_books.map((book, index) => {
              const key = getBookKey(book);
              return <BookCard key={`book-${key || index}`} book={book} index={index} />;
            })}
          </div>
          {/* 상세 패널 - 그리드 아래 공통으로 열림 */}
          {data.recommended_books.map((book, index) => {
            const key = getBookKey(book);
            const isOpen = openBookKey === key;
            const isClosing = closingKey === key;
            if (!isOpen && !isClosing) return null;
            return (
              <div key={`detail-${key || index}`} className={`book-detail-panel ${panelUp ? "is-open" : "is-closed"}`} style={{ marginTop: 4 }}>
                {isTablet ? renderTabletDetail(book) : renderMobileDetail(book)}
              </div>
            );
          })}
        </section>

<<<<<<< HEAD
        {/* ── 마음을 위한 추가 추천 ── */}
=======
        {/* 마음을 위한 추가 처방 */}
>>>>>>> parent of 082902b (fix: PrescriptionView 파일 수정)
        {curatedBooks.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h3 style={{ ...SE, fontSize: 18, textAlign: "center", color: C.ink, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ flex: 1, height: 1, background: C.bdr }} />마음을 위한 추가 처방<span style={{ flex: 1, height: 1, background: C.bdr }} />
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

        {/* ── 추가 제안 ── */}
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
            새로운 처방 받기
          </button>
        </div>
      </div>
    </>
  );
};

export default PrescriptionView;
