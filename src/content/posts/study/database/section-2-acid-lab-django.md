---
title: "섹션2 실습 2: Django 에서 같은 문제 겪어보기"
description: "transaction.atomic 은 격리 수준을 바꾸지 않는다. QuerySet 캐시는 어디까지 유효한가. ORM 이 lost update 를 유도하는 지점과 F(), select_for_update 를 실제로 돌려서 확인한다."
pubDatetime: 2026-09-06T14:25:00+09:00
tags: ["Fundamentals of Database Engineering"]
---

[섹션2 실습: ACID 직접 까보기](/study/database/section-2-acid-lab/) 에서는 `psql` 로
직접 쿼리를 던져 확인했다. 그런데 실무에서 SQL 을 손으로 쓰는 일은 드물다.
**ORM 을 끼면 이 이야기가 어떻게 달라지는가**가 이 글의 주제다.

특히 이런 생각이 들었다.

> Django 는 조회 결과를 캐싱하니까 팬텀 같은 건 신경 안 써도 되는 것 아닌가?

**절반만 맞다.** 아래 결과는 전부 Django 6.1 + PostgreSQL 17 로 실제 돌려서 받은 것이다.

## 준비

앞 실습의 컨테이너에 포트만 열어 붙인다.

```bash
docker run -d --name acid-lab \
  -e POSTGRES_PASSWORD=lab -e POSTGRES_DB=lab \
  -p 55432:5432 postgres:17

python -m venv venv && ./venv/bin/pip install django "psycopg[binary]"
```

모델 하나면 충분하다.

```python
# app/models.py
from django.db import models

class Emp(models.Model):
    name = models.CharField(max_length=50)
```

쿼리가 실제로 몇 번 나가는지 세려면 `DEBUG=True` 로 두고 `connection.queries` 를 본다.

```python
from django.db import connection
len(connection.queries)     # 지금까지 나간 쿼리 수
```

## transaction.atomic 은 격리 수준을 바꾸지 않는다

**확인할 내용** — `transaction.atomic()` 으로 감싸면 격리 수준이 올라가는가.

**쿼리**

```python
with connection.cursor() as c:
    c.execute("SHOW transaction_isolation")
    print("atomic 밖:", c.fetchone()[0])

with transaction.atomic():
    with connection.cursor() as c:
        c.execute("SHOW transaction_isolation")
        print("atomic 안:", c.fetchone()[0])
```

**결과**

```text
atomic 밖: read committed
atomic 안: read committed
```

`atomic()` 은 `BEGIN` / `COMMIT` (중첩 시 `SAVEPOINT`)으로 감쌀 뿐이다.
격리 수준은 **커넥션 설정**에서 오고, 그 기본값은 **DB 가 정한다.**

| DB | 기본 격리 수준 |
| --- | --- |
| PostgreSQL | READ COMMITTED |
| Oracle / SQL Server | READ COMMITTED |
| **MySQL InnoDB** | **REPEATABLE READ** |

MySQL 만 기본이 다르다. 같은 Django 코드가 DB 를 바꾸면 다르게 동작할 수 있다는 뜻이다.

바꾸려면 명시해야 한다.

```python
import psycopg
DATABASES = {"default": {
    ...
    "OPTIONS": {"isolation_level": psycopg.IsolationLevel.REPEATABLE_READ},
}}
```

## QuerySet 캐시는 객체 하나에만 붙는다

**확인할 내용** — "앞에서 조회했으니 캐싱된다"가 어디까지 참인가.

**쿼리**

```python
qs = Emp.objects.all()          # lazy
list(qs)                        # 첫 평가
list(qs)                        # 같은 객체 재순회
list(Emp.objects.all())         # 새 QuerySet, 조건 동일
list(qs.order_by("name"))       # 정렬만 추가
list(qs.filter(name__startswith="기"))
```

**결과**

```text
 쿼리  0회  <- QuerySet 생성 (lazy, 아직 안 나감)
 쿼리  1회  <- 첫 평가
 쿼리  1회  <- 같은 객체 재순회        ← 캐시 적중
 쿼리  1회  <- 또 재순회
 쿼리  2회  <- 새 QuerySet (조건 동일)  ← 캐시 안 됨
 쿼리  3회  <- order_by() 붙이기        ← 캐시 안 됨
 쿼리  4회  <- filter() 붙이기          ← 캐시 안 됨
```

**Django 에는 Hibernate 같은 identity map / 세션 캐시가 없다.**
`Model.objects.get(pk=1)` 을 두 번 부르면 DB 에 두 번 간다.

캐시(`_result_cache`)는 **평가된 그 QuerySet 인스턴스**에만 붙는다.
`order_by()`, `filter()`, `exclude()` 는 QuerySet 을 **복제**해서 새로 만들므로 캐시가 안 따라온다.

`count()` / `exists()` 는 조건부다.

```text
 쿼리 1회 <- 새 qs.count()      (평가 전이면 SELECT COUNT(*) 를 날림)
 쿼리 2회 <- 새 qs.exists()     (평가 전이면 SELECT 1 을 날림)
```

이미 평가된 QuerySet 에 부르면 캐시 길이를 쓰고 쿼리를 안 날린다.
**평가 여부에 따라 동작이 갈린다는 게 함정이다.**

## atomic 안에서 팬텀이 그대로 보인다

### atomic 안에서 팬텀이 보인다

**확인할 내용** — 그래서 트랜잭션 안에서 팬텀을 겪는가.

**쿼리** — 트랜잭션 중간에 다른 커넥션이 INSERT + COMMIT 한다.

```python
with transaction.atomic():
    qs1 = Emp.objects.all()
    print(len(qs1))                    # 첫 평가

    other_session_insert("다른 세션이 추가")   # 별도 커넥션에서 커밋

    print(len(qs1))                    # 같은 객체
    print(len(Emp.objects.all()))      # 새 QuerySet
    print(len(qs1.order_by("id")))     # 정렬만 추가
    print(Emp.objects.count())         # count()
```

**결과**

```text
[1] len(qs1)                = 2   첫 평가, 캐시됨
[2] len(qs1)                = 2   같은 객체 → 캐시라서 그대로
[3] len(Emp.objects.all())  = 3   ← 팬텀
[4] len(qs1.order_by('id')) = 3   ← 팬텀 (정렬만 붙였는데)
[5] Emp.objects.count()     = 3   ← 팬텀
```

**"캐싱되니까 괜찮다"는 그 QuerySet 객체를 계속 재사용할 때만 참이다.**
실무 코드에서 한 트랜잭션 안에 조회가 두 번 있으면 보통 서로 다른 QuerySet 이고,
그러면 팬텀이 그대로 들어온다.

→ [팬텀이 왜 생기는지](/study/database/section-2-acid-lab/#i--같은-행의-다른-버전을-동시에-본다)

### REPEATABLE READ 로 올리면 막힌다

**확인할 내용** — 격리 수준을 올리면 막히는가.

**쿼리**

```python
connection.settings_dict["OPTIONS"] = {
    "isolation_level": psycopg.IsolationLevel.REPEATABLE_READ
}
with transaction.atomic():
    print(Emp.objects.count())
    other_session_insert("RR 중에 추가")
    print(Emp.objects.count())         # 새 QuerySet 인데도?
print(Emp.objects.count())             # 트랜잭션 끝난 뒤
```

**결과**

```text
격리 수준: repeatable read
[1] 첫 조회                 = 3
[2] 새 QuerySet 으로 다시   = 3   ← 안 변함
[3] 트랜잭션 끝난 뒤         = 4
```

새 QuerySet 이라 쿼리는 새로 나갔는데도 결과가 같다.
**캐시가 막은 게 아니라 스냅샷이 막은 것**이다. 이 둘은 다른 층위다.

## ORM 이 유도하는 lost update

### obj.n += 10 은 안전하지 않다

**확인할 내용** — 가장 자연스러운 ORM 코드가 안전한가.

`obj.n += 10; obj.save()` 는 Django 를 쓰면 누구나 처음 쓰는 형태다.
그런데 이건 **읽고 → 파이썬에서 계산하고 → 통째로 쓰는** 세 단계다.

**쿼리** — 두 트랜잭션이 각각 `+10` 을 한다. 기대값은 120.

```sql
-- [A] DB 안에서 계산
UPDATE bal SET n = n + 10 WHERE id = 1;

-- [B] 앱에서 읽은 값으로 계산해서 상수로
SELECT n FROM bal WHERE id = 1;   -- 100 을 읽음
UPDATE bal SET n = 110 WHERE id = 1;
```

**결과**

```text
[A] UPDATE n = n + 10        → 기대 120, 실제 120   안전
[B] 앱에서 계산해 상수로 쓰기  → 기대 120, 실제 110   유실
```

**[A] 가 안전한 이유**는 앞 실습에서 본 EvalPlanQual 이다. 충돌하면 막혔다가 깨어나
**최신 값을 다시 읽고** `+ 10` 을 다시 계산한다.

**[B] 는 재계산할 근거가 없다.** 이미 `110` 이라는 상수로 굳었으니 엔진이 손쓸 수가 없다.

Django 로 옮기면 이렇게 갈린다.

```python
# ❌ 위험 — 읽고, 파이썬에서 계산하고, 통째로 씀
obj = Account.objects.get(id=1)
obj.n += 10
obj.save()

# ✅ 안전 — DB 안에서 계산
Account.objects.filter(id=1).update(n=F("n") + 10)
```

**`F()` 표현식이 존재하는 이유가 정확히 이것이다.** 편의 문법이 아니라 정확성 문제다.

→ [READ COMMITTED 가 재계산하는 방식](/study/database/section-2-acid-lab/#i--같은-행의-다른-버전을-동시에-본다)

## check-then-act 는 F() 로도 안 된다

### 판단이 필요하면 F() 로도 안 된다

**확인할 내용** — 읽은 값으로 **판단**까지 해야 하면 어떻게 되나.

좌석 예약이 전형이다. "비어 있으면 잡는다" 는 `F()` 로 표현할 수 없다.

**쿼리** — 스레드 두 개가 동시에 같은 좌석을 예약한다.

```python
def book(use_lock):
    with transaction.atomic():
        qs = Seat.objects.select_for_update() if use_lock else Seat.objects
        s = qs.get(id=1)
        time.sleep(0.4)              # 판단과 쓰기 사이의 틈
        if not s.taken:
            s.taken = True
            s.save()
            return "예약 성공"
        return "이미 예약됨 (거절)"
```

**결과**

```text
[락 없음               ]  스레드1 = 예약 성공        스레드2 = 예약 성공
[select_for_update 사용]  스레드1 = 이미 예약됨      스레드2 = 예약 성공
```

**락 없이는 둘 다 성공한다. 좌석 하나가 두 명에게 팔린다.**

`select_for_update()` 를 걸면 두 번째 스레드가 첫 번째가 커밋할 때까지 **대기**하고,
깨어나서 최신 상태(`taken=True`)를 읽어 거절한다.

```python
with transaction.atomic():
    seat = Seat.objects.select_for_update().get(id=1)   # 행 잠금
    if not seat.taken:
        seat.taken = True
        seat.save()
```

`select_for_update()` 는 **반드시 `atomic()` 안에서** 써야 한다.
트랜잭션 밖에서는 잠글 대상이 없어 에러가 난다.

## 그럼 무엇을 골라야 하나

REPEATABLE READ 로 올리면 잠금 없이 해결되지 않을까 싶지만, 앞 실습에서 봤듯
**RR 은 서로 다른 행에 쓰는 write skew 를 못 막고**, 같은 행 충돌은 에러로 던지므로
**재시도 로직을 짜야 한다.**

| 선택 | 막는 것 | 대가 |
| --- | --- | --- |
| `F()` 표현식 | lost update (계산형) | 판단이 필요한 로직엔 못 씀 |
| `select_for_update()` | 잠근 행의 모든 충돌 | 블로킹, 데드락 가능. **재시도 불필요** |
| REPEATABLE READ | 같은 행 write-write | write skew **못 막음**. 재시도 필수 |
| SERIALIZABLE | write skew 포함 전부 | SSI 비용, 오탐. 재시도 필수 |

실무 기준으로는 이렇게 정리된다.

- **단순 증감** → `F()`
- **경합 지점이 명확한 check-then-act** (재고, 좌석) → `select_for_update()`
- **불변식이 여러 행에 걸침** (당직 최소 1명, 합계 제약) → **SERIALIZABLE + 재시도**

### SERIALIZABLE 을 쓰기로 했다면 — 전부 올려야 한다

여기에 함정이 하나 있다. **SERIALIZABLE 의 보장은 다른 SERIALIZABLE 트랜잭션에
대해서만 성립한다.** 한쪽이 READ COMMITTED 면 SERIALIZABLE 쪽도 같이 뚫린다.
[1차 실습에서 실제로 재현했다](/study/database/section-2-acid-lab/#i--같은-행의-다른-버전을-동시에-본다).

Django 에서 특히 새기 쉬운 자리들이다.

- `@transaction.atomic` 만 붙인 **다른 뷰**가 기본 격리 수준으로 같은 테이블을 건드림
- **management command / 배치 스크립트** — 격리 수준 설정을 안 물려받는 별도 실행 경로
- **Django admin** — 내가 짜지 않은 코드가 같은 모델을 수정한다
- **데이터 마이그레이션**, 외부에서 붙는 `psql` 세션

그래서 특정 뷰만 올리는 방식(커넥션 옵션을 그때만 바꾸기)은 위험하다.
**불변식을 건드리는 경로 전체**를 올리거나, 아예 `DATABASES` 기본값으로 올리는 편이 낫다.

```python
DATABASES = {"default": {
    ...
    "OPTIONS": {"isolation_level": psycopg.IsolationLevel.SERIALIZABLE},
}}
```

물론 그러면 **모든 트랜잭션에 재시도 로직이 필요해진다.** 이 비용이 감당 안 되면
격리 수준 대신 `select_for_update()` 로 경합 지점만 좁게 막는 쪽이 현실적이다.

## 정리 — 무엇을 확인했나

| 생각했던 것 | 실제 |
| --- | --- |
| `atomic()` 이 격리 수준을 올려준다 | ❌ `BEGIN`/`COMMIT` 만 한다. 격리 수준은 DB 기본값 |
| 조회하면 캐싱되니 팬텀 걱정 없다 | ❌ 캐시는 **그 QuerySet 객체**에만. `order_by()` 만 붙여도 새 쿼리 |
| `obj.n += 10; save()` 는 안전하다 | ❌ 읽고-계산하고-쓰는 3단계라 유실 가능. `F()` 를 쓸 것 |
| RR 로 올리면 락이 필요 없다 | ❌ write skew 못 막고, 재시도 로직이 필요해짐 |
| 이 트랜잭션만 SERIALIZABLE 로 올리면 된다 | ❌ 상대가 RC 면 같이 뚫린다. 모든 경로를 올려야 함 |
| `select_for_update` 는 MVCC 를 버리는 것 | ❌ 경합 지점만 좁게 직렬화한다. 나머지 읽기는 그대로 안 막힌다 |

## 정리하기

```bash
docker rm -f acid-lab
rm -rf venv
```

## 참고

- [섹션2: ACID](/study/database/section-2-acid/) — 개념 정리
- [섹션2 실습: ACID 직접 까보기](/study/database/section-2-acid-lab/) — SQL 로 확인한 1차 실습
- [Django 문서: QuerySet 은 언제 평가되나](https://docs.djangoproject.com/en/stable/ref/models/querysets/#when-querysets-are-evaluated)
- [Django 문서: select_for_update](https://docs.djangoproject.com/en/stable/ref/models/querysets/#select-for-update)
- [Django 문서: F() 표현식](https://docs.djangoproject.com/en/stable/ref/models/expressions/#f-expressions)
