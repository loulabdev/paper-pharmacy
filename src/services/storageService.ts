import { Book, BookBookmark, SavedPrescription } from "../types";

const PRESCRIPTIONS_KEY = "paper_pharmacy_prescriptions";
const BOOKMARKS_KEY = "paper_pharmacy_bookmarks";

const isStorageAvailable = () => {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
};

export const getSavedPrescriptions = (): SavedPrescription[] => {
  if (!isStorageAvailable()) return [];

  try {
    const raw = localStorage.getItem(PRESCRIPTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("Failed to load prescriptions:", error);
    return [];
  }
};

export const savePrescriptionToStorage = (
  item: SavedPrescription
): SavedPrescription[] => {
  if (!isStorageAvailable()) return [];

  try {
    const current = getSavedPrescriptions();
    const updated = [item, ...current].slice(0, 20);
    localStorage.setItem(PRESCRIPTIONS_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error("Failed to save prescription:", error);
    return getSavedPrescriptions();
  }
};

export const deleteSavedPrescription = (id: string): SavedPrescription[] => {
  if (!isStorageAvailable()) return [];

  try {
    const current = getSavedPrescriptions();
    const updated = current.filter((item) => item.id !== id);
    localStorage.setItem(PRESCRIPTIONS_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error("Failed to delete prescription:", error);
    return getSavedPrescriptions();
  }
};

export const getBookBookmarks = (): BookBookmark[] => {
  if (!isStorageAvailable()) return [];

  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("Failed to load bookmarks:", error);
    return [];
  }
};

export const isBookBookmarked = (book: Book): boolean => {
  const bookmarks = getBookBookmarks();
  return bookmarks.some(
    (item) =>
      item.book.title === book.title &&
      item.book.author === book.author &&
      item.book.publisher === book.publisher
  );
};

export const toggleBookBookmark = (book: Book): BookBookmark[] => {
  if (!isStorageAvailable()) return [];

  try {
    const current = getBookBookmarks();

    const exists = current.some(
      (item) =>
        item.book.title === book.title &&
        item.book.author === book.author &&
        item.book.publisher === book.publisher
    );

    let updated: BookBookmark[];

    if (exists) {
      updated = current.filter(
        (item) =>
          !(
            item.book.title === book.title &&
            item.book.author === book.author &&
            item.book.publisher === book.publisher
          )
      );
    } else {
      const newBookmark: BookBookmark = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        book,
      };
      updated = [newBookmark, ...current];
    }

    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error("Failed to toggle bookmark:", error);
    return getBookBookmarks();
  }
};
export const resetAllStorage = () => {
  localStorage.removeItem("paper_pharmacy_bookmarks");
  localStorage.removeItem("paper_pharmacy_prescriptions");
};