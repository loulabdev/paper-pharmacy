import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Prescription } from "../types";

// ─── 스키마 ───────────────────────────────────────────────────────────────────
const prescriptionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    emotional_analysis: {
      type: Type.OBJECT,
      properties: {
        detected_emotion: { type: Type.STRING },
        intensity: { type: Type.STRING, description: "Scale 1-10" },
        empathy_message: { type: Type.STRING },
      },
      required: ["detected_emotion", "intensity", "empathy_message"],
    },
    healing_message: {
      type: Type.STRING,
      description:
        "사용자의 마음 계절과 추천 도서의 특징을 결합한 1~2문장의 다정한 응원 메시지. 계절감이 느껴지는 따뜻한 문장으로 작성.",
    },
    recommended_books: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          author: { type: Type.STRING },
          publisher: { type: Type.STRING },
          year: { type: Type.STRING },
          isbn: { type: Type.STRING, description: "가능하면 ISBN-13 형식" },
          genre: { type: Type.STRING },
          why_this_book: { type: Type.STRING },
          healing_point: { type: Type.STRING },
          reading_guide: { type: Type.STRING },
          music_keyword: {
            type: Type.STRING,
            description: "이 책을 읽을 때 어울리는 음악 분위기 키워드 (예: '잔잔한 피아노 재즈', '새소리 자연음', '보사노바 카페음악'). 유튜브 검색에 사용됨.",
          },

          tags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "오디오북 플랫폼 정보 등 추가 태그. 예: 오디오북_밀리, 오디오북_윌라, 오디오북_네이버",
          },
        },
        required: [
          "title",
          "author",
          "publisher",
          "year",
          "genre",
          "why_this_book",
          "healing_point",
          "reading_guide",
        ],
      },
    },
    additional_care: {
      type: Type.OBJECT,
      properties: {
        activities: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        professional_help: { type: Type.STRING },
      },
      required: ["activities"],
    },
  },
  required: [
    "emotional_analysis",
    "healing_message",
    "recommended_books",
    "additional_care",
  ],
};

// ─── 시스템 프롬프트 ──────────────────────────────────────────────────────────
const SYSTEM_INSTRUCTION = `
당신은 "종이약국(Paper Pharmacy)"의 전문 AI 북큐레이터입니다.
사용자의 마음 계절(봄·여름·가을·겨울)과 감정 상태를 섬세하게 분석하고 그에 맞는 도서를 처방합니다.

[핵심 원칙]
1. 공감 우선 — 감정을 판단하지 않고, 있는 그대로 수용
2. 사용자가 입력한 "마음 계절: [계절]" 정보를 우선 확인하여 그 분위기에 맞는 도서를 선정할 것
   - 봄: 시작의 설렘 혹은 불안, 풋풋함과 여린 감정
   - 여름: 뜨거운 열정 혹은 번아웃, 강렬하고 에너지 넘치거나 지친 감정
   - 가을: 깊은 성찰 혹은 고독, 그리움과 차분한 감성
   - 겨울: 고요한 정적 혹은 무기력, 회복과 침잠의 시간
3. healing_message 필드에는 반드시 다음을 담을 것:
   - 사용자가 선택한 계절의 분위기와 감정을 자연스럽게 반영
   - 추천 도서 전체의 따뜻한 분위기를 담은 1~2문장의 다정한 응원 메시지
   - 계절의 이미지(예: 봄비, 여름 햇살, 가을 낙엽, 겨울 눈)를 은유적으로 활용 가능
   - 예시: "가을바람처럼 조용히 스며드는 이 책들이 당신의 마음 한켠을 따뜻하게 데워주기를 바랍니다."
4. 한국어로 읽을 수 있는 도서 우선 (번역서 포함)
5. 실존 도서만 추천 — 절대 가공의 책을 만들지 않음
6. 장르 다양성 — 아래 범주를 골고루 포함
7. 단계적 치유 흐름 제시

[추천 도서 범주 — 반드시 다양하게 포함할 것]
- 에세이, 소설, 시집, 자기계발 등 일반 문학/교양
- 그림책, 일러스트 에세이 (예: 《나의 아저씨에게》, 《오늘도 무사히》 등)
- 사진집, 도록, 예술서적 (예: 《마음의 지도》, 《배려하는 디자인》 등)
- 독립출판사 도서 (유어마인드, 언리미티드에디션, 미디어버스, 사월의눈, 이음, 봄날의박씨 등)
- 만화, 그래픽노블 (예: 《나의 레몬나무》, 《아버지의 뒤편》 등)

[추천 시 주의사항]
- 3~5권 추천하되, 최소 1권은 그림책/도록/예술서적/독립출판 도서 포함
- 실존하지 않는 책은 절대 추천 금지
- 출판사와 출간연도 필수 기재
- 가능하면 ISBN 13자리도 함께 제공
- 도서 제목, 저자, 출판사 정보는 최대한 정확히 작성
- genre 필드에 "그림책", "도록", "독립출판", "사진집", "그래픽노블" 등 구체적으로 표기
- 자해/자살 암시 시 반드시 "자살예방상담전화 109" 및 지역 정신건강복지센터/응급실 도움 문구 포함
- 반드시 JSON만 반환
- JSON 스키마를 반드시 지킬 것

[JSON 출력 형식 — 반드시 이 구조 그대로 반환]
{
  "emotional_analysis": { "detected_emotion": "감지된 감정", "intensity": "1~10", "empathy_message": "공감 메시지" },
  "healing_message": "응원 메시지",
  "recommended_books": [
    {
      "title": "도서 제목", "author": "저자명", "publisher": "출판사", "year": "출판연도",
      "isbn": "ISBN-13 또는 빈 문자열", "genre": "장르",
      "why_this_book": "추천 이유", "healing_point": "치유 포인트",
      "reading_guide": "읽기 가이드",
      "music_keyword": "어울리는 음악 키워드",
      "tags": []
    }
  ],
  "additional_care": { "activities": ["활동1", "활동2"], "professional_help": "" }
}

[출판 연도 기준]
- 2015년 이후 출판된 도서를 우선 추천할 것
- 고전·명작은 해당 감정에 반드시 필요한 경우에만 1권 이하로 포함
- 2020년대 도서가 절반 이상이 되도록 구성할 것

[음악 키워드]
- 각 도서마다 그 책의 분위기와 감정에 어울리는 음악 키워드를 music_keyword 필드에 작성할 것
- 유튜브에서 검색했을 때 실제로 나올 법한 구체적인 키워드로 작성 (예: "잔잔한 피아노 재즈", "빗소리 카페 bgm", "가을 보사노바", "숲속 자연음 명상")
- 책의 장르, 감정 톤, 독서 분위기를 반영할 것
- 한국어 또는 영어 키워드 모두 가능

[오디오북]
- 추천 도서 중 오디오북 서비스(밀리의서재, 윌라, 네이버 오디오클립)에서 제공되는 것으로 알려진 도서가 있다면
  tags 필드에 "오디오북_밀리" / "오디오북_윌라" / "오디오북_네이버" 중 해당하는 값을 포함할 것
- 확실하지 않은 경우 tags에 오디오북 관련 값을 넣지 말 것
`;

// ─── 유틸 함수 ────────────────────────────────────────────────────────────────
const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const toSafeString = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return fallback;
};

const toSafeNumber = (value: unknown, fallback = 0): number => {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value.trim())
      : NaN;

  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(10, n));
};

const normalizeIsbn = (value: unknown): string | undefined => {
  const raw = toSafeString(value);
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^0-9Xx-]/g, "").trim();
  return cleaned || undefined;
};

// ─── 503 판별 ────────────────────────────────────────────────────────────────
/**
 * @google/genai SDK의 ApiError는 503 정보를 여러 위치에 담을 수 있음.
 * 모든 경우를 커버하기 위해 다중 경로로 확인.
 *   err.status / err.httpStatus  (number 503)
 *   err.error.code               (number 503)
 *   err.error.status             (string "UNAVAILABLE")
 *   err.message                  (string "503" or "UNAVAILABLE" 포함)
 */
const is503Error = (err: unknown): boolean => {
  if (!isObject(err)) return false;
  if (err["status"] === 503 || err["httpStatus"] === 503) return true;
  if (isObject(err["error"])) {
    const e = err["error"];
    if (e["code"] === 503) return true;
    if (toSafeString(e["status"]).toUpperCase() === "UNAVAILABLE") return true;
  }
  const msg = toSafeString(err["message"]).toUpperCase();
  if (msg.includes("503") || msg.includes("UNAVAILABLE")) return true;
  return false;
};

// ─── 재시도 유틸 ──────────────────────────────────────────────────────────────
/**
 * 503 / UNAVAILABLE 에러에 한해 exponential backoff 재시도
 * @param fn       실행할 async 함수
 * @param retries  최대 재시도 횟수 (기본 3)
 * @param baseMs   초기 대기 ms (기본 1500, 이후 ×2 씩 증가)
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseMs = 1500,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;

      // 503이 아니거나 마지막 시도면 즉시 throw
      if (!is503Error(err) || attempt === retries) break;

      const waitMs = baseMs * Math.pow(2, attempt); // 1.5s → 3s → 6s
      console.warn(
        `[geminiService] 503 UNAVAILABLE — ${attempt + 1}/${retries} 재시도 (${waitMs}ms 후)`,
      );
      await new Promise((res) => setTimeout(res, waitMs));
    }
  }

  throw lastError;
}

// ─── 사용자 친화적 에러 메시지 변환 ──────────────────────────────────────────
export class GeminiUnavailableError extends Error {
  constructor() {
    super("Gemini 서버가 혼잡합니다. 잠시 후 다시 시도해주세요 🙏");
    this.name = "GeminiUnavailableError";
  }
}

// ─── 응답 정규화 ──────────────────────────────────────────────────────────────
const validateAndNormalizePrescription = (raw: unknown): Prescription => {
  if (!isObject(raw)) {
    throw new Error("AI 응답 형식이 올바르지 않습니다.");
  }

  const emotional = isObject(raw.emotional_analysis)
    ? raw.emotional_analysis
    : {};
  const additionalCare = isObject(raw.additional_care)
    ? raw.additional_care
    : {};

  const rawBooks = Array.isArray(raw.recommended_books)
    ? raw.recommended_books
    : [];

  if (rawBooks.length === 0) {
    throw new Error("추천 도서가 포함되지 않았습니다.");
  }

  const recommended_books = rawBooks
    .filter(isObject)
    .map((book) => ({
      title: toSafeString(book.title),
      author: toSafeString(book.author),
      publisher: toSafeString(book.publisher),
      year: toSafeString(book.year),
      isbn: normalizeIsbn(book.isbn),
      genre: toSafeString(book.genre),
      why_this_book: toSafeString(book.why_this_book),
      healing_point: toSafeString(book.healing_point),
      reading_guide: toSafeString(book.reading_guide),
      music_keyword: toSafeString(book.music_keyword) || undefined,
      tags: Array.isArray(book.tags) ? book.tags.map((t) => toSafeString(t)).filter(Boolean) : undefined,
    }))
    .filter(
      (book) =>
        book.title &&
        book.author &&
        book.publisher &&
        book.year &&
        book.genre &&
        book.why_this_book &&
        book.healing_point &&
        book.reading_guide,
    );

  if (recommended_books.length === 0) {
    throw new Error("유효한 추천 도서 데이터가 없습니다.");
  }

  const activities = Array.isArray(additionalCare.activities)
    ? additionalCare.activities
        .map((item) => toSafeString(item))
        .filter(Boolean)
    : [];

  return {
    emotional_analysis: {
      detected_emotion: toSafeString(emotional.detected_emotion, "복합 감정"),
      intensity: toSafeNumber(emotional.intensity, 5),
      empathy_message: toSafeString(
        emotional.empathy_message,
        "지금의 마음을 천천히 살펴볼 필요가 있습니다.",
      ),
    },
    healing_message: toSafeString(
      raw.healing_message,
      "당신의 마음 계절에 평온한 바람이 머물기를 바랍니다.",
    ),
    recommended_books,
    additional_care: {
      activities:
        activities.length > 0
          ? activities
          : ["가벼운 산책", "짧은 독서", "오늘 감정 한 줄 기록하기"],
      professional_help:
        toSafeString(additionalCare.professional_help) || undefined,
    },
  };
};

// ─── 메인 함수 ────────────────────────────────────────────────────────────────
export const getPrescription = async (
  userMetrics: string,
): Promise<Prescription> => {
  try {
    const rawApiKey = import.meta.env.VITE_GEMINI_API_KEY ?? "";
    const apiKey = rawApiKey.trim();

    if (!apiKey) {
      throw new Error("VITE_GEMINI_API_KEY가 없습니다.");
    }

    if (!/^[A-Za-z0-9_-]+$/.test(apiKey)) {
      throw new Error(
        "VITE_GEMINI_API_KEY 형식이 잘못되었습니다. 공백, 따옴표, 한글, 숨은 문자를 제거하세요.",
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // ✅ 503 자동 재시도 (최대 3회, 1.5s→3s→6s backoff)
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: userMetrics,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          temperature: 0.7,
        },
      }),
    );

    const text = response.text;
    if (!text) {
      throw new Error("AI 응답이 비어 있습니다.");
    }

    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return validateAndNormalizePrescription(parsed);
  } catch (error: unknown) {
    console.error("Error fetching prescription:", error);

    // 503 → 사용자 친화적 커스텀 에러로 변환
    if (is503Error(error)) throw new GeminiUnavailableError();

    throw error;
  }
};
