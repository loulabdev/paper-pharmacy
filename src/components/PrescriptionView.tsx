import React, { useEffect, useMemo, useState } from "react";
import {
  Quote,
  Sparkles,
  AlertCircle,
  Heart,
  Bookmark,
  MapPin,
  ExternalLink,
} from "lucide-react";
import { LibraryAvailability, Prescription } from "../types";
import {
  getBookBookmarks,
  toggleBookBookmark,
} from "../services/storageService";
import { getBookCoverUrl } from "../services/bookCoverService";
import { findNearbyLibrariesByBook } from "../services/libraryService";
import { getCurrentLocation } from "../services/locationService";

interface Props {
  data: Prescription;
  onReset: () => void;
  onBookmarksChange?: () => void;
}

type RecommendedBook = Prescription["recommended_books"][number];

export const PrescriptionView: React.FC<Props> = ({
  data,
  onReset,
  onBookmarksChange,
}) => {
  const [bookmarks, setBookmarks] = useState(getBookBookmarks());
  const [coverUrls, setCoverUrls] = useState<Record<string, string | null>>({});
  const [libraryResults, setLibraryResults] = useState<
    Record<string, LibraryAvailability[]>
  >({});
  const [libraryErrors, setLibraryErrors] = useState<
    Record<string, string | null>
  >({});
  const [searchedBooks, setSearchedBooks] = useState<Record<string, boolean>>(
    {}
  );
  const [loadingBooks, setLoadingBooks] = useState<Record<string, boolean>>({});

  const bookmarkedKeys = useMemo(
    () =>
      new Set(
        bookmarks.map(
          (item) =>
            `${item.book.title}__${item.book.author}__${item.book.publisher}`
        )
      ),
    [bookmarks]
  );

  const getBookKey = (book: RecommendedBook) =>
    `${book.title}__${book.author}__${book.publisher}`;

  const handleToggleBookmark = (book: RecommendedBook) => {
    const updated = toggleBookBookmark(book);
    setBookmarks(updated);
    onBookmarksChange?.();
  };

  const handleFindLibraries = async (book: RecommendedBook) => {
    const key = getBookKey(book);

    setLoadingBooks((prev) => ({ ...prev, [key]: true }));
    setLibraryErrors((prev) => ({ ...prev, [key]: null }));

    try {
      const userLocation = await getCurrentLocation();
      const result = await findNearbyLibrariesByBook(book, userLocation);

      setLibraryResults((prev) => ({
        ...prev,
        [key]: result,
      }));

      setSearchedBooks((prev) => ({
        ...prev,
        [key]: true,
      }));
    } catch (error) {
      console.error("도서관 조회 오류:", error);

      setLibraryResults((prev) => ({
        ...prev,
        [key]: [],
      }));

      setLibraryErrors((prev) => ({
        ...prev,
        [key]:
          error instanceof Error
            ? error.message
            : "도서관 정보를 불러오지 못했습니다.",
      }));

      setSearchedBooks((prev) => ({
        ...prev,
        [key]: true,
      }));
    } finally {
      setLoadingBooks((prev) => ({ ...prev, [key]: false }));
    }
  };

  useEffect(() => {
    const fetchCovers = async () => {
      const entries = await Promise.all(
        data.recommended_books.map(async (book) => {
          const key = getBookKey(book);
          const url = await getBookCoverUrl(book.title, book.author);
          return [key, url] as const;
        })
      );

      const results: Record<string, string | null> = {};
      for (const [key, url] of entries) {
        results[key] = url;
      }

      setCoverUrls(results);
    };

    fetchCovers();
  }, [data]);

  return (
    <div className="animate-fade-in max-w-3xl mx-auto space-y-10 pb-20">
      <section className="bg-white border border-paper-200 rounded-2xl p-8 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-paper-300"></div>

        <div className="flex justify-between items-start mb-5">
          <div>
            <h2 className="text-xl font-serif font-bold text-ink-900 flex items-center gap-2">
              <Heart className="w-5 h-5 text-seal" />
              감정 진단서
            </h2>
            <p className="text-xs text-gray-500 mt-1">Diagnosis of the Soul</p>
          </div>

          <div className="px-3 py-1 text-sm rounded-full bg-paper-100 text-paper-800 font-bold">
            강도 {data.emotional_analysis.intensity}/10
          </div>
        </div>

        <p className="text-lg font-serif text-ink-900 mb-3">
          감지된 감정 :
          <span className="ml-2 text-seal underline underline-offset-4">
            {data.emotional_analysis.detected_emotion}
          </span>
        </p>

        <p className="bg-paper-50 p-4 rounded-xl text-ink-800 leading-relaxed text-[15px]">
          "{data.emotional_analysis.empathy_message}"
        </p>
      </section>

      <section className="space-y-8">
        <h3 className="text-2xl font-serif text-center text-ink-900 flex items-center justify-center gap-3">
          <span className="h-px w-10 bg-paper-300"></span>
          처방 도서
          <span className="h-px w-10 bg-paper-300"></span>
        </h3>

        {data.recommended_books.map((book, index) => {
          const key = getBookKey(book);
          const isBookmarked = bookmarkedKeys.has(key);
          const coverUrl = coverUrls[key];
          const libraries = libraryResults[key] || [];
          const libraryError = libraryErrors[key];
          const isLoading = !!loadingBooks[key];
          const hasSearched = !!searchedBooks[key];

          return (
            <article
              key={key || index}
              className="bg-white border border-paper-200 rounded-2xl p-6 md:p-8 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex gap-6">
                <div className="flex-shrink-0 w-28 h-40 border border-paper-300 rounded-md overflow-hidden">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={book.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-paper-100 flex flex-col items-center justify-center text-center px-2">
                      <span className="text-sm font-serif font-bold text-ink-900 line-clamp-3">
                        {book.title}
                      </span>
                      <span className="text-[11px] text-ink-800/60 mt-2">
                        {book.author}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-3">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h4 className="text-xl font-serif font-bold text-ink-900">
                        {book.title}
                      </h4>

                      <p className="text-sm text-ink-800/60">
                        {book.author} · {book.publisher} ({book.year})
                      </p>

                      {book.isbn && (
                        <p className="text-xs text-ink-800/45 mt-1">
                          ISBN {book.isbn}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleBookmark(book)}
                      className={`flex items-center gap-1 text-xs px-3 py-1 rounded-full border transition ${
                        isBookmarked
                          ? "bg-ink-900 text-white border-ink-900"
                          : "bg-white border-paper-300 hover:bg-paper-50"
                      }`}
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      {isBookmarked ? "저장됨" : "북마크"}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-block text-xs px-2 py-1 bg-paper-100 rounded text-paper-800">
                      {book.genre}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleFindLibraries(book)}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border bg-white border-paper-300 hover:bg-paper-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      {isLoading ? "위치 확인 중..." : "내 근처 도서관 찾기"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 bg-paper-50 border-l-4 border-paper-300 p-4 rounded-r-xl">
                <p className="flex gap-2 text-sm italic text-ink-800">
                  <Quote className="w-4 h-4 text-paper-400 flex-shrink-0" />
                  {book.quote}
                </p>
              </div>

              <p className="mt-4 text-[15px] leading-relaxed text-ink-800">
                <strong className="text-ink-900">처방 이유</strong>
                <span className="ml-1">{book.why_this_book}</span>
              </p>

              <div className="grid md:grid-cols-2 gap-4 mt-5">
                <div className="bg-green-50 p-4 rounded-xl text-sm">
                  <span className="flex items-center gap-1 font-bold text-green-800 mb-1">
                    <Sparkles className="w-3 h-3" />
                    치유 포인트
                  </span>
                  {book.healing_point}
                </div>

                <div className="bg-blue-50 p-4 rounded-xl text-sm">
                  <span className="font-bold text-blue-800 block mb-1">
                    읽기 가이드
                  </span>
                  {book.reading_guide}
                </div>
              </div>

              {libraryError && (
                <div className="mt-5 bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700">
                  {libraryError}
                </div>
              )}

              {hasSearched &&
                !isLoading &&
                !libraryError &&
                libraries.length === 0 && (
                  <div className="mt-5 bg-paper-50 border border-paper-200 rounded-xl p-4 text-sm text-ink-800/70">
                    내 위치 기준으로 조회 가능한 도서관을 찾지 못했습니다.
                  </div>
                )}

              {libraries.length > 0 && (
                <div className="mt-5 bg-paper-50 border border-paper-200 rounded-xl p-4">
                  <h5 className="text-sm font-bold text-ink-900 mb-3">
                    내 근처 도서관 검색 결과
                  </h5>

                  <ul className="space-y-3">
                    {libraries.map((library, idx) => (
                      <li
                        key={`${library.libCode || library.libraryName}-${idx}`}
                        className="border-b border-paper-200 pb-3 last:border-b-0 last:pb-0"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-ink-900">
                              {library.libraryName}
                            </p>
                            <p className="text-xs text-ink-800/60 mt-1">
                              {library.address}
                            </p>

                            {typeof library.distanceKm === "number" && (
                              <p className="text-xs text-ink-800/55 mt-1">
                                내 위치 기준 약 {library.distanceKm}km
                              </p>
                            )}

                            {library.telephone && (
                              <p className="text-xs text-ink-800/55 mt-1">
                                {library.telephone}
                              </p>
                            )}
                          </div>

                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              library.hasBook
                                ? library.loanAvailable === true
                                  ? "bg-green-100 text-green-800"
                                  : "bg-paper-200 text-paper-800"
                                : "bg-gray-200 text-gray-700"
                            }`}
                          >
                            {library.hasBook
                              ? library.loanAvailable === true
                                ? "대출 가능"
                                : "소장 확인"
                              : "미소장"}
                          </span>
                        </div>

                        <div className="flex gap-2 mt-3 flex-wrap">
                          {library.mapUrl && (
                            <a
                              href={library.mapUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border border-paper-300 hover:bg-paper-100"
                            >
                              <MapPin className="w-3.5 h-3.5" />
                              지도 보기
                            </a>
                          )}

                          {library.homepage && (
                            <a
                              href={library.homepage}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border border-paper-300 hover:bg-paper-100"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              홈페이지
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          );
        })}
      </section>

      <section className="bg-paper-100 border border-paper-200 p-6 rounded-xl">
        <h3 className="font-serif text-lg font-bold text-ink-900 mb-3">
          추가 제안 및 활동
        </h3>

        <ul className="list-disc list-inside text-ink-800 space-y-2">
          {data.additional_care.activities.map((activity, idx) => (
            <li key={idx}>{activity}</li>
          ))}
        </ul>

        {data.additional_care.professional_help && (
          <div className="flex gap-2 mt-4 bg-red-50 border border-red-100 p-3 rounded text-xs text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{data.additional_care.professional_help}</span>
          </div>
        )}
      </section>

      <div className="text-center pt-6">
        <button
          type="button"
          onClick={onReset}
          className="px-8 py-3 bg-ink-900 text-white rounded-full hover:bg-ink-800 transition font-serif shadow-md hover:shadow-lg"
        >
          새로운 처방 받기
        </button>
      </div>
    </div>
  );
};