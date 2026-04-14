# 마음서가 (Mind Shelf)

사용자의 감정 상태를 바탕으로 맞춤형 한국어 도서를 추천하고,  
가까운 공공도서관의 소장 여부까지 연결해 주는 독서 처방 서비스입니다.

## 프로젝트 소개

**마음서가 (Mind Shelf)** 은 사용자가 입력한 감정, 고민, 마음 상태를 AI가 분석한 뒤  
그에 어울리는 한국어 도서를 추천하고,  
위치 기반으로 가까운 도서관에서 해당 도서를 찾을 수 있도록 돕는 웹 애플리케이션입니다.

단순한 책 추천이 아니라,  
**감정 분석 → 도서 추천 → 도서관 소장 조회 → 기록 저장**까지 이어지는 흐름을 중심으로 설계했습니다.

---

## 주요 기능

- 감정 입력 기반 AI 독서 처방 생성
- 한국어 도서 추천 및 추천 이유 제공
- 치유 포인트 / 읽기 가이드 / 인용문 제공
- 북마크 저장 기능
- 처방 기록 저장 기능
- 북마크 및 처방 기록 초기화 기능
- 위치 기반 가까운 도서관 조회
- 도서관 소장 여부 및 대출 가능 여부 표시
- 지도 보기 / 홈페이지 바로가기

---

## 기술 스택

### Frontend
- React
- TypeScript
- Vite

### API / Services
- Google Gemini API
- 도서관 정보나루 API

### 기타
- localStorage
- Geolocation API
- Lucide React Icons

---

## 폴더 구조

```bash
src/
  components/
    Header.tsx
    PrescriptionView.tsx
  services/
    geminiService.ts
    libraryService.ts
    locationService.ts
    storageService.ts
    bookCoverService.ts
  utils/
    distance.ts
  types.ts
  App.tsx
