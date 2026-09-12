/**
 * 글별 댓글 수. **빌드 시점에** GitHub Discussions 를 한 번 읽어 캐시한다.
 *
 * 목록에서 댓글 수를 보여주려면 숫자가 HTML 에 박혀 있어야 한다. giscus 는
 * 로그인 없이 개수만 세어주는 공개 API 가 없고, GitHub GraphQL 은 토큰을 요구하므로
 * 브라우저에서 직접 부를 수 없다(토큰이 노출된다). 그래서 빌드가 대신 읽는다.
 *
 * 따라서 목록의 숫자는 **마지막 배포 시점 기준**이다. 새 댓글은 다음 배포 때 반영된다.
 * 정확한 최신 숫자는 글 페이지의 giscus 가 보여준다.
 *
 * 토큰이 없으면(로컬 개발 등) 빈 맵을 돌려주고 목록에는 아무것도 뜨지 않는다.
 * CI 에서는 `.github/workflows/deploy.yml` 이 `GITHUB_TOKEN` 을 넘겨준다.
 *
 * 읽어오는 일 자체는 `fetchCommentCounts.ts` 에 있다(테스트가 붙어 있다).
 * 여기는 설정을 묶고 빌드 한 번에 한 번만 부르게 하는 껍데기다.
 */
import { GISCUS } from "@/data/comments";
import { fetchCommentCounts } from "./fetchCommentCounts";

/** Discussion 제목(= `commentTerm()` 이 만든 경로) → 댓글 수 */
let cached: Promise<Map<string, number>> | null = null;

export function getCommentCounts(): Promise<Map<string, number>> {
  cached ??= load();
  return cached;
}

async function load(): Promise<Map<string, number>> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) return new Map();

  return fetchCommentCounts({
    repo: GISCUS.repo,
    categoryId: GISCUS.categoryId,
    token,
    onError: message =>
      // 조용히 사라지면 왜 숫자가 없는지 알 수 없다. 빌드 로그에는 남긴다.
      // eslint-disable-next-line no-console
      console.warn(`[comments] 댓글 수를 읽지 못했습니다: ${message}`),
  });
}
