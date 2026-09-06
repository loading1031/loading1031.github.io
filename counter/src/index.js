/**
 * 방문자 카운터 Worker.
 *
 * 중복 제거는 브라우저가 localStorage 로 한다. 이 Worker 는 IP 를 보지 않고
 * "1 더해라"만 받는다. 그래서 개인정보를 아예 저장하지 않는다.
 *
 *   POST /hit?p=/study/database/foo/   오늘 처음 방문일 때만 (브라우저가 판단)
 *   GET  /views?p=/study/database/foo/ 숫자만 읽기
 *   GET  /stats                        내가 볼 전체 통계
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 사이트 타임존(Asia/Seoul) 기준 날짜. 클라이언트도 같은 계산을 쓴다. */
function kstDay(now = Date.now()) {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 경로를 정규화한다. 여기서 걸러야 쓰레기 행이 쌓이지 않는다.
 * 반환값은 항상 슬래시로 시작하고 슬래시로 끝난다.
 */
function normalizePath(raw) {
  if (!raw) return null;
  let p;
  try {
    p = decodeURIComponent(raw);
  } catch {
    return null;
  }
  p = p.split("?")[0].split("#")[0];
  if (!p.startsWith("/") || p.includes("..") || p.includes("//")) return null;
  if (!p.endsWith("/")) p += "/";
  if (p.length > 200) return null;
  // 세그먼트마다 문자·숫자·`._~-` 만 허용 (한글 슬러그도 통과)
  if (!/^\/(?:[\p{L}\p{N}._~-]+\/)*$/u.test(p)) return null;
  return p;
}

function originList(value) {
  return (value || "").split(",").map(s => s.trim()).filter(Boolean);
}

/** CORS 를 허용할 Origin. 로컬 개발도 포함해서 숫자는 읽을 수 있게 한다. */
function readOrigins(env) {
  return originList(env.ALLOWED_ORIGINS);
}

/** 카운트를 올릴 수 있는 Origin. 운영 사이트만. localhost 는 여기 없다. */
function writeOrigins(env) {
  return originList(env.WRITE_ORIGINS);
}

function corsHeaders(request, env) {
  const list = readOrigins(env);
  const origin = request.headers.get("Origin");
  const ok = origin && list.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : list[0] || "null",
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body, request, env, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request, env),
    },
  });
}

/** 글 조회수 합계와 사이트 전체의 오늘 방문 수를 한 번에 읽는다. */
async function readCounts(env, path, day) {
  const [totalRow, todayRow] = await env.DB.batch([
    env.DB.prepare(
      "SELECT COALESCE(SUM(n), 0) AS v FROM views WHERE path = ?1"
    ).bind(path),
    env.DB.prepare(
      "SELECT COALESCE(SUM(n), 0) AS v FROM views WHERE day = ?1"
    ).bind(day),
  ]);
  return {
    total: totalRow.results[0]?.v ?? 0,
    today: todayRow.results[0]?.v ?? 0,
  };
}

/**
 * User-Agent 를 대략 분류한다. 정확한 신원 확인이 아니라 집계용 라벨이다.
 * UA 는 위조할 수 있으므로 이 숫자는 참고치다.
 */
const AGENTS = [
  ["gptbot", /GPTBot/i],
  ["chatgpt-user", /ChatGPT-User/i],
  ["oai-searchbot", /OAI-SearchBot/i],
  ["claudebot", /ClaudeBot/i],
  ["claude-user", /Claude-User|Claude-SearchBot/i],
  ["perplexity", /PerplexityBot|Perplexity-User/i],
  ["google-extended", /Google-Extended/i],
  ["googlebot", /Googlebot/i],
  ["bingbot", /bingbot|BingPreview/i],
  ["ccbot", /CCBot/i],
  ["bytespider", /Bytespider/i],
  ["amazonbot", /Amazonbot/i],
  ["applebot", /Applebot/i],
  ["meta-ai", /meta-externalagent|FacebookBot/i],
  ["mistral", /MistralAI-User/i],
  ["cohere", /cohere-ai/i],
  ["diffbot", /Diffbot/i],
  ["ai2", /AI2Bot/i],
];

function classifyAgent(ua) {
  if (!ua) return "unknown";
  for (const [kind, re] of AGENTS) if (re.test(ua)) return kind;
  if (/bot|crawler|spider|scrape/i.test(ua)) return "other-bot";
  if (/Mozilla\/5\.0/.test(ua)) return "browser";
  return "unknown";
}

/** 1x1 투명 GIF. 43바이트. */
const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    // 트래킹 픽셀. JS 를 실행하지 않는 크롤러도 이미지를 가져가면 여기 걸린다.
    // 사람 조회수(views)는 건드리지 않는다 — 집계를 섞지 않는다.
    if (url.pathname === "/px" && request.method === "GET") {
      const path = normalizePath(url.searchParams.get("p"));
      const ua = request.headers.get("User-Agent") || "";
      if (path) {
        const day = kstDay();
        const kind = classifyAgent(ua);
        try {
          await env.DB.batch([
            env.DB.prepare(
              `INSERT INTO agent_hits (day, kind, path, n) VALUES (?1, ?2, ?3, 1)
               ON CONFLICT (day, kind, path) DO UPDATE SET n = n + 1`
            ).bind(day, kind, path),
            env.DB.prepare(
              `INSERT INTO ua_seen (ua, first_day, last_day, n) VALUES (?1, ?2, ?2, 1)
               ON CONFLICT (ua) DO UPDATE SET last_day = ?2, n = n + 1`
            ).bind(ua.slice(0, 300), day),
          ]);
        } catch {
          // 집계 실패가 픽셀 응답을 막지 않게 한다.
        }
      }
      return new Response(PIXEL, {
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "no-store, max-age=0",
          "Content-Length": String(PIXEL.byteLength),
        },
      });
    }

    // 사이드바의 "오늘 방문 N". views 를 SUM 하면 "글을 몇 개 읽었나"가 되므로
    // 사이트 단위 순방문은 visits 테이블로 따로 센다.
    if (url.pathname === "/today" && request.method === "GET") {
      const day = kstDay();
      const row = await env.DB.prepare("SELECT n FROM visits WHERE day = ?1")
        .bind(day)
        .first();
      return json({ day, today: row?.n ?? 0 }, request, env);
    }

    // 오늘 이 브라우저의 첫 방문. 경로와 무관하게 하루 한 번만 불린다.
    // 올린 뒤의 값을 그대로 돌려주므로 사이드바가 따로 읽지 않아도 된다.
    if (url.pathname === "/visit" && request.method === "POST") {
      const origin = request.headers.get("Origin");
      if (!origin || !writeOrigins(env).includes(origin)) {
        return json({ error: "forbidden" }, request, env, 403);
      }
      const day = kstDay();
      await env.DB.prepare(
        `INSERT INTO visits (day, n) VALUES (?1, 1)
         ON CONFLICT (day) DO UPDATE SET n = n + 1`
      )
        .bind(day)
        .run();
      const row = await env.DB.prepare("SELECT n FROM visits WHERE day = ?1")
        .bind(day)
        .first();
      return json({ day, today: row?.n ?? 0 }, request, env);
    }

    // 내가 볼 통계. 최근 30일 추이와 상위 글.
    if (url.pathname === "/stats" && request.method === "GET") {
      const day = kstDay();
      const [today, days, top, agentToday, agentAll, uas, pv] = await env.DB.batch([
        env.DB.prepare("SELECT COALESCE(n,0) AS v FROM visits WHERE day = ?1").bind(day),
        env.DB.prepare(
          `SELECT v.day, v.n AS visitors, COALESCE(p.n, 0) AS pageviews
           FROM visits v
           LEFT JOIN (SELECT day, SUM(n) AS n FROM views GROUP BY day) p ON p.day = v.day
           ORDER BY v.day DESC LIMIT 30`
        ),
        env.DB.prepare(
          "SELECT path, SUM(n) AS n FROM views GROUP BY path ORDER BY n DESC LIMIT 20"
        ),
        env.DB.prepare(
          "SELECT kind, SUM(n) AS n FROM agent_hits WHERE day = ?1 GROUP BY kind ORDER BY n DESC"
        ).bind(day),
        env.DB.prepare(
          "SELECT kind, SUM(n) AS n FROM agent_hits GROUP BY kind ORDER BY n DESC"
        ),
        env.DB.prepare(
          "SELECT ua, first_day, last_day, n FROM ua_seen ORDER BY n DESC LIMIT 30"
        ),
        env.DB.prepare(
          "SELECT COALESCE(SUM(n),0) AS v FROM views WHERE day = ?1"
        ).bind(day),
      ]);
      return json(
        {
          day,
          // 방문자 = 브라우저 하루 1회 / 조회수 = 글별 하루 1회의 합
          today: today.results[0]?.v ?? 0,
          pageviews_today: pv.results[0]?.v ?? 0,
          days: days.results,
          top: top.results,
          // 픽셀로 잡힌 것. HTML 만 가져가는 봇은 여기 안 나온다 — 하한선이다.
          agents_today: agentToday.results,
          agents_all: agentAll.results,
          user_agents: uas.results,
        },
        request,
        env
      );
    }

    const isHit = url.pathname === "/hit" && request.method === "POST";
    const isViews = url.pathname === "/views" && request.method === "GET";
    if (!isHit && !isViews) {
      return json({ error: "not found" }, request, env, 404);
    }

    const path = normalizePath(url.searchParams.get("p"));
    if (!path) return json({ error: "bad path" }, request, env, 400);

    // 쓰기는 우리 사이트에서 온 요청만 받는다.
    if (isHit) {
      const origin = request.headers.get("Origin");
      if (!origin || !writeOrigins(env).includes(origin)) {
        return json({ error: "forbidden" }, request, env, 403);
      }
    }

    const day = kstDay();

    if (isHit) {
      await env.DB.prepare(
        `INSERT INTO views (path, day, n) VALUES (?1, ?2, 1)
         ON CONFLICT (path, day) DO UPDATE SET n = n + 1`
      )
        .bind(path, day)
        .run();
    }

    return json({ path, day, ...(await readCounts(env, path, day)) }, request, env);
  },
};
