/**
 * GitHub Discussions 에서 글별 댓글 수를 읽어오는 부분.
 *
 * 설정과 캐시는 `getCommentCounts.ts` 가 들고, 여기는 **메커니즘만** 담는다.
 * 그래서 이 파일은 프로젝트 안의 어떤 모듈도 import 하지 않는다 — 덕분에
 * 테스트에서 `fetch` 를 갈아끼워 돌릴 수 있다 (`fetchCommentCounts.test.ts`).
 *
 * 여기서 조용히 틀리면 목록의 숫자만 이상해지고 에러는 안 난다. 그게 이 코드에
 * 테스트가 붙어 있는 이유다.
 */

const ENDPOINT = "https://api.github.com/graphql";

const QUERY = `
query ($owner: String!, $name: String!, $categoryId: ID!, $after: String) {
  repository(owner: $owner, name: $name) {
    discussions(first: 100, after: $after, categoryId: $categoryId) {
      pageInfo { hasNextPage endCursor }
      nodes {
        title
        comments(first: 100) {
          totalCount
          nodes { replies { totalCount } }
        }
      }
    }
  }
}`;

export type DiscussionNode = {
  title: string;
  comments: {
    totalCount: number;
    nodes: { replies: { totalCount: number } }[];
  };
};

export type DiscussionPage = {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: DiscussionNode[];
};

export type GraphQLResponse = {
  data?: { repository?: { discussions?: DiscussionPage } };
  errors?: { message: string }[];
};

export type FetchCommentCountsOptions = {
  /** `owner/name` */
  repo: string;
  categoryId: string;
  token: string;
  /** 테스트에서 갈아끼운다. 기본은 전역 fetch. */
  fetchImpl?: typeof fetch;
  /** 실패를 알리는 곳. 기본은 조용히 무시. */
  onError?: (message: string) => void;
};

/**
 * 한 Discussion 의 댓글 수. 답글까지 센다 — 읽는 사람에게는 둘 다 "댓글"이다.
 *
 * 댓글이 100개를 넘는 글은 101번째부터의 답글이 합에서 빠진다. 그럴 일이 생기면
 * 그때 페이지네이션을 붙인다.
 */
export function countComments(node: DiscussionNode): number {
  const replies = node.comments.nodes.reduce(
    (sum, comment) => sum + comment.replies.totalCount,
    0
  );
  return node.comments.totalCount + replies;
}

/**
 * Discussion 제목 → 댓글 수.
 *
 * 실패하면 **빈 맵**을 돌려준다. 댓글 수를 못 읽었다고 빌드를 깨뜨리지 않는다 —
 * 목록에서 숫자만 빠진다.
 */
export async function fetchCommentCounts({
  repo,
  categoryId,
  token,
  fetchImpl = fetch,
  onError,
}: FetchCommentCountsOptions): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const [owner, name] = repo.split("/");

  let after: string | null = null;

  try {
    for (;;) {
      const res = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "loading-log-build",
        },
        body: JSON.stringify({
          query: QUERY,
          variables: { owner, name, categoryId, after },
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      const body: GraphQLResponse = await res.json();
      if (body.errors?.length) throw new Error(body.errors[0].message);

      const page = body.data?.repository?.discussions;
      if (!page) break;

      for (const node of page.nodes) {
        counts.set(node.title, countComments(node));
      }

      // endCursor 가 없는데 hasNextPage 가 참이면 같은 페이지를 영원히 다시 읽는다.
      // 빌드가 멈추는 것보다 숫자가 조금 빠지는 편이 낫다.
      if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) break;
      after = page.pageInfo.endCursor;
    }
  } catch (error) {
    onError?.(error instanceof Error ? error.message : String(error));
    return new Map();
  }

  return counts;
}
