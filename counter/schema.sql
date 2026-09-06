-- 방문자 카운터. 중복 제거를 브라우저가 하므로 방문자별 기록은 남기지 않는다.
-- 글 하나를 하루에 1000명이 봐도 행은 하나만 늘어난다.
CREATE TABLE IF NOT EXISTS views (
  path TEXT    NOT NULL,          -- /study/database/section-3-internals/
  day  TEXT    NOT NULL,          -- 2026-09-06 (Asia/Seoul 기준)
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (path, day)
);

-- "오늘 몇 명" 과 일별 추이를 위한 인덱스.
CREATE INDEX IF NOT EXISTS views_day ON views (day);

-- 트래킹 픽셀로 잡은 접근. 사람 조회수(views)와 섞지 않는다.
-- HTML 만 가져가는 크롤러는 여기 안 걸리므로 이 숫자는 하한선이다.
CREATE TABLE IF NOT EXISTS agent_hits (
  day  TEXT    NOT NULL,          -- 2026-09-06 (Asia/Seoul)
  kind TEXT    NOT NULL,          -- gptbot / claudebot / browser / other-bot ...
  path TEXT    NOT NULL,
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, path)
);

CREATE INDEX IF NOT EXISTS agent_hits_kind ON agent_hits (kind);

-- 분류에 안 걸린 새 봇을 발견하려고 UA 원문을 따로 모은다. 종류가 적어 행이 안 늘어난다.
CREATE TABLE IF NOT EXISTS ua_seen (
  ua        TEXT    NOT NULL PRIMARY KEY,
  first_day TEXT    NOT NULL,
  last_day  TEXT    NOT NULL,
  n         INTEGER NOT NULL DEFAULT 0
);

-- 사이트 단위 일별 순방문. 브라우저가 하루 한 번만 올린다(경로 무관).
-- views 를 SUM 하면 "글을 몇 개 읽었나"가 되어 방문자 수와 달라진다.
CREATE TABLE IF NOT EXISTS visits (
  day TEXT    NOT NULL PRIMARY KEY,   -- 2026-09-07 (Asia/Seoul)
  n   INTEGER NOT NULL DEFAULT 0
);
