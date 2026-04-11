// src/services/bookCoverService.ts
// 이미지 폴백 순서: 네이버 → 알라딘 → Google Books (키 없으면 스킵)

// ── 네이버 책 이미지 ──────────────────────────────────────────────────────────
async function getCoverFromNaver(title: string, author?: string): Promise<string | null> {
  try {
    const query = author ? `${title} ${author}` : title;
    const params = new URLSearchParams({ query, display: "5" });
    const response = await fetch(`/api/naver-book?${params}`);
    if (!response.ok) return null;
    const data = await response.json();
    // 큰글자·점자·오디오 특수판본 제외하고 제목이 가장 근접한 결과 사용
    const SKIP = ["큰글자", "큰 글자", "점자", "오디오북", "오디오 북", "대활자"];
    const items = (data.items || []) as Array<{ title?: string; image?: string }>;
    // 1순위: 특수판본 아니고 제목에 원본 타이틀 포함
    const best = items.find(item =>
      !SKIP.some(kw => (item.title || "").includes(kw)) &&
      (item.title || "").includes(title.slice(0, 6))
    );
    // 2순위: 특수판본만 아니면 OK
    const fallback = items.find(item =>
      !SKIP.some(kw => (item.title || "").includes(kw))
    );
    const image = (best || fallback)?.image;
    return image || null;
  } catch {
    return null;
  }
}

// ── 알라딘 책 이미지 ──────────────────────────────────────────────────────────
async function getCoverFromAladin(title: string, author?: string): Promise<string | null> {
  const key = import.meta.env.VITE_ALADIN_API_KEY;
  if (!key) return null;
  try {
    const query = encodeURIComponent(author ? `${title} ${author}` : title);
    const url = `https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${key}&Query=${query}&QueryType=Keyword&MaxResults=1&start=1&SearchTarget=Book&output=js&Version=20131101`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const cover = data.item?.[0]?.cover;
    return cover || null;
  } catch {
    return null;
  }
}

// ── Google Books 이미지 (키 없으면 스킵) ─────────────────────────────────────
async function getCoverFromGoogle(title: string, author?: string): Promise<string | null> {
  const key = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY;
  if (!key) return null;
  try {
    const query = encodeURIComponent(
      author ? `intitle:${title} inauthor:${author}` : `intitle:${title}`
    );
    const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1&key=${key}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const imageLinks = data.items?.[0]?.volumeInfo?.imageLinks;
    const raw = imageLinks?.thumbnail || imageLinks?.smallThumbnail || null;
    return raw ? raw.replace(/^http:\/\//, "https://") : null;
  } catch {
    return null;
  }
}

// ── 메인 export ───────────────────────────────────────────────────────────────
export const getBookCoverUrl = async (
  title: string,
  author?: string
): Promise<string | null> => {
  const naver = await getCoverFromNaver(title, author);
  if (naver) return naver;

  const aladin = await getCoverFromAladin(title, author);
  if (aladin) return aladin;

  const google = await getCoverFromGoogle(title, author);
  if (google) return google;

  return null;
};