import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Prescription } from "../types";

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
          quote: { type: Type.STRING },
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
          "quote",
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
  required: ["emotional_analysis", "recommended_books", "additional_care"],
};

const SYSTEM_INSTRUCTION = `
당신은 "종이약국(Paper Pharmacy)"의 전문 AI 북큐레이터입니다.
사용자의 감정 상태를 섬세하게 분석하고 그에 맞는 한국어 도서를 추천합니다.

핵심 원칙:
1. 공감 우선
2. 한국어 도서 우선
3. 실존 도서만 추천
4. 장르 다양성 확보
5. 단계적 치유 흐름 제시

중요 규칙:
- 실존하지 않는 책은 절대 추천 금지
- 출판사와 출간연도 필수 기재
- 가능하면 ISBN 13자리도 함께 제공
- 도서 제목, 저자, 출판사 정보는 최대한 정확히 작성
- 자해/자살 암시 시 반드시 "자살예방상담전화 109" 및 지역 정신건강복지센터/응급실 도움 문구 포함
- 반드시 JSON만 반환
- JSON 스키마를 반드시 지킬 것
`;

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

const validateAndNormalizePrescription = (raw: unknown): Prescription => {
  if (!isObject(raw)) {
    throw new Error("AI 응답 형식이 올바르지 않습니다.");
  }

  const emotional = isObject(raw.emotional_analysis)
    ? raw.emotional_analysis
    : {};
  const additionalCare = isObject(raw.additional_care) ? raw.additional_care : {};

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
      quote: toSafeString(book.quote),
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
        book.reading_guide &&
        book.quote
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
        "지금의 마음을 천천히 살펴볼 필요가 있습니다."
      ),
    },
    recommended_books,
    additional_care: {
      activities:
        activities.length > 0
          ? activities
          : ["가벼운 산책", "짧은 독서", "오늘 감정 한 줄 기록하기"],
      professional_help: toSafeString(additionalCare.professional_help) || undefined,
    },
  };
};

export const getPrescription = async (
  userMetrics: string
): Promise<Prescription> => {
  try {
    const rawApiKey = import.meta.env.VITE_GEMINI_API_KEY ?? "";
    const apiKey = rawApiKey.trim();

    if (!apiKey) {
      throw new Error("VITE_GEMINI_API_KEY가 없습니다.");
    }

    if (!/^[A-Za-z0-9_-]+$/.test(apiKey)) {
      throw new Error(
        "VITE_GEMINI_API_KEY 형식이 잘못되었습니다. 공백, 따옴표, 한글, 숨은 문자를 제거하세요."
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userMetrics,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: prescriptionSchema,
        temperature: 0.7,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("AI 응답이 비어 있습니다.");
    }

    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return validateAndNormalizePrescription(parsed);
  } catch (error) {
    console.error("Error fetching prescription:", error);
    throw error;
  }
};