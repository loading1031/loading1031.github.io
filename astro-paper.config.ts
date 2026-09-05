import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    url: "https://loading1031.github.io/",
    title: "loading.log",
    description:
      "공부하며 정리한 기록과 Claude와 나눈 대화에서 건진 인사이트를 모아둔 곳.",
    author: "윤로딩",
    profile: "https://github.com/loading1031",
    lang: "ko",
    timezone: "Asia/Seoul",
    dir: "ltr",
    // 동적 OG 생성은 한글 서브셋 폰트 문제로 끄고 정적 카드를 쓴다.
    ogImage: "default-og.png",
  },
  posts: {
    perPage: 10,
    perIndex: 5,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: false,
    showArchives: true,
    showBackButton: true,
    editPost: { enabled: false },
    search: "pagefind",
  },
  socials: [
    { name: "github", url: "https://github.com/loading1031" },
    { name: "mail", url: "mailto:tjdans1031@gmail.com" },
  ],
  shareLinks: [
    { name: "x", url: "https://x.com/intent/post?url=" },
    { name: "facebook", url: "https://www.facebook.com/sharer.php?u=" },
    { name: "mail", url: "mailto:?subject=이 글 봐봐&body=" },
  ],
});
