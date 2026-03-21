import { Book, LibraryAvailability } from "../types";
import { calculateDistanceKm } from "../utils/distance";
import type { UserLocation } from "./locationService";

const LIBRARY_API_KEY = import.meta.env.VITE_LIBRARY_API_KEY?.trim() || "";
const REGION_CODE = import.meta.env.VITE_LIBRARY_REGION_CODE || "25";

const getParser = () => new DOMParser();

const getText = (parent: Element | Document, tagNames: string[]): string => {
  for (const tag of tagNames) {
    const found = parent.getElementsByTagName(tag)[0];
    if (found?.textContent?.trim()) {
      return found.textContent.trim();
    }
  }
  return "";
};

const createMapUrl = (libraryName: string, address?: string) => {
  const query = encodeURIComponent(address ? `${libraryName} ${address}` : libraryName);
  return `https://map.kakao.com/link/search/${query}`;
};

const createHomepageFallback = (libraryName: string) => {
  const query = encodeURIComponent(libraryName);
  return `https://www.google.com/search?q=${query}`;
};

const toNumberOrUndefined = (value: string): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const isPlaceholderKey = (key: string) => {
  return (
    !key ||
    key.includes("네_도서관정보나루_키") ||
    key.includes("여기에_실제") ||
    key.includes("placeholder")
  );
};

const assertXmlOk = (xml: Document) => {
  const error = getText(xml, ["error", "errMsg", "message"]);
  const code = getText(xml, ["errorCode", "code", "resultCode"]);

  if (error) {
    throw new Error(code ? `${error} (${code})` : error);
  }
};

const fetchXml = async (url: string): Promise<Document> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`도서관 API 호출 실패: ${response.status}`);
  }

  const xmlText = await response.text();
  const xml = getParser().parseFromString(xmlText, "text/xml");

  const parserError = xml.getElementsByTagName("parsererror")[0];
  if (parserError) {
    throw new Error("XML 파싱 실패");
  }

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
      libCode,
      libraryName,
      address,
      hasBook: true,
      loanAvailable: undefined,
      mapUrl: createMapUrl(libraryName, address),
      homepage: createHomepageFallback(libraryName),
      telephone: "",
      latitude: undefined,
      longitude: undefined,
      distanceKm: undefined,
    };
  });
};

const parseLibraryInfo = (
  xml: Document
): Record<string, Partial<LibraryAvailability>> => {
  const libs = Array.from(xml.getElementsByTagName("lib"));
  const result: Record<string, Partial<LibraryAvailability>> = {};

  for (const lib of libs) {
    const libCode = getText(lib, ["libCode", "libcode"]);
    if (!libCode) continue;

    const libraryName = getText(lib, ["libName", "libname"]);
    const address = getText(lib, ["address", "libAddr", "libaddr"]);

    result[libCode] = {
      libCode,
      libraryName,
      address,
      homepage:
        getText(lib, ["homepage", "homePage", "libHomepage"]) ||
        createHomepageFallback(libraryName),
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
    }
  }

  return [...map.values()];
};

const fetchLoanAvailability = async (
  isbn13: string,
  libCode?: string
): Promise<boolean | undefined> => {
  if (!libCode || isPlaceholderKey(LIBRARY_API_KEY)) return undefined;

  const url =
    `https://data4library.kr/api/bookExist` +
    `?authKey=${encodeURIComponent(LIBRARY_API_KEY)}` +
    `&libCode=${encodeURIComponent(libCode)}` +
    `&isbn13=${encodeURIComponent(isbn13)}`;

  try {
    const xml = await fetchXml(url);
    return parseLoanAvailability(xml);
  } catch {
    return undefined;
  }
};

export const findLibrariesByBook = async (
  book: Book
): Promise<LibraryAvailability[]> => {
  if (isPlaceholderKey(LIBRARY_API_KEY)) {
    throw new Error("도서관 정보나루 인증키 승인 후 사용할 수 있습니다.");
  }

  const rawIsbn = (book.isbn || "").replace(/[^0-9Xx]/g, "");
  if (!rawIsbn) {
    throw new Error("이 책에는 ISBN이 없어 도서관 조회를 할 수 없습니다.");
  }

  const isbn13 = rawIsbn;

  const byBookUrl =
    `https://data4library.kr/api/libSrchByBook` +
    `?authKey=${encodeURIComponent(LIBRARY_API_KEY)}` +
    `&isbn=${encodeURIComponent(isbn13)}` +
    `&region=${encodeURIComponent(REGION_CODE)}`;

  const byBookXml = await fetchXml(byBookUrl);
  const holdingLibraries = parseHoldingLibraries(byBookXml);

  if (holdingLibraries.length === 0) {
    return [];
  }

  const libInfoUrl =
    `https://data4library.kr/api/libSrch` +
    `?authKey=${encodeURIComponent(LIBRARY_API_KEY)}` +
    `&region=${encodeURIComponent(REGION_CODE)}` +
    `&pageNo=1&pageSize=300`;

  const libInfoXml = await fetchXml(libInfoUrl);
  const libInfoMap = parseLibraryInfo(libInfoXml);

  const merged = holdingLibraries.map((library) => {
    const extra = library.libCode ? libInfoMap[library.libCode] : undefined;

    const libraryName = extra?.libraryName || library.libraryName;
    const address = extra?.address || library.address;

    return {
      ...library,
      ...extra,
      libraryName,
      address,
      homepage:
        extra?.homepage || library.homepage || createHomepageFallback(libraryName),
      mapUrl: createMapUrl(libraryName, address),
      hasBook: true,
    };
  });

  const uniqueLibraries = uniqueByLibrary(merged);

  const withLoanStatus = await Promise.all(
    uniqueLibraries.map(async (library) => {
      const loanAvailable = await fetchLoanAvailability(isbn13, library.libCode);
      return {
        ...library,
        loanAvailable,
      };
    })
  );

  return withLoanStatus;
};

export const findNearbyLibrariesByBook = async (
  book: Book,
  userLocation: UserLocation
): Promise<LibraryAvailability[]> => {
  const libraries = await findLibrariesByBook(book);

  const withDistance = libraries.map((library) => {
    if (
      typeof library.latitude === "number" &&
      typeof library.longitude === "number"
    ) {
      return {
        ...library,
        distanceKm: calculateDistanceKm(
          userLocation.latitude,
          userLocation.longitude,
          library.latitude,
          library.longitude
        ),
      };
    }

    return {
      ...library,
      distanceKm: undefined,
    };
  });

  return withDistance.sort((a, b) => {
    if (typeof a.distanceKm !== "number" && typeof b.distanceKm !== "number") {
      return 0;
    }
    if (typeof a.distanceKm !== "number") return 1;
    if (typeof b.distanceKm !== "number") return -1;
    return a.distanceKm - b.distanceKm;
  });
};