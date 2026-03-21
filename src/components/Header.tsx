import React from "react";
import { BookOpen, RotateCcw } from "lucide-react";

interface HeaderProps {
  onResetStorage?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onResetStorage }) => {
  return (
    <header className="border-b border-paper-200 bg-paper-50">
      <div className="container mx-auto px-4 py-8 md:py-10">
        <div className="relative flex flex-col items-center justify-center text-center">
          {onResetStorage && (
            <button
              type="button"
              onClick={onResetStorage}
              className="absolute right-0 top-0 inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-sm text-red-700 transition hover:bg-red-50"
            >
              <RotateCcw className="h-4 w-4" />
              기록 초기화
            </button>
          )}

          <div className="inline-flex items-center gap-3 text-ink-900">
            <BookOpen className="h-10 w-10 md:h-12 md:w-12 text-paper-800" />
            <h1 className="font-serif text-4xl md:text-6xl font-bold tracking-tight">
              종이약국
            </h1>
          </div>

          <p className="mt-4 font-serif text-2xl md:text-3xl italic text-paper-800">
            Paper Pharmacy
          </p>

          <p className="mt-8 text-xl md:text-3xl leading-relaxed text-ink-800/70">
            당신의 마음을 읽고, 문장을 처방합니다.
            <br />
            오늘 당신의 마음 날씨는 어떤가요?
          </p>
        </div>
      </div>
    </header>
  );
};