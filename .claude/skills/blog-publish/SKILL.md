---
name: blog-publish
description: 다듬어진 초안을 발행한다. 계정/빌드 점검 → draft 해제 → 커밋 → 푸시 → 배포 확인까지. 공개 사이트에 올라가므로 푸시 전에 확인받는다.
---

# 발행

공개 사이트(https://loading1031.github.io)에 올라간다. 되돌리려면 커밋을 다시 밀어야 하므로
**푸시 전에 반드시 확인받는다.**

## 1. 대상 확인

```bash
node scripts/blog.mjs list --drafts
```

slug 이 주어지지 않았으면 고르게 한다.

## 2. 사전 점검

```bash
node scripts/blog.mjs doctor --build
```

이게 통과해야 진행한다. 확인하는 것:
- **커밋 계정이 개인 계정(`tjdans1031@gmail.com`)인가** — 회사 계정으로 커밋되면 안 된다
- origin 이 `loading1031` 레포를 가리키는가
- 모든 글의 frontmatter 가 유효한가
- 프로덕션 빌드가 통과하는가

실패하면 고치고 다시 돌린다. 계정이 틀렸으면 **전역 설정을 건드리지 말고** 레포 로컬만 고친다:

```bash
git config user.email tjdans1031@gmail.com && git config user.name loading1031
```

## 3. 마지막으로 글을 읽는다

```bash
node scripts/blog.mjs show <slug>
```

`/blog-refine` 을 아직 안 거쳤다면 여기서 최소한 이것만 본다:
사내 정보·자격증명이 남아 있지 않은가, 어시스턴트 말투가 없는가, 코드에 언어 표시가 있는가.
문제가 있으면 발행을 멈추고 `/blog-refine` 을 권한다.

## 4. draft 해제하고 커밋

```bash
node scripts/blog.mjs ready <slug>
git add -A
git status --short
```

커밋 메시지는 한 줄. `글: <제목>` 형태로 쓴다.

```bash
git commit -m "글: 제목"
```

## 5. 푸시 (확인 후)

푸시하면 공개된다. **사용자에게 확인받고 실행한다.**

```bash
git push
```

## 6. 배포 확인

푸시하면 GitHub Actions 가 빌드·배포한다. 끝까지 지켜본다.

```bash
export GH_TOKEN=$(gh auth token -u loading1031)
gh run list -R loading1031/loading1031.github.io --limit 1
gh run watch <run-id> -R loading1031/loading1031.github.io --exit-status --interval 10
```

배포 후 실제로 떴는지 확인한다:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://loading1031.github.io/blog/<slug>/
```

200 이면 글 URL 을 알리고 끝낸다. 200 이 아니면 1~2분 뒤 다시 확인한다
(Pages 캐시 반영에 시간이 걸릴 수 있다).
