export interface Book {
  title: string;
  author: string;
  publisher: string;
  year: string | number;
  isbn?: string;
  genre: string;
  why_this_book: string;
  healing_point: string;
  reading_guide: string;
  quote: string;
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
}

export enum AppState {
  IDLE = "IDLE",
  ANALYZING = "ANALYZING",
  PRESCRIBED = "PRESCRIBED",
  ERROR = "ERROR",
}