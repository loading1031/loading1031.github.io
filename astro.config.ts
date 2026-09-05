import {
  defineConfig,
  envField,
  fontProviders,
  svgoOptimizer,
} from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { unified } from "@astrojs/markdown-remark";
import remarkToc from "remark-toc";
import remarkCollapse from "remark-collapse";
import rehypeCallouts from "rehype-callouts";
import rehypeMermaid from "rehype-mermaid";
import { rehypeMermaidLineBreaks } from "./src/utils/rehypeMermaidLineBreaks";
import { rehypeTermTooltips } from "./src/utils/rehypeTermTooltips";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { transformerFileName } from "./src/utils/transformers/fileName";
import config from "./astro-paper.config";

export default defineConfig({
  site: config.site.url,
  integrations: [
    mdx(),
    sitemap({
      filter: page =>
        config.features?.showArchives !== false || !page.endsWith("/archives/"),
    }),
  ],
  i18n: {
    locales: ["ko"],
    defaultLocale: "ko",
    routing: {
      prefixDefaultLocale: false,
    },
  },
  markdown: {
    processor: unified({
      remarkPlugins: [
        remarkToc,
        [remarkCollapse, { test: "Table of contents" }],
      ],
      rehypePlugins: [
        rehypeCallouts,
        // ```mermaid 블록을 빌드 타임에 SVG 로 렌더한다 (클라이언트 JS 0).
        // 색은 CSS 로 덮어쓰므로 여기서는 중립 테마로 뽑는다. src/styles/typography.css 참고.
        [
          rehypeMermaid,
          {
            strategy: "inline-svg",
            mermaidConfig: {
              theme: "base",
              // 빌드 시점에 텍스트 폭을 재는 폰트와 실제 렌더 폰트가 달라지면
              // 한글 라벨이 박스를 넘친다. 양쪽을 같은 스택으로 고정한다.
              fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
              themeVariables: { fontSize: "14px" },
            },
          },
        ],
        // rehype-mermaid 다음에 돌아야 한다 (그 결과 SVG 를 손본다)
        rehypeMermaidLineBreaks,
        // 용어 툴팁: [용어](#앵커 "설명") / <abbr title="설명">용어</abbr>
        rehypeTermTooltips,
      ],
    }),
    // mermaid 는 Shiki 가 코드로 하이라이팅하지 않게 빼둔다.
    // 그래야 rehype-mermaid 가 그 블록을 받아 SVG 로 바꾼다.
    syntaxHighlight: { type: "shiki", excludeLangs: ["mermaid"] },
    shikiConfig: {
      themes: { light: "min-light", dark: "night-owl" },
      defaultColor: false,
      wrap: false,
      transformers: [
        transformerFileName({ style: "v2", hideDot: false }),
        transformerNotationHighlight(),
        transformerNotationWordHighlight(),
        transformerNotationDiff({ matchAlgorithm: "v3" }),
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    {
      // 본문용 한글 폰트. 시스템 폰트로 폴백되도록 스택을 넉넉히 둔다.
      name: "Noto Sans KR",
      cssVariable: "--font-noto-sans-kr",
      provider: fontProviders.google(),
      fallbacks: [
        "Apple SD Gothic Neo",
        "-apple-system",
        "BlinkMacSystemFont",
        "system-ui",
        "sans-serif",
      ],
      weights: [400, 500, 700],
      styles: ["normal"],
      subsets: ["korean", "latin"],
    },
    {
      name: "Google Sans Code",
      cssVariable: "--font-google-sans-code",
      provider: fontProviders.google(),
      fallbacks: ["monospace"],
      weights: [300, 400, 500, 600, 700],
      styles: ["normal", "italic"],
      formats: ["woff", "ttf"],
    },
  ],
  env: {
    schema: {
      PUBLIC_GOOGLE_SITE_VERIFICATION: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),
    },
  },
  experimental: {
    svgOptimizer: svgoOptimizer(),
  },
});
