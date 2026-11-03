---
title: "섹션9 실습 1: 스트리밍 복제와 읽기 전용 스탠드바이"
description: "PostgreSQL 18 마스터와 스탠드바이를 docker compose 로 띄워 walsender · walreceiver 연결, write · flush · apply 위치, 동기 복제에서 멈추는 커밋, 스탠드바이의 쓰기 거부를 확인한다."
pubDatetime: 2026-11-04T01:56:00+09:00
tags: ["Fundamentals of Database Engineering"]
---

[섹션9: 데이터베이스 레플리케이션](/study/database/section-9-replication/)을 쓰면서 가장 확인하고
싶었던 건 두 가지였다. 복제가 정말 TCP 연결 하나로 흐르는가, 그리고 스탠드바이는 정말
`standby.signal` 하나 때문에 읽기 전용인가. 이 글은 마스터 한 대와 스탠드바이 한 대를 직접 띄워
정리 글의 주장을 하나씩 확인한다.

아래 출력은 전부 `postgres:18` 이미지(18.6)로 직접 받은 것이다. LSN(`0/3002758`),
IP(`172.18.0.3`), 포트(`33756`), 프로세스 번호는 환경마다 다르다.

## 준비

폴더 하나에 아래 파일을 만든다.

```text
01-streaming/
├── docker-compose.yml
├── primary/
│   ├── postgresql.conf
│   ├── pg_hba.conf
│   └── init/01-replication.sql
└── standby/
    ├── postgresql.conf
    └── entrypoint.sh
```

```yaml
# docker-compose.yml
services:
  primary:
    image: postgres:18
    container_name: pg-primary
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: app
    command: >
      postgres
        -c config_file=/etc/postgresql/postgresql.conf
        -c hba_file=/etc/postgresql/pg_hba.conf
    volumes:
      - ./primary/postgresql.conf:/etc/postgresql/postgresql.conf:ro
      - ./primary/pg_hba.conf:/etc/postgresql/pg_hba.conf:ro
      - ./primary/init:/docker-entrypoint-initdb.d:ro
    ports: ["15432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d app"]
      interval: 2s
      retries: 30

  standby:
    image: postgres:18
    container_name: pg-standby
    depends_on:
      primary: { condition: service_healthy }
    environment:
      PGPASSWORD: replpass            # pg_basebackup 이 쓸 replicator 비밀번호
    entrypoint: ["/bin/bash", "/standby/entrypoint.sh"]
    volumes: ["./standby:/standby:ro"]
    ports: ["15433:5432"]
```

```ini
# primary/postgresql.conf
listen_addresses = '*'
wal_level = replica
max_wal_senders = 10
max_replication_slots = 10
wal_keep_size = 256MB
max_slot_wal_keep_size = 1GB
synchronous_standby_names = ''
synchronous_commit = on
log_replication_commands = on
```

```text
# primary/pg_hba.conf
local   all          all                        trust
host    all          all         127.0.0.1/32   trust
host    all          all         0.0.0.0/0      scram-sha-256
host    replication  replicator  0.0.0.0/0      scram-sha-256
```

```sql
-- primary/init/01-replication.sql
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'replpass';
SELECT pg_create_physical_replication_slot('standby1_slot');

CREATE TABLE orders (
  id         bigserial PRIMARY KEY,
  item       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO orders(item) VALUES ('seed-1'), ('seed-2');
```

```ini
# standby/postgresql.conf
listen_addresses = '*'
hot_standby = on
primary_conninfo = 'host=primary port=5432 user=replicator password=replpass application_name=standby1'
primary_slot_name = 'standby1_slot'
hot_standby_feedback = on
```

스탠드바이는 기본 엔트리포인트 대신 아래 스크립트로 띄운다. 마스터 데이터를 통째로 복사하고,
신호 파일을 만들고, 기동한다. 정리 글에서 말한 순서 그대로다.

```bash
# standby/entrypoint.sh  (bash 로 실행되므로 shebang 은 생략)
set -e
PGDATA=/var/lib/postgresql/18/docker
export PGDATA

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  until pg_isready -h primary -p 5432 -U replicator; do sleep 1; done
  mkdir -p "$PGDATA" && chown -R postgres:postgres /var/lib/postgresql && chmod 700 "$PGDATA"
  gosu postgres pg_basebackup -h primary -p 5432 -U replicator \
       -D "$PGDATA" -X stream -P --checkpoint=fast
  gosu postgres touch "$PGDATA/standby.signal"      # 이 빈 파일이 스탠드바이 표시
fi

mkdir -p /etc/postgresql
cp /standby/postgresql.conf /etc/postgresql/
chown postgres:postgres /etc/postgresql/*
exec gosu postgres postgres -c config_file=/etc/postgresql/postgresql.conf
```

```bash
cd 01-streaming
docker compose up -d
```

이 글의 쿼리는 아래 두 줄로 붙어서 실행한다.

```bash
docker exec -it pg-primary psql -U postgres -d app   # 마스터
docker exec -it pg-standby psql -U postgres -d app   # 스탠드바이
```

## 1부 — 스탠드바이가 뜨는 순서

### 복구 모드로 뜬다

**확인할 내용** — 스탠드바이가 무언가를 감지해서가 아니라 처음부터 복구 모드로 뜨는지.
([정리 글](/study/database/section-9-replication/#감지가-아니라-복구-모드로-기동한다))

**쿼리**

```bash
docker logs pg-standby 2>&1 | grep -E 'standby mode|redo starts|consistent|read-only|streaming'
```

**결과**

```text
LOG:  entering standby mode
LOG:  redo starts at 0/2000028
LOG:  consistent recovery state reached at 0/2000120
LOG:  database system is ready to accept read-only connections
LOG:  started streaming WAL from primary at 0/3000000 on timeline 1
```

`standby.signal` 을 보고 복구 모드에 들어가고, 일관된 지점까지 재생한 뒤에야 읽기 접속을 받는다.
마지막 줄이 walreceiver 가 마스터에 붙어 스트리밍을 시작한 시점이다.

### 역할은 복구 중인지로 갈린다

**확인할 내용** — 두 노드의 차이가 "복구 중인가" 하나인지.

**쿼리**

```sql
SELECT pg_is_in_recovery();   -- 마스터와 스탠드바이에서 각각
```

**결과**

```text
  node   | pg_is_in_recovery
---------+-------------------
 primary | f

  node   | pg_is_in_recovery
---------+-------------------
 standby | t
```

## 2부 — WAL 이 흐르는 과정

### 프로세스 세 개가 보인다

**확인할 내용** — 마스터에는 walsender, 스탠드바이에는 walreceiver 와 startup 이 있는지.
([정리 글](/study/database/section-9-replication/#wal-을-tcp-연결-하나로-흘려보낸다))

**쿼리**

```bash
docker exec pg-primary ps -eo args | grep walsender
docker exec pg-standby ps -eo args | grep -E 'walreceiver|startup'
```

**결과**

```text
postgres: walsender replicator 172.18.0.3(33756) streaming 0/304E140
postgres: startup recovering 000000010000000000000003
postgres: walreceiver streaming 0/304E140
```

walsender 이름 뒤의 `172.18.0.3(33756)` 이 스탠드바이 쪽 TCP 주소와 포트다. 양쪽 LSN 이 같다.

### 마스터에서 본 연결

**확인할 내용** — 수령 확인의 write · flush · apply 세 위치가 실제로 오는지.
([정리 글](/study/database/section-9-replication/#오가는-메시지는-두-종류다))

**쿼리**

```sql
-- 마스터
\x
SELECT application_name, client_addr, client_port, state, sync_state,
       sent_lsn, write_lsn, flush_lsn, replay_lsn, replay_lag
  FROM pg_stat_replication;
```

**결과**

```text
application_name | standby1
client_addr      | 172.18.0.3
client_port      | 33756
state            | streaming
sync_state       | async
sent_lsn         | 0/3002758
write_lsn        | 0/3002758
flush_lsn        | 0/3002758
replay_lsn       | 0/3002758
replay_lag       | 00:00:00.000686
```

`write_lsn`, `flush_lsn`, `replay_lsn` 이 스탠드바이가 보낸 수령 확인이다.
전부 `sent_lsn` 과 같으니 받은 만큼 테이블까지 반영됐다.

### 스탠드바이에서 본 연결

**확인할 내용** — 연결을 건 쪽이 스탠드바이이고, 슬롯을 쓰는지.
([정리 글](/study/database/section-9-replication/#연결은-스탠드바이가-건다))

**쿼리**

```sql
-- 스탠드바이
\x
SELECT status, sender_host, sender_port, slot_name, written_lsn, flushed_lsn
  FROM pg_stat_wal_receiver;
```

**결과**

```text
status      | streaming
sender_host | primary
sender_port | 5432
slot_name   | standby1_slot
written_lsn | 0/3002758
flushed_lsn | 0/3002758
```

스탠드바이 쪽에는 상대 주소가 `primary:5432` 로 찍힌다. 마스터 쪽에는 스탠드바이의 임시
포트가 찍혔다. 접속을 건 쪽이 스탠드바이라는 뜻이다.

### 슬롯이 위치를 붙잡고 있다

**확인할 내용** — 마스터의 슬롯이 스탠드바이가 받은 위치를 기억하는지.
([정리 글](/study/database/section-9-replication/#레플리케이션-슬롯))

**쿼리**

```sql
-- 마스터
SELECT slot_name, slot_type, active, restart_lsn, wal_status FROM pg_replication_slots;
```

**결과**

```text
   slot_name   | slot_type | active | restart_lsn | wal_status
---------------+-----------+--------+-------------+------------
 standby1_slot | physical  | t      | 0/3002758   | reserved
```

`restart_lsn` 이후의 WAL 은 체크포인트가 와도 지우지 않는다.

### 마스터에 쓰면 스탠드바이에 보인다

**확인할 내용** — 마스터의 `INSERT` 가 스탠드바이에 그대로 나타나는지.

**쿼리**

```sql
-- 마스터
INSERT INTO orders(item) VALUES ('from-primary-' || to_char(now(),'HH24MISS')) RETURNING *;
-- 스탠드바이 (1초 뒤)
SELECT * FROM orders ORDER BY id DESC LIMIT 3;
```

**결과**

```text
 id |        item         |          created_at
----+---------------------+-------------------------------
  3 | from-primary-034809 | 2026-10-23 03:48:09.376725+00
  2 | seed-2              | 2026-10-23 03:47:53.603035+00
  1 | seed-1              | 2026-10-23 03:47:53.603035+00
```

## 3부 — 동기 복제와 쓰기 거부

### 동기로 바꾸면 sync 가 된다

**확인할 내용** — `synchronous_standby_names` 에 이름을 넣으면 재시작 없이 동기로 바뀌는지.
([정리 글](/study/database/section-9-replication/#동기-복제는-커밋이-어디까지-기다리느냐다))

**쿼리**

```sql
-- 마스터
ALTER SYSTEM SET synchronous_standby_names = 'FIRST 1 (standby1)';
SELECT pg_reload_conf();
SELECT application_name, sync_state FROM pg_stat_replication;
```

**결과**

```text
 application_name | sync_state
------------------+------------
 standby1         | sync
```

### 스탠드바이가 멈추면 커밋도 멈춘다

**확인할 내용** — 동기 모드에서 스탠드바이가 응답하지 않으면 마스터 커밋이 기다리는지.

**쿼리**

```bash
docker stop pg-standby
```

```sql
-- 마스터, 세션 1: 응답이 돌아오지 않는다
INSERT INTO orders(item) VALUES ('sync-test') RETURNING id;

-- 마스터, 세션 2
SELECT wait_event_type, wait_event, state, left(query, 40) AS query
  FROM pg_stat_activity WHERE query LIKE 'INSERT%sync-test%';
```

**결과**

```text
 wait_event_type | wait_event | state  |                  query
-----------------+------------+--------+------------------------------------------
 IPC             | SyncRep    | active | INSERT INTO orders(item) VALUES ('sync-t
```

`SyncRep` 은 스탠드바이의 flush 확인을 기다린다는 뜻이다. 데이터는 이미 마스터 WAL 에 있지만
클라이언트에게 성공을 돌려주지 않는다.

**쿼리**

```bash
docker start pg-standby
```

**결과**

```text
 id
----
  4

INSERT 0 1
```

스탠드바이가 다시 붙자 세션 1 의 `INSERT` 가 바로 끝났다. 스탠드바이 로그에는 이어 받기 시작한
위치가 찍힌다.

```text
LOG:  started streaming WAL from primary at 0/3000000 on timeline 1
```

다음 실습을 위해 비동기로 되돌린다.

```sql
ALTER SYSTEM SET synchronous_standby_names = '';
SELECT pg_reload_conf();
```

### 스탠드바이는 쓰기를 거부한다

**확인할 내용** — 복구 모드에서는 모든 트랜잭션이 읽기 전용인지.
([정리 글](/study/database/section-9-replication/#감지가-아니라-복구-모드로-기동한다))

**쿼리**

```sql
-- 스탠드바이
INSERT INTO orders(item) VALUES ('from-standby');
SHOW transaction_read_only;
```

**결과**

```text
ERROR:  cannot execute INSERT in a read-only transaction
 transaction_read_only
-----------------------
 on
```

읽기 전용을 직접 끄려고 해도 안 된다.

**쿼리**

```sql
SET transaction_read_only = off;
```

**결과**

```text
ERROR:  cannot set transaction read-write mode during recovery
```

읽기 전용은 설정값이 아니라 복구 중이라는 상태에서 나온다. 에러 문구도 "복구 중이라서"라고 말한다.

## 정리 — 무엇을 확인했나

| 정리 글의 주장 | 확인 방법 | 결과 |
| --- | --- | --- |
| 스탠드바이는 복구 모드로 뜬다 | 기동 로그 | `entering standby mode` → `read-only connections` |
| WAL 은 TCP 연결 하나로 흐른다 | `ps`, `pg_stat_replication` | walsender ↔ walreceiver, 스탠드바이 IP 와 포트 |
| 연결은 스탠드바이가 건다 | `pg_stat_wal_receiver` | `sender_host = primary`, `sender_port = 5432` |
| 수령 확인에 위치가 셋 | `write_lsn` · `flush_lsn` · `replay_lsn` | 셋 다 `sent_lsn` 과 같음 |
| 슬롯이 위치를 붙잡는다 | `pg_replication_slots` | `restart_lsn` 이 받은 위치와 같음 |
| 동기 복제는 커밋을 멈춘다 | 스탠드바이 정지 후 `INSERT` | `SyncRep` 대기, 재기동 후 완료 |
| 스탠드바이는 쓰기를 거부한다 | `INSERT` | `read-only transaction` 에러 |

## 다음 실습

여기까지는 쓰는 노드가 하나였다. 두 노드가 모두 쓰면 무슨 일이 생기는지는
[섹션9 실습 2: 멀티 마스터 충돌과 outbox](/study/database/section-9-replication-lab-multi-master/)에서 본다.

## 실습 환경 지우기

```bash
docker compose down -v
```

## 참고

- [PostgreSQL 18: Log-Shipping Standby Servers](https://www.postgresql.org/docs/18/warm-standby.html)
- [PostgreSQL 18: pg_basebackup](https://www.postgresql.org/docs/18/app-pgbasebackup.html)
- [PostgreSQL 18: pg_stat_replication](https://www.postgresql.org/docs/18/monitoring-stats.html#MONITORING-PG-STAT-REPLICATION-VIEW)
- [PostgreSQL 18: Synchronous Replication](https://www.postgresql.org/docs/18/warm-standby.html#SYNCHRONOUS-REPLICATION)
