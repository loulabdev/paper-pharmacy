import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      port: 3000,
      host: "0.0.0.0",
      proxy: {
        // 네이버 책 API 프록시
        "/api/naver-book": {
          target: "https://openapi.naver.com",
          changeOrigin: true,
          rewrite: (reqPath) => {
            const url = new URL(reqPath, "http://localhost");
            const query = url.searchParams.get("query") || "";
            const display = url.searchParams.get("display") || "20";
            return `/v1/search/book.json?query=${encodeURIComponent(query)}&display=${display}&sort=date`;
          },
          headers: {
            "X-Naver-Client-Id": env.VITE_NAVER_CLIENT_ID || "",
            "X-Naver-Client-Secret": env.VITE_NAVER_CLIENT_SECRET || "",
          },
        },
        // 도서관 정보나루 API 프록시 (CORS 우회)
        "/api/library": {
          target: "https://data4library.kr",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/library/, "/api"),
        },
        // 국립중앙도서관 ISBN API 프록시
        "/api/nl-seoji": {
          target: "https://www.nl.go.kr",
          changeOrigin: true,
          rewrite: (reqPath) => {
            const url = new URL(reqPath, "http://localhost");
            const title = url.searchParams.get("title") || "";
            const pageSize = url.searchParams.get("page_size") || "20";
            const certKey = env.VITE_NL_SEOJI_KEY || "";
            return `/seoji/SearchApi.do?cert_key=${certKey}&result_style=json&page_no=1&page_size=${pageSize}&title=${encodeURIComponent(title)}`;
          },
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});