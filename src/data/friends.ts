/**
 * "친구" = GitHub 맞팔.
 *
 * GitHub 에는 친구라는 개념이 없다. 팔로우가 **단방향**이고, 서로 팔로우해도
 * 그런 상태를 알려주는 API 가 따로 없다. 그래서 이 블로그가 직접 만든다 —
 * 공개 API 로 팔로워와 팔로잉을 각각 읽어 **교집합**을 구하면 그게 맞팔이다.
 *
 * 빌드 시점에 한 번 읽어 HTML 에 박는다(댓글 수와 같은 방식). 따라서 목록은
 * **마지막 배포 시점 기준**이고, 새 맞팔은 다음 배포 때 반영된다.
 *
 * `username` 을 비우면 친구 페이지도 사이드바 링크도 나가지 않는다.
 */

export const FRIENDS = {
  /** 맞팔을 계산할 GitHub 사용자명. 비우면 기능 전체가 꺼진다. */
  username: "loading1031",

  /** 친구 페이지에 최신 글을 몇 개까지 보여줄지. */
  postsPerFriend: 3,
} as const;

export const FRIENDS_ENABLED = FRIENDS.username.length > 0;

/**
 * 친구별 블로그.
 *
 * **맞팔 목록은 자동으로 구하지만 블로그 주소는 여기 손으로 적는다.** 자동으로
 * 찾으려면 빌드마다 남의 서버를 여러 경로로 찔러 봐야 하는데, 느리고 잘 깨지고
 * 무엇보다 실례다.
 *
 * `feed` 가 있으면 최신 글까지 보여주고, 없으면 블로그 링크만 건다.
 * 여기 없는 친구는 GitHub 프로필 링크만 나간다.
 *
 * 키는 GitHub 아이디다. 맞팔이 아니게 되면 여기 남아 있어도 화면에는 안 나온다.
 *
 * 피드가 흔히 있는 자리:
 *   velog     https://v2.velog.io/rss/@<아이디>
 *   티스토리   https://<주소>/rss
 *   Medium    https://medium.com/feed/@<아이디>
 *   Jekyll    https://<주소>/feed.xml
 *   네이버     https://rss.blog.naver.com/<아이디>.xml
 */
export type FriendSite = { url: string; feed?: string };

export const FRIEND_SITES: Record<string, FriendSite> = {
  "Aftermoon-dev": { url: "https://aftermoon.dev" },
  destiny3912: {
    url: "https://velog.io/@destiny3912",
    feed: "https://v2.velog.io/rss/@destiny3912",
  },
  EunsuSeo01: {
    url: "https://tobeforest.tistory.com",
    feed: "https://tobeforest.tistory.com/rss",
  },
  jrary: {
    url: "https://medium.com/@kijrary",
    feed: "https://medium.com/feed/@kijrary",
  },
  // 테마 데모 글만 있고 직접 쓴 글이 아직 없다. 글이 올라오면 feed 를 붙인다.
  learntosurf: { url: "https://learntosurf.github.io" },
  Mingguriguri: {
    url: "https://minsllogg.tistory.com",
    feed: "https://minsllogg.tistory.com/rss",
  },
  sangyup12: {
    url: "https://sangyup12.github.io",
    feed: "https://sangyup12.github.io/feed.xml",
  },
};

/** 피드가 등록된 친구만 추린다. */
export function feedMap(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(FRIEND_SITES)
      .filter(([, site]) => site.feed)
      .map(([login, site]) => [login, site.feed!])
  );
}

/** 친구 목록에서 아이디를 눌렀을 때 갈 곳. */
export function githubProfileUrl(login: string): string {
  return `https://github.com/${login}`;
}
