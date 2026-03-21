export const getBookCoverUrl = async (
  title: string,
  author?: string
): Promise<string | null> => {

  try {

    const query = encodeURIComponent(
      author
        ? `intitle:${title} inauthor:${author}`
        : `intitle:${title}`
    );

    const response = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`
    );

    if (!response.ok) {
      throw new Error("표지 검색 실패");
    }

    const data = await response.json();

    const item = data.items?.[0];
    const imageLinks = item?.volumeInfo?.imageLinks;

    return (
      imageLinks?.thumbnail ||
      imageLinks?.smallThumbnail ||
      null
    );

  } catch (error) {

    console.error("표지 이미지 조회 오류:", error);

    return null;
  }

};