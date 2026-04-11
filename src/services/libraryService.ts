import { Book, LibraryAvailability } from "../types";
import { calculateDistanceKm } from "../utils/distance";
import type { UserLocation } from "./locationService";

const LIBRARY_API_KEY = import.meta.env.VITE_LIBRARY_API_KEY?.trim() || "";
const REGION_CODE = import.meta.env.VITE_LIBRARY_REGION_CODE || "25";

const REGION_CODES = [
  "11", "21", "22", "23", "24", "25", "26", "29",
  "31", "32", "33", "34", "35", "36", "37", "38", "39",
];

// ============================================================
// 17개 지역 중심 좌표 — 사용자 근처 지역 우선 검색
// ============================================================

const REGION_CENTERS: Record<string, { lat: number; lng: number; name: string }> = {
  "11": { lat: 37.5665, lng: 126.9780, name: "서울" },
  "21": { lat: 35.1796, lng: 129.0756, name: "부산" },
  "22": { lat: 35.8714, lng: 128.6014, name: "대구" },
  "23": { lat: 37.4563, lng: 126.7052, name: "인천" },
  "24": { lat: 35.1595, lng: 126.8526, name: "광주" },
  "25": { lat: 36.3504, lng: 127.3845, name: "대전" },
  "26": { lat: 35.5384, lng: 129.3114, name: "울산" },
  "29": { lat: 36.4801, lng: 127.2890, name: "세종" },
  "31": { lat: 37.4138, lng: 127.5183, name: "경기" },
  "32": { lat: 37.8813, lng: 127.7298, name: "강원" },
  "33": { lat: 36.6357, lng: 127.4912, name: "충북" },
  "34": { lat: 36.6588, lng: 126.6728, name: "충남" },
  "35": { lat: 35.7175, lng: 127.1530, name: "전북" },
  "36": { lat: 34.8161, lng: 126.4629, name: "전남" },
  "37": { lat: 36.5760, lng: 128.5056, name: "경북" },
  "38": { lat: 35.2383, lng: 128.6924, name: "경남" },
  "39": { lat: 33.4996, lng: 126.5312, name: "제주" },
};

const sortRegionsByProximity = (userLocation?: UserLocation): string[] => {
  if (!userLocation) return REGION_CODES;
  const { latitude, longitude } = userLocation;
  return [...REGION_CODES].sort((a, b) => {
    const ca = REGION_CENTERS[a];
    const cb = REGION_CENTERS[b];
    if (!ca || !cb) return 0;
    const da = Math.hypot(latitude - ca.lat, longitude - ca.lng);
    const db = Math.hypot(latitude - cb.lat, longitude - cb.lng);
    return da - db;
  });
};

// ============================================================
// 동시성 제한자 - data4library.kr rate limit 방지
// ============================================================

const createConcurrencyLimiter = (maxConcurrent: number) => {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active < maxConcurrent && queue.length > 0) {
      active++;
      const fn = queue.shift()!;
      fn();
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
};

const limitConcurrency = createConcurrencyLimiter(5);

// ============================================================
// 도서관 정보 메모리 캐시 (10분 TTL)
// ============================================================

let _libraryInfoCache: Record<string, Partial<LibraryAvailability>> | null = null;
let _libraryInfoCacheTime = 0;
const LIBRARY_INFO_CACHE_TTL = 10 * 60 * 1000;

const getParser = () => new DOMParser();

const getText = (parent: Element | Document, tagNames: string[]): string => {
  for (const tag of tagNames) {
    const found = parent.getElementsByTagName(tag)[0];
    if (found?.textContent?.trim()) return found.textContent.trim();
  }
  return "";
};

const createMapUrl = (libraryName: string, address?: string) => {
  const query = encodeURIComponent(address ? `${libraryName} ${address}` : libraryName);
  return `https://map.kakao.com/link/search/${query}`;
};

const createHomepageFallback = (libraryName: string) => {
  return `https://www.google.com/search?q=${encodeURIComponent(libraryName)}`;
};

const toNumberOrUndefined = (value: string): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const isPlaceholderKey = (key: string) => {
  return !key || key.includes("네_도서관정보나루_키") || key.includes("여기에_실제") || key.includes("placeholder");
};

// ============================================================
// [FIX] assertXmlOk — 명시적 에러 태그만 검사 (정상 응답 오탐 방지)
// 기존: "error", "errMsg", "message", "resultCode" 모두 검사
//        → 정상 응답의 <message>정상</message> 등을 에러로 오인
// 수정: errMsg / errcode 등 명백한 에러 전용 태그만 검사
// ============================================================

const assertXmlOk = (xml: Document) => {
  // 명시적 에러 메시지 태그만 확인 ("message" 제외 — 정상 응답에도 존재)
  const errMsg  = getText(xml, ["errMsg", "error"]);
  const errCode = getText(xml, ["errorCode", "errCode"]);

  if (!errMsg) return; // 에러 없음 → 정상

  // "결과 없음" 타입은 에러가 아님 → 조용히 통과
  const noDataPatterns = ["결과가 없", "조회된 자료", "검색결과가 없", "No data", "no result"];
  if (noDataPatterns.some(p => errMsg.includes(p))) return;

  throw new Error(errCode ? `${errMsg} (${errCode})` : errMsg);
};

const fetchXml = async (url: string): Promise<Document> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`도서관 API 호출 실패: ${response.status}`);
  const xmlText = await response.text();
  const xml = getParser().parseFromString(xmlText, "text/xml");
  const parserError = xml.getElementsByTagName("parsererror")[0];
  if (parserError) throw new Error("XML 파싱 실패");
  assertXmlOk(xml);
  return xml;
};

const parseHoldingLibraries = (xml: Document): LibraryAvailability[] => {
  const libs = Array.from(xml.getElementsByTagName("lib"));
  return libs.map((lib) => {
    const libCode = getText(lib, ["libCode", "libcode"]);
    const libraryName = getText(lib, ["libName", "libname"]);
    const address = getText(lib, ["address", "libAddr", "libaddr"]);
    return {
      libCode, libraryName, address,
      hasBook: true, loanAvailable: undefined,
      mapUrl: createMapUrl(libraryName, address),
      homepage: createHomepageFallback(libraryName),
      telephone: "", latitude: undefined, longitude: undefined, distanceKm: undefined,
    };
  });
};

const parseLibraryInfo = (xml: Document): Record<string, Partial<LibraryAvailability>> => {
  const libs = Array.from(xml.getElementsByTagName("lib"));
  const result: Record<string, Partial<LibraryAvailability>> = {};
  for (const lib of libs) {
    const libCode = getText(lib, ["libCode", "libcode"]);
    if (!libCode) continue;
    const libraryName = getText(lib, ["libName", "libname"]);
    const address = getText(lib, ["address", "libAddr", "libaddr"]);
    result[libCode] = {
      libCode, libraryName, address,
      homepage: getText(lib, ["homepage", "homePage", "libHomepage"]) || createHomepageFallback(libraryName),
      telephone: getText(lib, ["tel", "telephone", "phone"]),
      latitude: toNumberOrUndefined(getText(lib, ["latitude", "lat"])),
      longitude: toNumberOrUndefined(getText(lib, ["longitude", "long", "lng"])),
    };
  }
  return result;
};

const parseLoanAvailability = (xml: Document): boolean | undefined => {
  const loanYn = getText(xml, ["loanAvailable", "loanavailable", "loan_yn", "loanYn"]);
  if (!loanYn) return undefined;
  const normalized = loanYn.trim().toUpperCase();
  if (normalized === "Y") return true;
  if (normalized === "N") return false;
  return undefined;
};

const uniqueByLibrary = (items: LibraryAvailability[]) => {
  const map = new Map<string, LibraryAvailability>();
  for (const item of items) {
    const key = item.libCode || `${item.libraryName}-${item.address}`;
    if (!map.has(key)) {
      map.set(key, item);
    } else {
      const existing = map.get(key)!;
      if (item.loanAvailable === true && existing.loanAvailable !== true) {
        map.set(key, item);
      }
    }
  }
  return [...map.values()];
};

const fetchLoanAvailability = async (isbn13: string, libCode?: string): Promise<boolean | undefined> => {
  if (!libCode || isPlaceholderKey(LIBRARY_API_KEY)) return undefined;
  const url = `/api/library/bookExist?authKey=${encodeURIComponent(LIBRARY_API_KEY)}&libCode=${encodeURIComponent(libCode)}&isbn13=${encodeURIComponent(isbn13)}`;
  try {
    const xml = await limitConcurrency(() => fetchXml(url));
    return parseLoanAvailability(xml);
  } catch { return undefined; }
};

// ============================================================
// [FIX] fetchHoldingLibrariesByRegion — try-catch 추가
// 기존: 에러 throw 시 Promise.allSettled rejected → 결과 0개
// 수정: 에러 시 빈 배열 반환 (지역별 실패가 전체를 막지 않도록)
// ============================================================

const fetchHoldingLibrariesByRegion = async (isbn13: string, regionCode: string): Promise<LibraryAvailability[]> => {
  const url = `/api/library/libSrchByBook?authKey=${encodeURIComponent(LIBRARY_API_KEY)}&isbn=${encodeURIComponent(isbn13)}&region=${encodeURIComponent(regionCode)}`;
  try {
    const xml = await limitConcurrency(() => fetchXml(url));
    return parseHoldingLibraries(xml);
  } catch (err) {
    // 조용히 빈 배열 (해당 지역에 없는 경우가 정상)
    return [];
  }
};

// 캐싱 적용 - 10분 이내 재호출 시 캐시 반환
const fetchLibraryInfoNationwide = async (): Promise<Record<string, Partial<LibraryAvailability>>> => {
  const now = Date.now();
  if (_libraryInfoCache && now - _libraryInfoCacheTime < LIBRARY_INFO_CACHE_TTL) {
    console.log("[Library] 도서관 정보 캐시 히트");
    return _libraryInfoCache;
  }

  console.log("[Library] 도서관 정보 전국 조회 시작");
  const chunks = await Promise.all(
    REGION_CODES.map(async (regionCode) => {
      const url = `/api/library/libSrch?authKey=${encodeURIComponent(LIBRARY_API_KEY)}&region=${encodeURIComponent(regionCode)}&pageNo=1&pageSize=300`;
      try {
        const xml = await limitConcurrency(() => fetchXml(url));
        return parseLibraryInfo(xml);
      } catch {
        return {};
      }
    })
  );

  const result = chunks.reduce<Record<string, Partial<LibraryAvailability>>>(
    (acc, cur) => ({ ...acc, ...cur }), {}
  );

  _libraryInfoCache = result;
  _libraryInfoCacheTime = now;
  console.log(`[Library] 도서관 정보 캐시 저장 (${Object.keys(result).length}개)`);
  return result;
};

// ============================================================
// 기존 함수들 (단일 ISBN)
// ============================================================

export const findLibrariesByBook = async (book: Book): Promise<LibraryAvailability[]> => {
  if (isPlaceholderKey(LIBRARY_API_KEY)) {
    throw new Error("도서관 정보나루 인증키 승인 후 사용할 수 있습니다.");
  }
  const rawIsbn = (book.isbn || "").replace(/[^0-9Xx]/g, "");
  if (!rawIsbn) throw new Error("이 책에는 ISBN이 없어 도서관 조회를 할 수 없습니다.");

  const isbn13 = rawIsbn;
  const holdingByRegion = await Promise.all(
    REGION_CODES.map(async (regionCode) => {
      try { return await fetchHoldingLibrariesByRegion(isbn13, regionCode); }
      catch { return []; }
    })
  );
  const holdingLibraries = uniqueByLibrary(holdingByRegion.flat());
  if (holdingLibraries.length === 0) return [];

  const libInfoMap = await fetchLibraryInfoNationwide();
  const merged = holdingLibraries.map((library) => {
    const extra = library.libCode ? libInfoMap[library.libCode] : undefined;
    const libraryName = extra?.libraryName || library.libraryName;
    const address = extra?.address || library.address;
    return {
      ...library, ...extra, libraryName, address,
      homepage: extra?.homepage || library.homepage || createHomepageFallback(libraryName),
      mapUrl: createMapUrl(libraryName, address), hasBook: true,
    };
  });
  const uniqueLibraries = uniqueByLibrary(merged);
  const withLoanStatus = await Promise.all(
    uniqueLibraries.map(async (library) => {
      const loanAvailable = await fetchLoanAvailability(isbn13, library.libCode);
      return { ...library, loanAvailable };
    })
  );
  return withLoanStatus;
};

export const findNearbyLibrariesByBook = async (book: Book, userLocation: UserLocation): Promise<LibraryAvailability[]> => {
  const libraries = await findLibrariesByBook(book);
  const withDistance = libraries.map((library) => {
    if (typeof library.latitude === "number" && typeof library.longitude === "number") {
      return { ...library, distanceKm: calculateDistanceKm(userLocation.latitude, userLocation.longitude, library.latitude, library.longitude) };
    }
    return { ...library, distanceKm: undefined };
  });
  return withDistance.sort((a, b) => {
    if (typeof a.distanceKm !== "number" && typeof b.distanceKm !== "number") return 0;
    if (typeof a.distanceKm !== "number") return 1;
    if (typeof b.distanceKm !== "number") return -1;
    return a.distanceKm - b.distanceKm;
  });
};

export const findLibrariesByBookNationwide = async (book: Book): Promise<LibraryAvailability[]> => {
  return await findLibrariesByBook(book);
};

// ============================================================
// 복수 ISBN 병렬 검색 (개정판 지원)
// ============================================================

export const findLibrariesByMultipleIsbns = async (
  isbnList: string[],
  userLocation?: UserLocation
): Promise<LibraryAvailability[]> => {
  if (isPlaceholderKey(LIBRARY_API_KEY)) {
    throw new Error("도서관 정보나루 인증키 승인 후 사용할 수 있습니다.");
  }

  if (isbnList.length === 0) {
    throw new Error("검색할 ISBN이 없습니다.");
  }

  const validIsbns = isbnList
    .map((isbn) => isbn.replace(/[^0-9Xx]/g, ""))
    .filter((isbn) => isbn.length === 13);

  if (validIsbns.length === 0) {
    throw new Error("유효한 ISBN-13이 없습니다.");
  }

  const prioritizedRegions = sortRegionsByProximity(userLocation);
  const nearbyRegions = prioritizedRegions.slice(0, 5);
  const farRegions    = prioritizedRegions.slice(5);

  console.log(
    `[Library] ${validIsbns.length}개 ISBN 검색 시작 | ` +
    `우선 지역: [${nearbyRegions.map(r => REGION_CENTERS[r]?.name ?? r).join(", ")}]`
  );

  const libInfoMap = await fetchLibraryInfoNationwide();

  // 1단계: 가까운 지역 먼저 검색
  const nearbyResults = await Promise.allSettled(
    validIsbns.flatMap((isbn) =>
      nearbyRegions.map((regionCode) =>
        fetchHoldingLibrariesByRegion(isbn, regionCode).then((libs) =>
          libs.map((lib): LibraryAvailability => ({ ...lib, foundByIsbn: isbn }))
        )
      )
    )
  );

  const nearbyLibraries = nearbyResults
    .filter((r): r is PromiseFulfilledResult<LibraryAvailability[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  // 2단계: 근처 3개 미만이면 전국 확장
  let farLibraries: LibraryAvailability[] = [];
  if (nearbyLibraries.length < 3) {
    console.log(`[Library] 근처 지역 결과 ${nearbyLibraries.length}개 — 전국 확장 검색`);
    const farResults = await Promise.allSettled(
      validIsbns.flatMap((isbn) =>
        farRegions.map((regionCode) =>
          fetchHoldingLibrariesByRegion(isbn, regionCode).then((libs) =>
            libs.map((lib): LibraryAvailability => ({ ...lib, foundByIsbn: isbn }))
          )
        )
      )
    );
    farLibraries = farResults
      .filter((r): r is PromiseFulfilledResult<LibraryAvailability[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);
  } else {
    console.log(`[Library] 근처 지역에서 ${nearbyLibraries.length}개 발견 — 전국 확장 생략`);
  }

  const flatResults: LibraryAvailability[] = [...nearbyLibraries, ...farLibraries];
  console.log(`[Library] 전체 ${flatResults.length}개 도서관 결과 수집`);

  if (flatResults.length === 0) return [];

  const isbnByLibCode = new Map<string, string>();
  for (const lib of flatResults) {
    const key = lib.libCode || `${lib.libraryName}-${lib.address}`;
    if (!isbnByLibCode.has(key) && lib.foundByIsbn) {
      isbnByLibCode.set(key, lib.foundByIsbn);
    }
  }

  const uniqueLibs = uniqueByLibrary(flatResults);

  const merged = uniqueLibs.map((library) => {
    const extra = library.libCode ? libInfoMap[library.libCode] : undefined;
    const libraryName = extra?.libraryName || library.libraryName;
    const address = extra?.address || library.address;
    return {
      ...library, ...extra, libraryName, address,
      homepage: extra?.homepage || library.homepage || createHomepageFallback(libraryName),
      mapUrl: createMapUrl(libraryName, address), hasBook: true,
    };
  });

  const uniqueMerged = uniqueByLibrary(merged);

  const withLoanStatus = await Promise.all(
    uniqueMerged.map(async (library) => {
      const key = library.libCode || `${library.libraryName}-${library.address}`;
      const isbnForCheck = isbnByLibCode.get(key) || validIsbns[0];
      const loanAvailable = await fetchLoanAvailability(isbnForCheck, library.libCode);
      return {
        ...library,
        loanAvailable,
        foundByIsbn: isbnByLibCode.get(key),
      } satisfies LibraryAvailability;
    })
  );

  if (userLocation) {
    const withDistance = withLoanStatus.map((library) => {
      if (typeof library.latitude === "number" && typeof library.longitude === "number") {
        return {
          ...library,
          distanceKm: calculateDistanceKm(
            userLocation.latitude, userLocation.longitude,
            library.latitude, library.longitude
          ),
        };
      }
      return { ...library, distanceKm: undefined };
    });

    return withDistance.sort((a, b) => {
      if (typeof a.distanceKm !== "number" && typeof b.distanceKm !== "number") return 0;
      if (typeof a.distanceKm !== "number") return 1;
      if (typeof b.distanceKm !== "number") return -1;
      return a.distanceKm - b.distanceKm;
    });
  }

  return withLoanStatus;
};