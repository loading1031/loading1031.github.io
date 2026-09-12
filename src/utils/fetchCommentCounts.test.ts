/**
 * `node --test` 로 돌린다 (`npm test`). Node 24 가 TS 를 그대로 읽어서 러너도
 * 의존성도 따로 없다.
 *
 * 여기서 잡으려는 것은 "에러 없이 조용히 틀리는" 경우들이다. 댓글 수가 틀려도
 * 빌드는 성공하고 페이지도 잘 뜨기 때문에, 손으로는 알아채기 어렵다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countComments,
  fetchCommentCounts,
  type DiscussionNode,
  type DiscussionPage,
} from "./fetchCommentCounts.ts";

function node(
  title: string,
  topLevel: number,
  replies: number[] = []
): DiscussionNode {
  return {
    title,
    comments: {
      totalCount: topLevel,
      nodes: replies.map(n => ({ replies: { totalCount: n } })),
    },
  };
}

function page(
  nodes: DiscussionNode[],
  endCursor: string | null
): DiscussionPage {
  return {
    pageInfo: { hasNextPage: endCursor !== null, endCursor },
    nodes,
  };
}

/** 페이지를 순서대로 돌려주는 가짜 fetch. 호출될 때마다 다음 페이지. */
function fakeFetch(pages: DiscussionPage[]) {
  const calls: (string | null)[] = [];
  const impl = (async (_url: string, init: { body: string }) => {
    calls.push(JSON.parse(init.body).variables.after);
    const current = pages[calls.length - 1];
    return {
      ok: true,
      json: async () => ({ data: { repository: { discussions: current } } }),
    };
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const base = { repo: "o/n", categoryId: "cat", token: "t" };

test("답글까지 더해서 센다", () => {
  // 최상위 댓글 2개, 그 중 하나에 답글 3개 → 5
  assert.equal(countComments(node("/a/", 2, [3, 0])), 5);
  assert.equal(countComments(node("/a/", 0, [])), 0);
});

test("Discussion 제목을 키로 돌려준다", async () => {
  const { impl } = fakeFetch([
    page([node("/study/a/", 1), node("/study/b/", 0)], null),
  ]);
  const counts = await fetchCommentCounts({ ...base, fetchImpl: impl });

  // 이 키는 commentTerm() 이 만드는 경로와 글자 단위로 같아야 한다.
  // 어긋나면 목록 숫자가 조용히 0 이 된다.
  assert.deepEqual(
    [...counts],
    [
      ["/study/a/", 1],
      ["/study/b/", 0],
    ]
  );
});

test("다음 페이지가 있으면 커서를 넘겨 이어 읽는다", async () => {
  const { impl, calls } = fakeFetch([
    page([node("/a/", 1)], "CURSOR1"),
    page([node("/b/", 2)], null),
  ]);
  const counts = await fetchCommentCounts({ ...base, fetchImpl: impl });

  assert.deepEqual(calls, [null, "CURSOR1"]);
  assert.equal(counts.get("/b/"), 2);
});

test("커서 없이 hasNextPage 만 참이면 멈춘다 (무한 루프 방지)", async () => {
  // endCursor 가 null 이면 같은 페이지를 영원히 다시 읽게 된다. 빌드가 멈추는 것보다
  // 숫자가 빠지는 게 낫다.
  const { impl, calls } = fakeFetch([
    {
      pageInfo: { hasNextPage: true, endCursor: null },
      nodes: [node("/a/", 1)],
    },
  ]);
  const counts = await fetchCommentCounts({ ...base, fetchImpl: impl });

  assert.equal(calls.length, 1);
  assert.equal(counts.get("/a/"), 1);
});

test("HTTP 실패는 빈 맵으로 삼킨다 — 빌드를 깨뜨리지 않는다", async () => {
  const impl = (async () => ({
    ok: false,
    status: 401,
    statusText: "Unauthorized",
  })) as unknown as typeof fetch;
  const errors: string[] = [];

  const counts = await fetchCommentCounts({
    ...base,
    fetchImpl: impl,
    onError: m => errors.push(m),
  });

  assert.equal(counts.size, 0);
  assert.match(errors[0], /401/);
});

test("GraphQL 에러도 빈 맵으로 삼킨다", async () => {
  const impl = (async () => ({
    ok: true,
    json: async () => ({ errors: [{ message: "Bad credentials" }] }),
  })) as unknown as typeof fetch;
  const errors: string[] = [];

  const counts = await fetchCommentCounts({
    ...base,
    fetchImpl: impl,
    onError: m => errors.push(m),
  });

  assert.equal(counts.size, 0);
  assert.deepEqual(errors, ["Bad credentials"]);
});

test("첫 페이지에서 깨져도 앞서 읽은 걸 흘리지 않고 빈 맵을 준다", async () => {
  // 반쯤 읽다 실패하면 "일부만 맞는 숫자"가 되는데, 그건 틀린 숫자보다 알아채기 어렵다.
  let call = 0;
  const impl = (async () => {
    call += 1;
    if (call === 1) {
      return {
        ok: true,
        json: async () => ({
          data: { repository: { discussions: page([node("/a/", 5)], "C1") } },
        }),
      };
    }
    return { ok: false, status: 502, statusText: "Bad Gateway" };
  }) as unknown as typeof fetch;

  const counts = await fetchCommentCounts({ ...base, fetchImpl: impl });
  assert.equal(counts.size, 0);
});
