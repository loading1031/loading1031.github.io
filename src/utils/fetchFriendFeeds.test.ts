/**
 * `node --test` 로 돌린다 (`npm test`).
 *
 * 여기서 잡으려는 것은 "에러 없이 조용히 틀리는" 경우들이다. 남의 서버를 읽는
 * 코드라 죽거나 느려지는 게 정상이고, 그때 내 빌드가 같이 죽거나 화면이 이상해져도
 * 손으로는 알아채기 어렵다. 특히 **채널 제목을 첫 글 제목으로 잘못 집는 실수**는
 * 화면이 멀쩡해 보여서 더 그렇다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeed, fetchFriendFeeds } from "./fetchFriendFeeds.ts";

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>민수의 블로그</title>
  <link>https://example.com</link>
  <item>
    <title><![CDATA[첫 번째 글]]></title>
    <link>https://example.com/1</link>
  </item>
  <item>
    <title>두 번째 &amp; 글</title>
    <link>https://example.com/2</link>
  </item>
  <item><title>세 번째</title><link>https://example.com/3</link></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Jekyll 블로그</title>
  <link href="https://example.io/feed.xml" rel="self"/>
  <entry>
    <title>아톰 첫 글</title>
    <link href="https://example.io/a" rel="alternate"/>
  </entry>
  <entry>
    <title>아톰 둘째 글</title>
    <link href="https://example.io/b" rel="alternate"/>
  </entry>
</feed>`;

test("RSS 에서 제목과 주소를 뽑는다", () => {
  const feed = parseFeed(RSS, 3);
  assert.deepEqual(feed.items, [
    { title: "첫 번째 글", url: "https://example.com/1" },
    { title: "두 번째 & 글", url: "https://example.com/2" },
    { title: "세 번째", url: "https://example.com/3" },
  ]);
});

test("채널 제목을 첫 글 제목으로 착각하지 않는다", () => {
  assert.equal(parseFeed(RSS, 3).siteTitle, "민수의 블로그");
  assert.equal(parseFeed(ATOM, 3).siteTitle, "Jekyll 블로그");
});

test("Atom 도 읽는다 — link 가 href 속성에 있다", () => {
  const feed = parseFeed(ATOM, 3);
  assert.deepEqual(feed.items, [
    { title: "아톰 첫 글", url: "https://example.io/a" },
    { title: "아톰 둘째 글", url: "https://example.io/b" },
  ]);
});

test("limit 만큼만 자른다", () => {
  assert.equal(parseFeed(RSS, 2).items.length, 2);
});

test("CDATA 와 엔티티를 풀어 준다", () => {
  const feed = parseFeed(RSS, 3);
  assert.ok(!feed.items[0].title.includes("CDATA"));
  assert.equal(feed.items[1].title, "두 번째 & 글");
});

test("피드가 아닌 응답은 빈 목록이 된다", () => {
  assert.deepEqual(parseFeed("<html><title>404</title></html>", 3).items, []);
});

function fakeFetch(map: Record<string, string | Error>): typeof fetch {
  return (async (url: string) => {
    const body = map[url];
    if (body instanceof Error) throw body;
    if (body === undefined) return { ok: false, status: 404, statusText: "Not Found" };
    return { ok: true, text: async () => body };
  }) as unknown as typeof fetch;
}

test("맞팔인 사람만 읽는다 — 피드만 등록돼 있고 친구가 아니면 안 읽는다", async () => {
  const called: string[] = [];
  const impl = (async (url: string) => {
    called.push(url);
    return { ok: true, text: async () => RSS };
  }) as unknown as typeof fetch;

  await fetchFriendFeeds({
    feeds: { alice: "https://a/rss", bob: "https://b/rss" },
    only: ["alice"],
    limit: 3,
    fetchImpl: impl,
  });
  assert.deepEqual(called, ["https://a/rss"]);
});

test("한 곳이 죽어도 나머지는 나온다", async () => {
  const errors: string[] = [];
  const feeds = await fetchFriendFeeds({
    feeds: { alice: "https://a/rss", bob: "https://b/rss" },
    only: ["alice", "bob"],
    limit: 3,
    fetchImpl: fakeFetch({ "https://a/rss": RSS, "https://b/rss": new Error("죽음") }),
    onError: login => errors.push(login),
  });
  assert.deepEqual([...feeds.keys()], ["alice"]);
  assert.deepEqual(errors, ["bob"]);
});

test("전부 실패해도 빈 맵을 준다 — 빌드를 깨뜨리지 않는다", async () => {
  const feeds = await fetchFriendFeeds({
    feeds: { alice: "https://a/rss" },
    only: ["alice"],
    limit: 3,
    fetchImpl: fakeFetch({}),
  });
  assert.equal(feeds.size, 0);
});

test("글을 하나도 못 읽은 피드는 버린다 — 제목만 있는 껍데기를 띄우지 않는다", async () => {
  const feeds = await fetchFriendFeeds({
    feeds: { alice: "https://a/rss" },
    only: ["alice"],
    limit: 3,
    fetchImpl: fakeFetch({ "https://a/rss": "<rss><channel><title>빈 블로그</title></channel></rss>" }),
  });
  assert.equal(feeds.size, 0);
});
