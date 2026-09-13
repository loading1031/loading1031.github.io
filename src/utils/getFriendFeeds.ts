/**
 * 친구 블로그의 최신 글. **빌드 시점에** 한 번 읽어 HTML 에 박는다.
 *
 * 브라우저에서 직접 부르면 남의 서버가 CORS 를 열어 줘야 하고(대개 안 열려 있다),
 * 방문자마다 남의 블로그를 때리게 된다. 그래서 빌드가 한 번 대신 읽는다.
 *
 * 따라서 미리보기는 **마지막 배포 시점 기준**이다.
 *
 * 읽어오는 일 자체는 `fetchFriendFeeds.ts` 에 있다(테스트가 붙어 있다).
 * 여기는 설정을 묶고 빌드 한 번에 한 번만 부르게 하는 껍데기다.
 */
import { FRIENDS, feedMap } from "@/data/friends";
import { fetchFriendFeeds, type FriendFeed } from "./fetchFriendFeeds";
import { getMutualFollows } from "./getMutualFollows";

let cached: Promise<Map<string, FriendFeed>> | null = null;

export function getFriendFeeds(): Promise<Map<string, FriendFeed>> {
  cached ??= load();
  return cached;
}

async function load(): Promise<Map<string, FriendFeed>> {
  const mutual = await getMutualFollows();
  if (mutual.length === 0) return new Map();

  return fetchFriendFeeds({
    feeds: feedMap(),
    only: mutual,
    limit: FRIENDS.postsPerFriend,
    onError: (login, message) =>
      // 남의 블로그가 죽는 건 흔한 일이라 빌드를 세우지 않는다. 로그에만 남긴다.
      // eslint-disable-next-line no-console
      console.warn(`[friends] ${login} 의 피드를 읽지 못했습니다: ${message}`),
  });
}
