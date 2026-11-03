---
title: "섹션9 실습 2: 멀티 마스터 충돌과 outbox"
description: "PostgreSQL 18 두 노드를 양방향 논리 복제로 묶어 같은 행을 양쪽에서 쓰면 값이 엇갈리고 반영이 멈추는 것을 확인한다. 이어서 테이블마다 쓰기 주인을 정하고 outbox · relay · inbox 로 주문과 포인트 차감을 잇는다."
pubDatetime: 2026-11-04T01:57:00+09:00
tags: ["Fundamentals of Database Engineering"]
---

[실습 1](/study/database/section-9-replication-lab/)에서는 쓰는 노드가 하나였다. 이번에는 두 노드가
모두 쓴다. [정리 글](/study/database/section-9-replication/)에서 "멀티 마스터에서 락은 노드 밖으로
안 나간다"고 했는데, 그러면 같은 행을 양쪽에서 고쳤을 때 실제로 무슨 일이 생기는지 보고 싶었다.
그리고 충돌을 피하려고 테이블마다 주인을 정한 구조가 정말 돌아가는지도.

두 부로 나눴다. **1부**는 같은 행을 양쪽에서 써서 충돌을 일으킨다. **2부**는 테이블마다 주인을
정하고 outbox 로 노드를 잇는다. 2부를 먼저 해도 된다.

아래 출력은 전부 `postgres:18` 이미지(18.6)로 직접 받은 것이다. UUID, LSN, 시각, 트랜잭션 번호는
환경마다 다르다.

## 준비

두 노드 `node_a`, `node_b` 가 서로를 구독한다. 테이블은 넷이다.

| 테이블 | 쓰기 주인 | 복제 |
| --- | --- | --- |
| `shared_kv` | 양쪽 모두 | 양방향. 충돌 실험용 |
| `users` | node_a | node_a → node_b |
| `orders` | node_b | node_b → node_a |
| `outbox` · `inbox` | 각 노드 로컬 | 안 함 |

```text
02-multi-master/
├── docker-compose.yml
├── conf/postgresql.conf
├── init/01-schema.sh
└── relay/
    ├── setup.sh
    └── outbox-relay.sh
```

```yaml
# docker-compose.yml
x-pg: &pg
  image: postgres:18
  environment: &pgenv
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: postgres
    POSTGRES_DB: app
  command: ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres -d app"]
    interval: 2s
    retries: 30

services:
  node_a:
    <<: *pg
    container_name: mm-node-a
    environment: { <<: *pgenv, NODE_NAME: node_a }
    volumes:
      - ./conf/postgresql.conf:/etc/postgresql/postgresql.conf:ro
      - ./init:/docker-entrypoint-initdb.d:ro
    ports: ["25432:5432"]

  node_b:
    <<: *pg
    container_name: mm-node-b
    environment: { <<: *pgenv, NODE_NAME: node_b }
    volumes:
      - ./conf/postgresql.conf:/etc/postgresql/postgresql.conf:ro
      - ./init:/docker-entrypoint-initdb.d:ro
    ports: ["25433:5432"]

  setup:                      # 두 노드가 뜬 뒤 구독을 만들고 끝나는 컨테이너
    image: postgres:18
    container_name: mm-setup
    depends_on:
      node_a: { condition: service_healthy }
      node_b: { condition: service_healthy }
    environment: { PGPASSWORD: postgres }
    entrypoint: ["/bin/bash", "/relay/setup.sh"]
    volumes: ["./relay:/relay:ro"]
    restart: "no"

  relay:                      # outbox 를 읽어 상대 노드로 전달하는 프로그램
    image: postgres:18
    container_name: mm-relay
    depends_on:
      setup: { condition: service_completed_successfully }
    environment: { PGPASSWORD: postgres }
    entrypoint: ["/bin/bash", "/relay/outbox-relay.sh"]
    volumes: ["./relay:/relay:ro"]
```

```ini
# conf/postgresql.conf
listen_addresses = '*'
wal_level = logical               # 논리 복제에 필요 (재시작 필요)
max_wal_senders = 10
max_replication_slots = 10
max_worker_processes = 16
max_logical_replication_workers = 8
track_commit_timestamp = on       # 충돌 로그에 양쪽 커밋 시각이 찍힌다
lock_timeout = '5s'
```

스키마는 두 노드에 똑같이 만들고, `NODE_NAME` 에 따라 쓰기 차단 트리거와 PUBLICATION 만 다르게 건다.

```bash
# init/01-schema.sh
set -e
psql -v ON_ERROR_STOP=1 -U postgres -d app <<SQL
CREATE TABLE shared_kv (
  k text PRIMARY KEY, v text, updated_by text,
  updated_at timestamptz DEFAULT clock_timestamp()
);
CREATE TABLE users (
  id bigint PRIMARY KEY, name text NOT NULL,
  point int NOT NULL CHECK (point >= 0)
);
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- UUID 라 노드 간 키 충돌이 없다
  user_id bigint NOT NULL, amount int NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',          -- PENDING → CONFIRMED / CANCELLED
  created_at timestamptz DEFAULT now()
);
CREATE TABLE outbox (
  seq bigserial PRIMARY KEY,                       -- 보내는 순서
  event_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  aggregate_id uuid NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now(), published_at timestamptz
);
CREATE TABLE inbox (
  event_id uuid PRIMARY KEY, result text NOT NULL,
  processed_at timestamptz DEFAULT now()
);
-- 주인이 아닌 노드에서 직접 쓰면 막는다.
-- 복제 적용 프로세스는 session_replication_role = replica 로 돌아 일반 트리거가 안 걸린다.
-- 그래서 복제로 들어오는 변경은 통과하고, 사람이나 앱의 직접 쓰기만 막힌다.
CREATE FUNCTION deny_non_owner_write() RETURNS trigger LANGUAGE plpgsql AS \$\$
BEGIN
  RAISE EXCEPTION 'table "%" is owned by %, write it there', TG_TABLE_NAME, TG_ARGV[0];
END \$\$;
SQL

if [ "$NODE_NAME" = "node_a" ]; then
psql -v ON_ERROR_STOP=1 -U postgres -d app <<'SQL'
INSERT INTO users VALUES (1, 'alice', 1000), (2, 'bob', 100);
CREATE TRIGGER orders_owned_by_b BEFORE INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION deny_non_owner_write('node_b');
CREATE PUBLICATION pub_a FOR TABLE users, shared_kv;

-- relay 가 부르는 함수. inbox 로 중복을 거른다.
CREATE FUNCTION apply_event(p_event_id uuid, p_type text, p_payload jsonb)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_result text;
BEGIN
  SELECT result INTO v_result FROM inbox WHERE event_id = p_event_id;
  IF FOUND THEN RETURN 'DUPLICATE:' || v_result; END IF;

  IF p_type = 'OrderPlaced' THEN
    UPDATE users SET point = point - (p_payload->>'amount')::int
     WHERE id = (p_payload->>'user_id')::bigint
       AND point >= (p_payload->>'amount')::int;
    v_result := CASE WHEN FOUND THEN 'CONFIRMED' ELSE 'CANCELLED' END;
  ELSE
    v_result := 'IGNORED';
  END IF;

  INSERT INTO inbox(event_id, result) VALUES (p_event_id, v_result);  -- 같은 트랜잭션
  RETURN v_result;
END $$;
SQL
else
psql -v ON_ERROR_STOP=1 -U postgres -d app <<'SQL'
CREATE TRIGGER users_owned_by_a BEFORE INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION deny_non_owner_write('node_a');
CREATE PUBLICATION pub_b FOR TABLE orders, shared_kv;

-- 주문과 outbox 이벤트를 한 로컬 트랜잭션으로 쓴다.
CREATE FUNCTION place_order(p_user bigint, p_amount int) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO orders(user_id, amount) VALUES (p_user, p_amount) RETURNING id INTO v_id;
  INSERT INTO outbox(aggregate_id, event_type, payload)
  VALUES (v_id, 'OrderPlaced',
          jsonb_build_object('order_id', v_id, 'user_id', p_user, 'amount', p_amount));
  RETURN v_id;
END $$;
SQL
fi
```

구독은 `origin = none` 으로 만든다. 상대에게서 복제로 받은 변경을 다시 돌려보내지 않게 하는 옵션이다.

```bash
# relay/setup.sh
set -e
A="psql -h node_a -U postgres -d app -v ON_ERROR_STOP=1"
B="psql -h node_b -U postgres -d app -v ON_ERROR_STOP=1"

$B -c "CREATE SUBSCRIPTION sub_b_from_a
         CONNECTION 'host=node_a port=5432 dbname=app user=postgres password=postgres'
         PUBLICATION pub_a WITH (origin = none, copy_data = true);"
$A -c "CREATE SUBSCRIPTION sub_a_from_b
         CONNECTION 'host=node_b port=5432 dbname=app user=postgres password=postgres'
         PUBLICATION pub_b WITH (origin = none, copy_data = false);"

for i in $(seq 1 30); do       # 초기 복사가 끝날 때까지 기다린다
  n=$($B -Atc "SELECT count(*) FROM pg_subscription_rel WHERE srsubstate <> 'r'")
  [ "$n" = "0" ] && break; sleep 1
done
echo "setup done"
```

relay 는 1초마다 node_b 의 outbox 에서 안 보낸 이벤트를 순서대로 꺼내 node_a 에 전달한다.
결과를 받은 뒤에야 보냄 표시를 한다.

```bash
# relay/outbox-relay.sh
A="psql -h node_a -U postgres -d app -At -v ON_ERROR_STOP=1"
B="psql -h node_b -U postgres -d app -At -v ON_ERROR_STOP=1"
while true; do
  $B -F $'\t' -c "SELECT event_id, event_type, payload, aggregate_id
                  FROM outbox WHERE published_at IS NULL ORDER BY seq LIMIT 50" |
  while IFS=$'\t' read -r eid etype payload agg; do
    [ -z "$eid" ] && continue
    res=$($A -c "SELECT apply_event('$eid', '$etype', '$payload'::jsonb)") || break
    status=${res#DUPLICATE:}
    $B -c "UPDATE orders SET status = '$status' WHERE id = '$agg' AND status = 'PENDING';
           UPDATE outbox SET published_at = now() WHERE event_id = '$eid';" >/dev/null
    echo "[relay] $eid $etype -> $res"
  done
  sleep 1
done
```

```bash
cd 02-multi-master
docker compose up -d
```

아래 쿼리는 이 두 줄로 붙어서 실행한다.

```bash
docker exec -it mm-node-a psql -U postgres -d app   # node_a
docker exec -it mm-node-b psql -U postgres -d app   # node_b
```

## 1부 — 같은 행을 양쪽에서 쓰면

### 구독은 origin none 으로 걸려 있다

**확인할 내용** — 두 노드가 서로를 구독하고, 둘 다 `origin = none` 인지.
([정리 글](/study/database/section-9-replication/#네이티브-양방향-복제는-충돌을-감지만-한다))

**쿼리**

```sql
SELECT subname, subenabled, suborigin FROM pg_subscription;   -- 양쪽에서
```

**결과**

```text
   subname    | subenabled | suborigin
--------------+------------+-----------
 sub_a_from_b | t          | none

   subname    | subenabled | suborigin
--------------+------------+-----------
 sub_b_from_a | t          | none
```

### 같은 행을 동시에 UPDATE 하면 값이 엇갈린다

**확인할 내용** — 두 노드가 같은 행을 고치면 각자 상대 값을 받아 덮어쓰는지.
구독을 잠시 꺼서 네트워크 단절을 흉내 낸다.

**쿼리**

```sql
-- node_a: 행을 하나 만들고 2초 기다린다 (양쪽에 복제된다)
INSERT INTO shared_kv(k, v, updated_by) VALUES ('price', '100', 'node_a');

-- 양쪽 구독을 끈다
ALTER SUBSCRIPTION sub_a_from_b DISABLE;   -- node_a
ALTER SUBSCRIPTION sub_b_from_a DISABLE;   -- node_b

-- 각자 같은 행을 고친다
UPDATE shared_kv SET v = '200', updated_by = 'node_a', updated_at = clock_timestamp() WHERE k = 'price';  -- node_a
UPDATE shared_kv SET v = '300', updated_by = 'node_b', updated_at = clock_timestamp() WHERE k = 'price';  -- node_b

-- 다시 켜고 몇 초 뒤 양쪽에서 조회
ALTER SUBSCRIPTION sub_a_from_b ENABLE;    -- node_a
ALTER SUBSCRIPTION sub_b_from_a ENABLE;    -- node_b
SELECT * FROM shared_kv;
```

**결과**

```text
  node  |   k   |  v  | updated_by |          updated_at
--------+-------+-----+------------+-------------------------------
 node_a | price | 300 | node_b     | 2026-10-23 03:49:14.490942+00

  node  |   k   |  v  | updated_by |          updated_at
--------+-------+-----+------------+-------------------------------
 node_b | price | 200 | node_a     | 2026-10-23 03:49:14.411537+00
```

node_a 에는 node_b 의 값이, node_b 에는 node_a 의 값이 남았다. 서로 바꿔 끼운 셈이다.
충돌은 감지됐지만 정리되지 않았다.

**쿼리**

```sql
SELECT subname, confl_insert_exists, confl_update_origin_differs, apply_error_count
  FROM pg_stat_subscription_stats;
```

```bash
docker logs mm-node-a 2>&1 | grep -A2 'conflict detected'
```

**결과**

```text
   subname    | confl_insert_exists | confl_update_origin_differs | apply_error_count
--------------+---------------------+-----------------------------+-------------------
 sub_a_from_b |                   0 |                           1 |                 0

LOG:  conflict detected on relation "public.shared_kv": conflict=update_origin_differs
DETAIL:  Updating the row that was modified locally in transaction 784 at 2026-10-23 03:49:14.41157+00.
	Existing local row (price, 200, node_a, ...); remote row (price, 300, node_b, ...); replica identity (k)=(price).
```

로그는 "로컬에서 고친 행을 원격 값으로 덮어쓴다"고 말한다. 에러가 아니라 `LOG` 라서 복제는
계속 돈다.

### 같은 PK 를 동시에 INSERT 하면 반영이 멈춘다

**확인할 내용** — 양쪽에서 같은 키로 `INSERT` 하면 무슨 일이 생기는지.

**쿼리**

```sql
ALTER SUBSCRIPTION sub_a_from_b DISABLE;   -- node_a
ALTER SUBSCRIPTION sub_b_from_a DISABLE;   -- node_b
INSERT INTO shared_kv(k, v, updated_by) VALUES ('stock', '10', 'node_a');   -- node_a
INSERT INTO shared_kv(k, v, updated_by) VALUES ('stock', '20', 'node_b');   -- node_b
ALTER SUBSCRIPTION sub_a_from_b ENABLE;    -- node_a
ALTER SUBSCRIPTION sub_b_from_a ENABLE;    -- node_b
```

```bash
docker logs mm-node-b 2>&1 | grep 'conflict detected' | tail -2
```

```sql
-- node_b
SELECT subname, confl_insert_exists, apply_error_count FROM pg_stat_subscription_stats;
```

**결과**

```text
03:49:19.579 GMT [383] ERROR:  conflict detected on relation "public.shared_kv": conflict=insert_exists
03:49:24.585 GMT [414] ERROR:  conflict detected on relation "public.shared_kv": conflict=insert_exists

   subname    | confl_insert_exists | apply_error_count
--------------+---------------------+-------------------
 sub_b_from_a |                   2 |                 2
```

이번엔 `ERROR` 다. 5초 간격으로 프로세스 번호가 바뀌며 같은 에러가 반복된다. 복제 적용
프로세스가 에러로 죽고, 다시 떠서 같은 트랜잭션을 시도하고, 또 죽는 중이다.
`apply_error_count` 는 시간이 갈수록 늘어난다.

### 멈춘 건 상대 쪽 반영뿐이다

**확인할 내용** — "반영이 멈춘다"가 노드 전체가 멈춘다는 뜻인지, 그 구독만 멈춘다는 뜻인지.
([정리 글](/study/database/section-9-replication/#네이티브-양방향-복제는-충돌을-감지만-한다))

**쿼리**

```sql
INSERT INTO shared_kv(k, v, updated_by) VALUES ('local-b', 'ok', 'node_b');   -- node_b 로컬 쓰기
INSERT INTO shared_kv(k, v, updated_by) VALUES ('after-a', 'x', 'node_a');    -- node_a 에 새 행
-- 몇 초 뒤 node_b
SELECT k, v, updated_by FROM shared_kv ORDER BY k;
```

**결과**

```text
INSERT 0 1
INSERT 0 1
    k    |  v  | updated_by
---------+-----+------------
 local-b | ok  | node_b
 price   | 200 | node_a
 stock   | 20  | node_b
```

node_b 의 로컬 쓰기는 문제없이 된다. 하지만 node_a 에서 나중에 넣은 `after-a` 는 node_b 에
오지 않았다. 막힌 트랜잭션 뒤에 줄 서 있기 때문이다. 두 `INSERT` 모두 클라이언트에는 성공으로
돌아왔으니, 앱은 이 상황을 모른다.

### SKIP 으로 건너뛰고 승자 값을 다시 보낸다

**확인할 내용** — 사람이 막힌 트랜잭션을 건너뛰면 복제가 다시 흐르는지.
여기서는 "node_a 가 이긴다"로 정했다.

**쿼리**

에러 로그를 자세히 보면 무엇이 부딪혔는지와 막힌 트랜잭션의 위치가 나온다.

```text
ERROR:  conflict detected on relation "public.shared_kv": conflict=insert_exists
DETAIL:  Key already exists in unique index "shared_kv_pkey", modified locally in transaction 799 at ...
	Key (k)=(stock); existing local row (stock, 20, node_b, ...); remote row (stock, 10, node_a, ...).
CONTEXT:  processing remote data for replication origin "pg_16453" during message type "INSERT"
          for replication target relation "public.shared_kv" in transaction 788, finished at 0/1C2CEB0
```

`finished at` 뒤의 LSN 이 막힌 트랜잭션의 끝이다. 그 값으로 양쪽 구독에서 건너뛴다.

```bash
docker logs mm-node-a 2>&1 | grep -oE 'finished at [0-9A-F]+/[0-9A-F]+' | tail -1
docker logs mm-node-b 2>&1 | grep -oE 'finished at [0-9A-F]+/[0-9A-F]+' | tail -1
```

```sql
ALTER SUBSCRIPTION sub_a_from_b SKIP (lsn = '0/1C30548');   -- node_a, 위에서 찾은 값
ALTER SUBSCRIPTION sub_b_from_a SKIP (lsn = '0/1C2CEB0');   -- node_b, 위에서 찾은 값

-- node_a: 이긴 값을 다시 보낸다
UPDATE shared_kv SET updated_at = clock_timestamp() WHERE k = 'stock';

-- node_b
SELECT k, v, updated_by FROM shared_kv ORDER BY k;
```

**결과**

```text
    k    |  v  | updated_by
---------+-----+------------
 after-a | x   | node_a
 local-b | ok  | node_b
 price   | 200 | node_a
 stock   | 10  | node_a
```

`stock` 이 node_a 의 값 `10` 으로 맞춰졌고, 줄 서 있던 `after-a` 도 들어왔다.
다만 `price` 는 여전히 엇갈린 그대로다. node_a 에서 같은 쿼리를 돌리면 `price` 만 `300` 이다.
네이티브 기능은 이걸 알아서 맞추지 않는다.

## 2부 — 테이블마다 쓰기 주인을 정한다

### 주인이 아닌 노드에서는 못 쓴다

**확인할 내용** — node_b 에서 node_a 소유인 `users` 를 직접 고치면 막히는지.
([정리 글](/study/database/section-9-replication/#충돌을-풀기보다-쓰기-주인을-정한다))

**쿼리**

```sql
-- node_b
UPDATE users SET point = 0 WHERE id = 1;
```

**결과**

```text
ERROR:  table "users" is owned by node_a, write it there
CONTEXT:  PL/pgSQL function deny_non_owner_write() line 3 at RAISE
```

그런데 node_b 의 `users` 에는 node_a 의 데이터가 복제로 잘 들어와 있다. 트리거는 사람이나 앱의
직접 쓰기만 막고, 복제 적용은 통과시킨다.

### 주문과 포인트 차감을 outbox 로 잇는다

**확인할 내용** — node_b 의 주문이 relay 를 거쳐 node_a 의 포인트 차감으로 이어지고, 결과가 주문
상태로 돌아오는지. 포인트가 모자라면 주문이 취소되는지.
([정리 글](/study/database/section-9-replication/#테이블별-주인--outbox))

alice 는 1000 포인트, bob 은 100 포인트로 시작한다.

**쿼리**

```sql
-- node_b
SELECT place_order(1, 300);   -- alice 300
SELECT place_order(2, 500);   -- bob 500, 포인트 부족

-- 몇 초 뒤
SELECT * FROM users ORDER BY id;                                    -- node_a, node_b
SELECT user_id, amount, status FROM orders ORDER BY created_at;     -- node_b, node_a
```

**결과**

```text
-- users (node_a 와 node_b 가 같다)
 id | name  | point
----+-------+-------
  1 | alice |   700
  2 | bob   |   100

-- orders (node_b 와 node_a 가 같다)
 user_id | amount |  status
---------+--------+-----------
       1 |    300 | CONFIRMED
       2 |    500 | CANCELLED
```

포인트 차감은 주인인 node_a 에서만 일어났고, 복제로 node_b 에도 보인다. 주문 상태 변경은 주인인
node_b 에서만 일어났고, 복제로 node_a 에도 보인다. bob 의 주문은 node_a 가 "포인트 부족"을 판단해
`CANCELLED` 를 돌려줬고, relay 가 그 결과로 주문을 취소했다. 실패를 아는 곳에서 보상이 일어난 것이다.

### 같은 이벤트가 두 번 와도 한 번만 반영된다

**확인할 내용** — relay 가 같은 이벤트를 다시 보내도 포인트가 두 번 빠지지 않는지.
보냄 표시를 지워서 중복 전달을 흉내 낸다.

**쿼리**

```sql
-- node_b
UPDATE outbox SET published_at = NULL WHERE seq = 1;
```

```bash
docker logs mm-relay 2>&1 | tail -1
```

```sql
-- node_a
SELECT id, point FROM users WHERE id = 1;
```

**결과**

```text
[relay] d656320e-7325-4b10-9eef-2619a709dbe3 OrderPlaced -> DUPLICATE:CONFIRMED
 id | point
----+-------
  1 |   700
```

relay 는 이벤트를 다시 보냈지만 node_a 의 inbox 에 이미 그 이벤트 ID 가 있어서 이전 결과만
돌려줬다. alice 의 포인트는 700 그대로다.

## 정리 — 무엇을 확인했나

| 정리 글의 주장 | 확인 방법 | 결과 |
| --- | --- | --- |
| 양방향 복제에는 `origin = none` 이 필요하다 | `pg_subscription` | 양쪽 `suborigin = none` |
| 같은 행 UPDATE 는 엇갈린다 | 구독을 끄고 양쪽 UPDATE | node_a 300, node_b 200. `update_origin_differs` |
| 같은 PK INSERT 는 반영이 멈춘다 | 구독을 끄고 양쪽 INSERT | `insert_exists` 에러 반복, `apply_error_count` 증가 |
| 멈추는 건 그 구독의 반영뿐이다 | 멈춘 동안 로컬 쓰기, 상대 쓰기 | 로컬은 성공, 상대 변경은 안 옴 |
| 사람이 건너뛰어야 풀린다 | `SKIP (lsn)` 후 승자 값 재전송 | `stock = 10` 으로 수렴, 밀린 변경 도착 |
| 주인이 아니면 못 쓴다 | node_b 에서 `users` UPDATE | 트리거가 거부 |
| outbox 로 노드를 잇는다 | `place_order` | CONFIRMED · CANCELLED, 양쪽 동일 |
| 중복 전달은 inbox 가 막는다 | 보냄 표시 삭제 | `DUPLICATE:CONFIRMED`, 포인트 그대로 |

## 실습 환경 지우기

```bash
docker compose down -v
```

## 참고

- [PostgreSQL 18: Logical Replication](https://www.postgresql.org/docs/18/logical-replication.html)
- [PostgreSQL 18: Logical Replication Conflicts](https://www.postgresql.org/docs/18/logical-replication-conflicts.html)
- [PostgreSQL 18: CREATE SUBSCRIPTION](https://www.postgresql.org/docs/18/sql-createsubscription.html) — `origin`
- [PostgreSQL 18: ALTER SUBSCRIPTION](https://www.postgresql.org/docs/18/sql-altersubscription.html) — `SKIP`
- [PostgreSQL 18: pg_stat_subscription_stats](https://www.postgresql.org/docs/18/monitoring-stats.html#MONITORING-PG-STAT-SUBSCRIPTION-STATS)
- [microservices.io: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)
