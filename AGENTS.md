# loading.log

공부한 내용과 Claude와의 대화에서 얻은 인사이트를 정리해 올리는 개인 기술 블로그.
Astro 블로그 템플릿 기반, GitHub Pages 배포.

- 사이트: https://loading1031.github.io
- 레포: https://github.com/loading1031/loading1031.github.io

## ⚠️ 계정 주의

**반드시 개인 GitHub 계정(`loading1031` / tjdans1031@gmail.com)으로만 커밋·푸시한다.**
이 맥의 전역 git 설정은 회사 계정((회사 계정))이라,
이 레포에는 로컬 설정으로 두 가지가 걸려 있다.

- `user.email` / `user.name` — 커밋 author 가 개인 계정이 되도록
- `credential.https://github.com.helper` — 푸시할 때 개인 계정 토큰을 쓰도록 고정.
  전역 helper 는 `gh` 의 활성 계정(회사)을 따라가므로 이걸 풀면 푸시가 실패한다.

한 번에 확인:

```bash
node scripts/blog.mjs doctor
```

전역 설정(`git config --global`, `gh auth switch`)은 건드리지 않는다.
`gh` CLI 로 이 레포를 조회할 때만 토큰을 따로 넘긴다:

```bash
export GH_TOKEN=$(gh auth token -u loading1031)
gh run list -R loading1031/loading1031.github.io
```

## 글이 올라오는 경로

이 블로그는 손으로 글을 쓰는 곳이 아니라, **Claude 세션에서 나온 내용을 정리해 올리는 곳**이다.

### ⚠️ 글은 반드시 이 폴더에서 연 세션에서 쓴다

다른 프로젝트(특히 회사 프로젝트) 세션에서 블로그 글을 쓰면, **그 세션의 컨텍스트에
사내 코드와 내부 정보가 들어 있는 상태로 공개될 글을 만들게 된다.** 조심해도 새어 나갈 수 있고,
한 번 발행되면 되돌리기 어렵다.

작업하다 남길 거리가 생기면 그 세션에서는 **한두 줄 메모만** 챙겨 나오고
(무엇을 알게 됐는지 / 참고 링크), 이 폴더에서 새 세션을 열어 거기서 쓴다.
다른 세션이 이 폴더 경로를 알고 있더라도 그 세션에서 직접 쓰지 않는다.

`scripts/blog.mjs` 는 레포 밖에서 실행되면 거부한다. 문서상 규칙이 아니라 실제로 막혀 있다.

### 세 단계

```
   [ 이 폴더에서 연 세션 ]
   /blog-capture   →   /blog-refine   →   /blog-publish
   듣고 정리해 초안      독자 눈으로 편집      점검 → 푸시 → 배포
   draft: true          draft 유지          draft 해제, 공개
```

**`/blog-capture`** — 사용자가 무엇을 알게 됐는지 듣고, 남길 가치가 있는지 판단하고
(기준: 6개월 뒤의 내가 읽고 바로 써먹을 수 있는가), 회사 정보를 걷어낸 뒤 글로 쓴다.
회사 관련 내용은 익명화가 아니라 **같은 원리를 보여주는 새 최소 재현 예제로 다시 쓴다.**
그렇게 다시 쓸 수 없으면 글로 만들지 않는다. `draft: true` 로 저장되므로 배포되지 않는다.

**`/blog-refine`** — 맥락 없는 독자의 눈으로 재검토. AI 말투 제거, 결론 앞으로 끌어내기,
코드 실행 검증, 링크 확인, 보안 재확인. `draft` 는 그대로 둔다.

**`/blog-publish`** — `doctor --build` 로 계정·frontmatter·빌드를 점검하고, draft 를 내리고,
커밋·푸시하고, Actions 배포를 지켜본 뒤 실제 URL 이 뜨는지 확인한다.

### 손으로 쓸 때

`src/content/_post-template.md` 를 복사해 `src/content/blog/<slug>.md` 로 만든다.
파일 이름이 곧 URL (`/blog/<slug>/`) 이므로 영문 소문자 + 하이픈으로 짓는다.
`tags` 는 `src/consts.ts` 의 `TAG_LABELS` 에 정의된 값(`study` / `insight` / `til`)을 쓰고,
새 분류는 `TAG_LABELS` 에 한글 라벨을 먼저 등록한다.

글의 기준: **6개월 뒤의 내가 읽고 바로 써먹을 수 있는가.**
Claude 답변은 그대로 붙여넣지 말고 이해한 말로 다시 쓴다.

## 명령어

```bash
npm run dev      # 로컬 서버 (draft 글도 보임)
npm run build    # 프로덕션 빌드 + 타입 체크
npm run preview  # 빌드 결과 미리보기
```

글 파이프라인 헬퍼. 판단은 스킬이 하고, 틀리면 안 되는 기계적인 일은 이 스크립트가 한다.

```bash
node scripts/blog.mjs list --drafts     # 초안 목록
node scripts/blog.mjs show <slug>       # 원문 출력
node scripts/blog.mjs new --title ...   # 초안 생성 (frontmatter/태그 검증 포함)
node scripts/blog.mjs ready <slug>      # draft 해제
node scripts/blog.mjs doctor --build    # 계정/frontmatter/빌드 점검
```

## 구조

```
.claude/skills/    # blog-capture / blog-refine / blog-publish (이 레포 안에서만 동작)
scripts/blog.mjs   # 글 파이프라인 헬퍼 CLI
src/
  consts.ts          # 사이트 제목, 설명, 태그 라벨
  content.config.ts  # 글 frontmatter 스키마
  content/blog/      # 글 (.md / .mdx)
  utils/posts.ts     # draft 필터링, 최신순 정렬, 태그 집계
  components/        # Header, Footer, PostList, TagBadge 등
  layouts/BlogPost.astro
  pages/             # 홈, /blog, /tags, /about, /rss.xml
.github/workflows/deploy.yml  # main 푸시 시 자동 배포
```

`CLAUDE.md` 는 이 파일(`AGENTS.md`)로 향하는 심볼릭 링크다. 내용은 여기서 고친다.

## 배포

`main` 에 푸시하면 GitHub Actions 가 빌드해서 Pages 로 배포한다.
배포 상태는 `gh run list` 로 확인.

## 문서

Astro 공식 문서: https://docs.astro.build
- [콘텐츠 컬렉션](https://docs.astro.build/en/guides/content-collections/)
- [라우팅](https://docs.astro.build/en/guides/routing/)
- [Markdown 작성](https://docs.astro.build/en/guides/markdown-content/)
