export interface Book {
  title: string;
  author: string;
  publisher: string;
  year: string | number;
  isbn?: string;
  genre: string;
  tags?: string[];
  why_this_book: string;
  healing_point: string;
  reading_guide: string;
  music_keyword?: string;
  quote?: string;
}

export interface EmotionalAnalysis {
  detected_emotion: string;
  intensity: number;
  empathy_message: string;
}

export interface AdditionalCare {
  activities: string[];
  professional_help?: string;
}

export interface Prescription {
  emotional_analysis: EmotionalAnalysis;
  healing_message: string;
  recommended_books: Book[];
  additional_care: AdditionalCare;
}

export interface SavedPrescription {
  id: string;
  createdAt: string;
  userInput: string;
  prescription: Prescription;
}

export interface BookBookmark {
  id: string;
  createdAt: string;
  book: Book;
}

export interface LibraryAvailability {
  libCode?: string;
  libraryName: string;
  address: string;
  homepage?: string;
  telephone?: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  hasBook: boolean;
  loanAvailable?: boolean;
  mapUrl?: string;
  foundByIsbn?: string;
}

// ============================================================
// [A] 판본 ISBN 수집 단계별 카운트 구조화
// ============================================================

export interface IsbnSourceStat {
  source: "원본ISBN" | "최신판검색" | "정보나루" | "국립중앙도서관";
  count: number;
  isbns: string[];
}

export interface IsbnCollectionStats {
  totalCount: number;
  sources: IsbnSourceStat[];
}

// ============================================================
// [D] 도서관 검색 메타 — "매칭 실패" vs "실제 미소장" 구분
// ============================================================

export interface LibrarySearchMeta {
  isbnCount: number;
  regionCount: number;
  isbnStats?: IsbnCollectionStats;
}

export enum AppState {
  IDLE = "IDLE",
  ANALYZING = "ANALYZING",
  PRESCRIBED = "PRESCRIBED",
  ERROR = "ERROR",
}