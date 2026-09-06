import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { getSortedPosts } from "@/utils/getSortedPosts";
import { getPostUrl } from "@/utils/getPostPaths";
import { ALL_SECTIONS, sectionPathOf } from "@/data/sections";
import config from "@/config";

/**
 * llms.txt — LLM 크롤러가 사이트를 훑을 때 읽는 요약 파일.
 * https://llmstxt.org 의 제안 형식을 따른다.
 *
 * 글이 늘면 빌드할 때마다 알아서 갱신된다. 손으로 관리하지 않는다.
 */
export const GET: APIRoute = async ({ site }) => {
  const base = (site ?? new URL(config.site.url)).href.replace(/\/$/, "");
  const posts = getSortedPosts(await getCollection("posts"));

  const lines: string[] = [
    `# ${config.site.title}`,
    "",
    `> ${config.site.description}`,
    "",
    `${config.site.author} 가 공부하며 정리한 기록입니다.`,
    "개념 정리 글과, 그 주장을 직접 돌려서 확인한 실습 글이 짝을 이룹니다.",
    "실습 글의 출력은 모두 실제로 실행해 받은 결과입니다.",
    "",
  ];

  for (const section of ALL_SECTIONS) {
    const inSection = posts.filter(p => sectionPathOf(p.id) === section.path);
    if (inSection.length === 0) continue;
    lines.push(`## ${section.label}`, "", `${section.description}`, "");
    for (const post of inSection) {
      const url = `${base}${getPostUrl(post.id, post.filePath)}`;
      lines.push(`- [${post.data.title}](${url}): ${post.data.description}`);
    }
    lines.push("");
  }

  lines.push("## 그 밖에", "");
  lines.push(`- [전체 글 목록](${base}/archives/)`);
  lines.push(`- [RSS](${base}/rss.xml)`);
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
