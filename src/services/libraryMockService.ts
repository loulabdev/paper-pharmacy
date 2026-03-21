import { LibraryAvailability } from "../types";
import { Book } from "../types";

export const getMockLibrariesForBook = async (
  book: Book
): Promise<LibraryAvailability[]> => {

  console.log("도서관 mock 조회:", book.title);

  return [

    {
      libraryName: "대전한밭도서관",
      address: "대전광역시 중구 문화로 160",
      distanceKm: 2.1,
      hasBook: true,
      loanAvailable: true,
    },

    {
      libraryName: "유성도서관",
      address: "대전광역시 유성구 대학로 211",
      distanceKm: 4.4,
      hasBook: true,
      loanAvailable: false,
    },

    {
      libraryName: "서구도서관",
      address: "대전광역시 서구 둔산대로 201",
      distanceKm: 5.6,
      hasBook: false,
      loanAvailable: false,
    },

  ];

};