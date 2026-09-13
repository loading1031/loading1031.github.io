/**
 * `node --test` 로 돌린다 (`npm test`). Node 24 가 TS 를 그대로 읽어서 러너도
 * 의존성도 따로 없다.
 *
 * 여기서 잡으려는 것은 "에러 없이 조용히 틀리는" 경우들이다. 친구 목록이 틀려도
 * 빌드는 성공하고 페이지도 잘 뜨기 때문에, 손으로는 알아채기 어렵다.
 * 특히 교집합을 한쪽만 보고 계산하면 **팔로워 전부가 친구로 뜬다** — 그래도
 * 화면은 멀쩡해 보인다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchMutualFollows } from "./fetchMutualFollows.ts";

/** `?page=N` 을 보고 해당 페이지를 돌려주는 가짜 fetch. */
function fakeGitHub(data: {
  followers: string[][];
  following: string[][];
}): { impl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(url);
    const page = Number(new URL(url).searchParams.get("page") ?? "1");
    const which = url.includes("/followers") ? "followers" : "following";
    const chunk = data[which][page - 1] ?? [];
    return {
      ok: true,
      json: async () => chunk.map(login => ({ login })),
    };
  }) as unknown as typeof fetch;
  return { impl, calls };
}

test("양쪽에 다 있는 사람만 친구다", async () => {
  const { impl } = fakeGitHub({
    followers: [["alice", "bob", "carol"]],
    following: [["bob", "carol", "dave"]],
  });
  const mutual = await fetchMutualFollows({ username: "me", fetchImpl: impl });
  assert.deepEqual(mutual, ["bob", "carol"]);
});

test("한쪽만 팔로우하는 사람은 빠진다", async () => {
  const { impl } = fakeGitHub({
    followers: [["alice"]],
    following: [["dave"]],
  });
  const mutual = await fetchMutualFollows({ username: "me", fetchImpl: impl });
  assert.deepEqual(mutual, []);
});

test("알파벳순으로 정렬한다 — 순서가 흔들리면 배포마다 diff 가 난다", async () => {
  const { impl } = fakeGitHub({
    followers: [["zoe", "adam", "mike"]],
    following: [["mike", "zoe", "adam"]],
  });
  const mutual = await fetchMutualFollows({ username: "me", fetchImpl: impl });
  assert.deepEqual(mutual, ["adam", "mike", "zoe"]);
});

test("100명이 넘으면 다음 페이지까지 읽는다", async () => {
  const first = Array.from({ length: 100 }, (_, i) => `user${i}`);
  const { impl, calls } = fakeGitHub({
    followers: [first, ["tail"]],
    following: [first, ["tail"]],
  });
  const mutual = await fetchMutualFollows({ username: "me", fetchImpl: impl });
  assert.equal(mutual.length, 101);
  assert.ok(mutual.includes("tail"), "2페이지의 사람이 빠졌다");
  assert.ok(
    calls.some(u => u.includes("page=2")),
    "2페이지를 아예 안 읽었다"
  );
});

test("정확히 100명 미만이면 다음 페이지를 부르지 않는다", async () => {
  const { impl, calls } = fakeGitHub({
    followers: [["alice"]],
    following: [["alice"]],
  });
  await fetchMutualFollows({ username: "me", fetchImpl: impl });
  assert.ok(!calls.some(u => u.includes("page=2")), "쓸데없이 더 불렀다");
});

test("HTTP 실패는 빈 배열로 삼킨다 — 빌드를 깨뜨리지 않는다", async () => {
  const impl = (async () => ({
    ok: false,
    status: 403,
    statusText: "rate limit exceeded",
  })) as unknown as typeof fetch;

  let reported = "";
  const mutual = await fetchMutualFollows({
    username: "me",
    fetchImpl: impl,
    onError: m => (reported = m),
  });
  assert.deepEqual(mutual, []);
  assert.match(reported, /403/);
});

test("배열이 아닌 응답도 빈 배열로 삼킨다", async () => {
  const impl = (async () => ({
    ok: true,
    json: async () => ({ message: "Not Found" }),
  })) as unknown as typeof fetch;

  const mutual = await fetchMutualFollows({ username: "me", fetchImpl: impl });
  assert.deepEqual(mutual, []);
});

test("사용자명이 비어 있으면 아무것도 부르지 않는다", async () => {
  let called = false;
  const impl = (async () => {
    called = true;
    return { ok: true, json: async () => [] };
  }) as unknown as typeof fetch;

  const mutual = await fetchMutualFollows({ username: "", fetchImpl: impl });
  assert.deepEqual(mutual, []);
  assert.equal(called, false);
});

test("중복이 있어도 한 번만 센다", async () => {
  const { impl } = fakeGitHub({
    followers: [["bob", "bob"]],
    following: [["bob", "bob"]],
  });
  const mutual = await fetchMutualFollows({ username: "me", fetchImpl: impl });
  assert.deepEqual(mutual, ["bob"]);
});
