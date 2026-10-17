---
title: "섹션8 실습 2: PostgreSQL keyset 페이지네이션"
description: "PostgreSQL 17.11에서 복합 커서 값과 경계 조건을 확인하고, 복합 B-tree가 Index Only Scan에 쓰이는지 살펴본다."
pubDatetime: 2026-10-17T10:03:00+09:00
tags: ["Fundamentals of Database Engineering"]
---

[섹션8: PostgreSQL 페이지네이션](/study/database/section-8-postgresql-pagination/)에서 본 커서는 페이지 번호가 아니라 마지막으로 전달한 정렬 키다. 작은 재현 테이블에서 페이지 경계와 실행 계획을 확인한다. 아래 결과는 PostgreSQL 17.11에서 직접 실행했다.

## 준비

```bash
docker run --rm --name section8-pagination-pg -e POSTGRES_PASSWORD=pw -d postgres:17.11
until docker exec section8-pagination-pg pg_isready -U postgres; do sleep 1; done
docker exec -it section8-pagination-pg psql -U postgres
```

```sql
CREATE SCHEMA section8;
CREATE TABLE section8.posts (
  id bigint PRIMARY KEY,
  created_at timestamptz NOT NULL,
  title text NOT NULL
);

INSERT INTO section8.posts
SELECT g,
       timestamptz '2026-01-01 00:00:00+00' + ((g / 3) * interval '1 second'),
       'post-' || g
FROM generate_series(1, 30) AS g;

CREATE INDEX posts_created_id_idx
  ON section8.posts (created_at DESC, id DESC) INCLUDE (title);
VACUUM (ANALYZE) section8.posts;
```

```mermaid
flowchart LR
  F["첫 페이지"] --> C["마지막 행의 키<br>created_at, id"]
  C --> Q["다음 쿼리의 경계 조건"]
  Q --> N["다음 LIMIT 행"]
  N --> C
```

## 복합 커서가 같은 timestamp 안에서 이어진다

**확인할 내용** — `created_at` 값이 같은 행들을 `id` 타이브레이커로 빠짐없이 페이지에 나누는지.
([정리 글](/study/database/section-8-postgresql-pagination/#심화--커서는-위치가-아니라-정렬-경계다))

**쿼리 — 첫 페이지**

```sql
SELECT id, created_at, title
FROM section8.posts
ORDER BY created_at DESC, id DESC
LIMIT 5;
```

**실제 결과**

```text
 id |       created_at       |  title
----+------------------------+--------
 30 | 2026-01-01 00:00:10+00 | post-30
 29 | 2026-01-01 00:00:09+00 | post-29
 28 | 2026-01-01 00:00:09+00 | post-28
 27 | 2026-01-01 00:00:09+00 | post-27
 26 | 2026-01-01 00:00:08+00 | post-26
```

마지막 행의 키 `(2026-01-01 00:00:08+00, 26)`이 다음 페이지 커서다.

**쿼리 — 다음 페이지**

```sql
SELECT id, created_at, title
FROM section8.posts
WHERE (created_at, id) < (timestamptz '2026-01-01 00:00:08+00', 26)
ORDER BY created_at DESC, id DESC
LIMIT 5;
```

**실제 결과**

```text
 id |       created_at       |  title
----+------------------------+--------
 25 | 2026-01-01 00:00:08+00 | post-25
 24 | 2026-01-01 00:00:08+00 | post-24
 23 | 2026-01-01 00:00:07+00 | post-23
 22 | 2026-01-01 00:00:07+00 | post-22
 21 | 2026-01-01 00:00:07+00 | post-21
```

같은 timestamp의 나머지 id 25, 24, 23이 빠지지 않고 이어진다. 다음 요청에 넣을 커서는 이번 페이지 마지막 행의 `(2026-01-01 00:00:07+00, 21)`이다.

## 복합 인덱스 계획을 확인한다

**확인할 내용** — 복합 행 비교가 B-tree 범위 조건으로 들어가고, 인덱스만으로 결과를 만들 수 있는지.

계획을 보기 전에 3000행으로 표를 키운다. 첫 두 절의 페이지 결과는 앞에서 만든 30행 표본에서 얻었다.

```sql
TRUNCATE section8.posts;
INSERT INTO section8.posts
SELECT g,
       timestamptz '2026-01-01 00:00:00+00' + ((g / 3) * interval '1 second'),
       'post-' || g
FROM generate_series(1, 3000) AS g;
VACUUM (ANALYZE) section8.posts;
```

**쿼리**

```sql
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT created_at, id
FROM section8.posts
WHERE (created_at, id) < (timestamptz '2026-01-01 00:00:01+00', 5)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

**실제 결과 — PostgreSQL 17.11, 3000행 표본**

```text
Limit (actual time=0.002..0.003 rows=4 loops=1)
  Buffers: shared hit=3
  ->  Index Only Scan using posts_created_id_idx on posts (actual time=0.002..0.002 rows=4 loops=1)
        Index Cond: (ROW(created_at, id) < ROW('2026-01-01 00:00:01+00'::timestamp with time zone, '5'::bigint))
        Heap Fetches: 0
        Buffers: shared hit=3
Planning:
  Buffers: shared hit=27
Planning Time: 0.051 ms
Execution Time: 0.008 ms
```

실행 시간·버퍼 수는 컨테이너와 실행 시점에 따라 달라진다. 이 결과는 3000행 표본과 vacuum 직후 visibility map 조건에서 관찰했다. 같은 조건의 30행 표본에서는 다음처럼 `Seq Scan`과 `Sort`를 선택했다.

```text
Limit (actual time=0.008..0.009 rows=4 loops=1)
  ->  Sort (actual time=0.007..0.008 rows=4 loops=1)
        Sort Key: created_at DESC, id DESC
        Sort Method: quicksort  Memory: 25kB
        ->  Seq Scan on posts (actual time=0.003..0.005 rows=4 loops=1)
              Filter: (ROW(created_at, id) < ROW('2026-01-01 00:00:01+00'::timestamp with time zone, '5'::bigint))
              Rows Removed by Filter: 26
```

즉 인덱스를 만들어도 작은 표본에서는 planner가 순차 스캔 후 정렬이 더 싸다고 판단할 수 있다. 실행 계획은 데이터 크기와 통계에 따라 달라진다.

## OFFSET 계획과 비교한다

**확인할 내용** — OFFSET은 페이지가 깊어질수록 앞선 인덱스 엔트리를 소비하는지.

**쿼리**

```sql
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT created_at, id
FROM section8.posts
ORDER BY created_at DESC, id DESC
LIMIT 5 OFFSET 20;
```

**실제 결과 — PostgreSQL 17.11, 3000행 표본**

```text
Limit (actual time=0.008..0.009 rows=5 loops=1)
  Buffers: shared hit=3
  ->  Index Only Scan using posts_created_id_idx on posts (actual time=0.006..0.007 rows=25 loops=1)
        Heap Fetches: 0
Planning Time: 0.017 ms
Execution Time: 0.012 ms
```

노드가 25행을 내보내고 `Limit`이 그중 OFFSET 20개를 건너뛴 뒤 5개를 반환했다. 실행 시간과 버퍼는 실행 환경에 따라 달라진다.

## 정리 — 무엇을 확인했나

| 정리 글의 주장 | 확인 방법 | 결과 |
| --- | --- | --- |
| 복합 커서는 동률 정렬 키를 이어서 읽는다 | 첫 페이지 마지막 `(created_at, id)`로 다음 쿼리 | 실제 결과에서 id 25부터 연결됨 |
| 복합 인덱스는 keyset 탐색에 쓰일 수 있다 | `EXPLAIN ANALYZE` | Index Only Scan, Heap Fetches 0 |
| Index Only Scan은 힙 fetch가 없을 수 있다 | VACUUM 뒤 계획 확인 | 해당 실험에서 0 |
| OFFSET은 건너뛸 행까지 소비한다 | OFFSET 20 계획 측정 | Index Only Scan 25행, Limit 5행 |

## 정리하기

```sql
DROP SCHEMA section8 CASCADE;
```

```bash
docker stop section8-pagination-pg
```

## 참고

- [PostgreSQL 17 Multicolumn Indexes](https://www.postgresql.org/docs/17/indexes-multicolumn.html)
- [PostgreSQL 17 Indexes and ORDER BY](https://www.postgresql.org/docs/17/indexes-ordering.html)
- [PostgreSQL 17 Index-Only Scans](https://www.postgresql.org/docs/17/indexes-index-only-scans.html)
