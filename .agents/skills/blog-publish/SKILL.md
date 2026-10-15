---
name: blog-publish
description: 다듬어진 초안이나 발표 페이지를 공개 배포한다. 계정과 빌드 점검, 커밋, 푸시, 배포 확인을 진행한다. 공개되므로 푸시 전에 확인받는다.
---

# 공개 배포

공개 사이트(https://loading1031.github.io)에 올라간다. 되돌리려면 커밋을 다시 밀어야 하므로
**푸시 전에 반드시 확인받는다.**

## 1. 대상 확인

사용자가 공개하려는 변경 범위를 정한다. 글은 글 목록으로 확인하고, 덱은 지정된
`src/pages/decks/<slug>/index.html` 파일과 그 덱에 필요한 자산을 확인한다. 글을 발행할 때만
아래 목록 명령을 쓴다. 사용자가 명시하지 않은 draft 글이나 다른 변경은 배포에 끼우지 않는다.

```bash
node scripts/blog.mjs list --drafts
```

글 발행인데 `<섹션/슬러그>` 가 주어지지 않았으면 고르게 한다.

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

## 3. 마지막으로 콘텐츠를 읽는다

```bash
node scripts/blog.mjs show <섹션/슬러그>
```

덱이라면 해당 `src/pages/decks/<slug>/index.html` 을 직접 확인한다.

`$blog-refine` 스킬을 아직 안 거쳤다면 글에서는 사내 정보·자격증명, 어시스턴트 말투,
코드 블록 언어 표시를 확인한다. 덱에서는 사내 정보·자격증명, 목차 링크, SVG 대체 설명,
모바일 레이아웃을 확인한다. 문제가 있으면 배포를 멈추고 해당 콘텐츠를 먼저 고친다.

## 4. 공개 대상을 준비하고 커밋

글 발행일 때만 draft 를 해제한다:

```bash
node scripts/blog.mjs ready <섹션/슬러그>
```

덱은 빌드에 `draft` 스위치가 없다. 덱 페이지가 변경되면 빌드 결과에 포함되어 공개 대상이 된다.

**공개하려는 글이나 덱 파일만 스테이징한다.** `git add -A` 를 쓰지 않는다 —
작업 트리에 다른 글의 초안이 남아 있으면 같이 딸려 들어간다.

```bash
git add "src/content/posts/<섹션>/<슬러그>.md"
git status --short          # 스테이징된 것이 그 글 하나뿐인지 확인
```

덱일 때는 `git add "src/pages/decks/<slug>/index.html"` 와 덱 전용 자산만 경로로 지정해 추가한다.

글에 딸린 이미지 등을 추가했다면 그것도 경로를 지정해 함께 담는다.
사이트 코드까지 고쳤다면 그건 **별도 커밋**으로 분리한다.

`git status` 에 다른 글의 초안이 보이면 그대로 둔다. 지우거나 커밋하지 않는다.

커밋 메시지는 한 줄. 글은 `글: <제목>`, 덱은 `덱: <제목>` 형태로 쓴다.

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
curl -s -o /dev/null -w '%{http_code}\n' https://loading1031.github.io/<글-경로-또는-decks/slug>/
```

200 이면 글 URL 을 알리고 끝낸다. 200 이 아니면 1~2분 뒤 다시 확인한다
(Pages 캐시 반영에 시간이 걸릴 수 있다).
