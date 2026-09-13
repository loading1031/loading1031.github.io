/**
 * GitHub 맞팔(서로 팔로우) 목록을 읽어오는 부분.
 *
 * 설정과 캐시는 `getMutualFollows.ts` 가 들고, 여기는 **메커니즘만** 담는다.
 * 그래서 이 파일은 프로젝트 안의 어떤 모듈도 import 하지 않는다 — 덕분에
 * 테스트에서 `fetch` 를 갈아끼워 돌릴 수 있다 (`fetchMutualFollows.test.ts`).
 *
 * 여기서 조용히 틀리면 친구 목록만 이상해지고 에러는 안 난다. 교집합을 뒤집어
 * 계산하거나 페이지네이션을 놓쳐도 빌드는 그대로 성공한다. 그게 이 코드에
 * 테스트가 붙어 있는 이유다.
 */

const API = "https://api.github.com";

/** 한 번에 받아올 수 있는 최대치. GitHub 이 정한 값이다. */
const PER_PAGE = 100;

/** 페이지를 무한히 도는 것을 막는 상한. 100 × 20 = 2,000명이면 충분하다. */
const MAX_PAGES = 20;

export type GitHubUser = { login: string };

export type FetchMutualFollowsOptions = {
  username: string;
  /** 있으면 rate limit 이 올라간다. 없어도 공개 데이터라 읽힌다. */
  token?: string;
  /** 테스트에서 갈아끼운다. 기본은 전역 fetch. */
  fetchImpl?: typeof fetch;
  /** 실패를 알리는 곳. 기본은 조용히 무시. */
  onError?: (message: string) => void;
};

/**
 * 한 목록(`followers` 또는 `following`)을 끝까지 읽는다.
 *
 * GitHub 은 `per_page` 만큼 채워 주고, 마지막 페이지는 그보다 적게 온다.
 * 그래서 "받은 개수가 `per_page` 보다 적으면 끝"으로 판정한다.
 */
async function fetchAll(
  url: string,
  fetchImpl: typeof fetch,
  headers: Record<string, string>
): Promise<string[]> {
  const logins: string[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchImpl(`${url}?per_page=${PER_PAGE}&page=${page}`, {
      headers,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

    const users: GitHubUser[] = await res.json();
    if (!Array.isArray(users)) throw new Error("배열이 아닌 응답");

    for (const user of users) {
      if (user?.login) logins.push(user.login);
    }

    if (users.length < PER_PAGE) break;
  }

  return logins;
}

/**
 * 서로 팔로우하는 사람들의 GitHub 아이디. 알파벳순으로 돌려준다.
 *
 * 실패하면 **빈 배열**을 돌려준다. 친구 목록을 못 읽었다고 빌드를 깨뜨리지 않는다 —
 * 페이지에서 목록만 빠지고 팔로우 버튼은 그대로 남는다.
 */
export async function fetchMutualFollows({
  username,
  token,
  fetchImpl = fetch,
  onError,
}: FetchMutualFollowsOptions): Promise<string[]> {
  if (!username) return [];

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "loading-log-build",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    // 한쪽만 읽어서는 맞팔을 알 수 없다. 둘 다 필요하다.
    const [followers, following] = await Promise.all([
      fetchAll(`${API}/users/${username}/followers`, fetchImpl, headers),
      fetchAll(`${API}/users/${username}/following`, fetchImpl, headers),
    ]);

    const followerSet = new Set(followers);
    const mutual = following.filter(login => followerSet.has(login));

    // 중복 제거 후 정렬. 순서가 배포마다 흔들리면 diff 가 지저분해진다.
    return [...new Set(mutual)].sort((a, b) => a.localeCompare(b));
  } catch (error) {
    onError?.(error instanceof Error ? error.message : String(error));
    return [];
  }
}
