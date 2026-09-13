/**
 * 친구 블로그의 최신 글을 RSS/Atom 에서 읽어오는 부분.
 *
 * 설정과 캐시는 `getFriendFeeds.ts` 가 들고, 여기는 **메커니즘만** 담는다.
 * 그래서 이 파일은 프로젝트 안의 어떤 모듈도 import 하지 않는다 — 덕분에
 * 테스트에서 `fetch` 를 갈아끼워 돌릴 수 있다 (`fetchFriendFeeds.test.ts`).
 *
 * 여기서 조용히 틀리면 미리보기만 이상해지고 에러는 안 난다. 남의 서버를 읽는
 * 일이라 언제든 죽거나 느려질 수 있고, 그때 **내 빌드가 같이 죽으면 안 된다.**
 * 그게 이 코드에 테스트가 붙어 있는 이유다.
 *
 * XML 파서를 따로 넣지 않는다. 피드는 형식이 좁아서 정규식으로 충분하고,
 * 이것 하나 때문에 의존성을 늘리고 싶지 않다. 못 읽으면 그 친구만 건너뛴다.
 */

export type FeedItem = { title: string; url: string };
export type FriendFeed = { login: string; siteTitle?: string; items: FeedItem[] };

export type FetchFriendFeedsOptions = {
  /** GitHub 아이디 → 피드 주소 */
  feeds: Record<string, string>;
  /** 이 목록에 있는 아이디만 읽는다(= 지금 맞팔인 사람). */
  only: string[];
  /** 친구당 최신 글 몇 개까지. */
  limit: number;
  /** 한 곳이 느려도 빌드가 멈추지 않게 하는 상한(ms). */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  onError?: (login: string, message: string) => void;
};

/** `<![CDATA[...]]>` 를 벗기고 기본 엔티티만 되돌린다. */
function decode(raw: string): string {
  return raw
    .replace(/^\s*<!\[CDATA\[/, "")
    .replace(/\]\]>\s*$/, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function firstTag(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decode(m[1]) : undefined;
}

/**
 * Atom 은 `<link href="...">` 이고 RSS 는 `<link>주소</link>` 다. 둘 다 본다.
 * Atom 에서는 `rel="alternate"` 가 글 본문 주소다.
 */
function itemUrl(block: string): string | undefined {
  const alt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
  if (alt) return alt[1];
  const href = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  if (href) return href[1];
  const text = firstTag(block, "link");
  return text || undefined;
}

/**
 * 피드 하나를 파싱한다. RSS(`<item>`) 와 Atom(`<entry>`) 을 모두 받는다.
 *
 * 채널 제목은 첫 `<item>`/`<entry>` **앞쪽**에서만 찾는다. 그러지 않으면
 * 첫 글 제목을 블로그 이름으로 잘못 집는다.
 */
export function parseFeed(xml: string, limit: number): Omit<FriendFeed, "login"> {
  const head = xml.split(/<(?:item|entry)[\s>]/i)[0];
  const siteTitle = firstTag(head, "title");

  const blocks = [...xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)].map(m => m[0]);

  const items: FeedItem[] = [];
  for (const block of blocks) {
    const title = firstTag(block, "title");
    const url = itemUrl(block);
    if (title && url) items.push({ title, url });
    if (items.length >= limit) break;
  }

  return { siteTitle, items };
}

/**
 * 등록된 친구들의 최신 글. 아이디 → 피드.
 *
 * 한 곳이 실패해도 나머지는 그대로 나온다. 전부 실패해도 빈 맵을 돌려주고
 * 빌드는 성공한다 — 친구 목록에서 미리보기만 빠진다.
 */
export async function fetchFriendFeeds({
  feeds,
  only,
  limit,
  timeoutMs = 8000,
  fetchImpl = fetch,
  onError,
}: FetchFriendFeedsOptions): Promise<Map<string, FriendFeed>> {
  const targets = only.filter(login => feeds[login]);

  const results = await Promise.all(
    targets.map(async (login): Promise<FriendFeed | null> => {
      // 남의 서버가 응답을 안 해도 빌드는 끝나야 한다.
      const controller =
        typeof AbortController !== "undefined" ? new AbortController() : undefined;
      const timer = controller
        ? setTimeout(() => controller.abort(), timeoutMs)
        : undefined;

      try {
        const res = await fetchImpl(feeds[login], {
          headers: { "User-Agent": "loading-log-build" },
          signal: controller?.signal,
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

        const xml = await res.text();
        const parsed = parseFeed(xml, limit);
        if (parsed.items.length === 0) throw new Error("글을 하나도 못 읽었다");

        return { login, ...parsed };
      } catch (error) {
        onError?.(login, error instanceof Error ? error.message : String(error));
        return null;
      } finally {
        if (timer) clearTimeout(timer);
      }
    })
  );

  return new Map(
    results.filter((f): f is FriendFeed => f !== null).map(f => [f.login, f])
  );
}
