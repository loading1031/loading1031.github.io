/**
 * 댓글(giscus) 설정.
 *
 * 댓글은 이 레포의 GitHub Discussions 에 쌓인다. 글 하나 = Discussion 하나이고,
 * 짝은 `mapping: specific` 으로 맺는다 — Discussion 제목이 곧 글 경로다.
 *
 * ⚠️ pathname 매핑을 쓰지 않는 이유: 뷰 트랜지션으로 이동하면 주소가
 *    `/study/foo` (슬래시 없음), 새로고침하면 `/study/foo/` 가 되어
 *    같은 글에 Discussion 이 두 개 생긴다. 그래서 경로를 우리가 직접 정규화해
 *    term 으로 넘긴다.
 *
 * repoId / categoryId 는 비밀이 아니다. 클라이언트 번들에 그대로 들어간다.
 */
export const GISCUS = {
  repo: "loading1031/loading1031.github.io",
  repoId: "R_kgDOUPAB6g",
  /** 아무나 Discussion 을 새로 열지 못하게 Announcements 를 쓴다. 댓글은 누구나 달 수 있다. */
  category: "Announcements",
  categoryId: "DIC_kwDOUPAB6s4DFccO",
} as const;

/**
 * 글 URL → Discussion 제목(term).
 *
 * 목록의 댓글 수와 글 페이지의 giscus 가 **같은 문자열**을 써야 짝이 맞는다.
 * 양쪽 모두 이 함수를 거친다.
 *
 * `data-strict="1"` 을 켜 두는데, 이건 giscus 가 Discussion 을 **찾는** 방식만 바꾼다
 * (제목 부분일치 대신 본문에 심어둔 sha1 로 찾는다). 만들 때 제목은 여전히 이 term 그대로라
 * 제목으로 개수를 세는 `getCommentCounts()` 는 영향을 받지 않는다.
 * 끄면 `/section-3-internals/` 를 찾다가 `/section-3-internals-lab/` 이 걸릴 수 있다.
 */
export function commentTerm(postUrl: string): string {
  return postUrl.endsWith("/") ? postUrl : `${postUrl}/`;
}
