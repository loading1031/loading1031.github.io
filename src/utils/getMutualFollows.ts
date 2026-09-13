/**
 * GitHub 맞팔 목록. **빌드 시점에** 한 번 읽어 HTML 에 박는다.
 *
 * 브라우저에서 직접 부르지 않는 이유는 두 가지다. 방문자마다 GitHub API 를
 * 때리면 미인증 한도(시간당 60회)를 금방 넘기고, 목록이 HTML 에 없으면
 * 검색 엔진에도 안 잡힌다.
 *
 * 따라서 목록은 **마지막 배포 시점 기준**이다. 새 맞팔은 다음 배포 때 반영된다.
 *
 * 토큰은 있으면 쓰고 없으면 안 쓴다 — 공개 데이터라 미인증으로도 읽히고,
 * 토큰은 한도를 올려 줄 뿐이다. CI 에서는 `deploy.yml` 이 `GITHUB_TOKEN` 을 넘긴다.
 *
 * 읽어오는 일 자체는 `fetchMutualFollows.ts` 에 있다(테스트가 붙어 있다).
 * 여기는 설정을 묶고 빌드 한 번에 한 번만 부르게 하는 껍데기다.
 */
import { FRIENDS, FRIENDS_ENABLED } from "@/data/friends";
import { fetchMutualFollows } from "./fetchMutualFollows";

let cached: Promise<string[]> | null = null;

export function getMutualFollows(): Promise<string[]> {
  cached ??= load();
  return cached;
}

async function load(): Promise<string[]> {
  if (!FRIENDS_ENABLED) return [];

  return fetchMutualFollows({
    username: FRIENDS.username,
    token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
    onError: message =>
      // 조용히 사라지면 왜 목록이 비었는지 알 수 없다. 빌드 로그에는 남긴다.
      // eslint-disable-next-line no-console
      console.warn(`[friends] 맞팔 목록을 읽지 못했습니다: ${message}`),
  });
}
