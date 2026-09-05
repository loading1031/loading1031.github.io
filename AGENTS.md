# loading.log

공부한 내용과 Claude와의 대화에서 얻은 인사이트를 정리해 올리는 개인 기술 블로그.
[AstroPaper](https://github.com/satnaing/astro-paper) v6 기반 (Astro 7 + Tailwind 4),
홈은 이력서, 글은 네 섹션으로 나뉜다. GitHub Pages 배포.

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

### ⚠️ 글 하나 = 세션 하나

**글 하나를 끝낼 때까지가 세션 하나다.** 한 세션에서 여러 글을 쓰지 않는다.

이유는 위와 같다. A 글을 쓰면서 읽은 참고 자료·강의 내용·대화가 컨텍스트에 남아 있는 채로
B 글을 쓰면, A 의 내용이 B 에 섞여 들어간다. 사실관계가 어긋나고, 자료 출처가 뒤엉키고,
회사 자료가 끼어 있었다면 그게 다른 글로 새어나간다.

글 하나를 발행(또는 초안 저장)하고 나면 **세션을 닫고 새로 연다.**
이어서 다른 글을 써달라는 요청을 받으면, 쓰지 말고 새 세션을 열라고 안내한다.

**브랜치는 쓰지 않는다.** 혼자 쓰는 정적 블로그라 리뷰어가 없고,
`draft: true` 가 이미 "아직 안 보이는 상태" 역할을 한다. 대신 두 가지를 지킨다.

- 발행할 때 `git add -A` 를 쓰지 않는다. **그 글 파일만 경로로 지정해 스테이징한다.**
  작업 트리에 다른 글의 초안이 남아 있으면 같이 딸려 들어간다.
- 글 커밋과 사이트 코드 커밋을 섞지 않는다.

(사이트를 크게 개편하거나 여러 글을 동시에 진행해야 하면 그때 브랜치를 쓴다.)

### 참고 자료는 `ref/` 에 둔다

강의 노트, 다른 AI 와 나눈 대화 내보내기, PDF 같은 재료는 `ref/` 에 넣는다.
이 디렉터리는 `.gitignore` 에 있어 **커밋되지 않는다.**

글을 쓸 때 재료로 읽되, **그대로 옮기지 않는다.** 이해한 내용을 사용자의 말로 다시 쓴다.
`ref/` 안의 대화에도 회사 정보나 개인 정보가 섞여 있을 수 있으므로 그대로 통과시키지 않는다.

### 세 단계

```
   [ 이 폴더에서 연 세션 · 글 하나당 세션 하나 ]

   /blog-capture   ┐
   또는            ├→   /blog-refine   →   /blog-publish
   /blog-lecture   ┘    독자 눈으로 편집     점검 → 푸시 → 배포
   초안 저장             draft 유지         draft 해제, 공개
   draft: true
```

**`/blog-capture`** — 사용자가 무엇을 알게 됐는지 듣고, 남길 가치가 있는지 판단하고
(기준: 6개월 뒤의 내가 읽고 바로 써먹을 수 있는가), 회사 정보를 걷어낸 뒤 글로 쓴다.
회사 관련 내용은 익명화가 아니라 **같은 원리를 보여주는 새 최소 재현 예제로 다시 쓴다.**
그렇게 다시 쓸 수 없으면 글로 만들지 않는다. `draft: true` 로 저장되므로 배포되지 않는다.

**`/blog-lecture`** — 온라인 강의 한 섹션을 정리할 때. 강의별 섹션·태그·제목 규칙
(`섹션N: 주제`)이 스킬 안의 등록부에 고정돼 있고, `ref/` 자료를 재료로 읽는다.
강의 요약이 아니라 **강의가 답을 안 준 지점과 내가 막혔던 것**을 쓰게 한다.
글은 **공부 내용 / 심화 / 보충 개념** 세 층으로 나눈다 — 강의가 알려준 것,
거기서 파고든 것, 그걸 이해하려다 걸린 DB 일반 용어를 섞지 않는다.

강의 정리는 **정리 글 + 실습 글** 두 개로 나올 수 있다. 확인이 가능한 주제면
`<슬러그>-lab` 으로 실습 글을 따로 만들고 서로 링크한다. 읽는 글과 따라 하는 글은
읽는 방식이 달라서 한 페이지에 두면 둘 다 불편해진다.

**`/blog-diagram`** — 그림이 필요할 때 위 두 스킬이 불러 쓰는 참조 스킬.
무엇을 그릴지 고르는 기준, mermaid 문법, 이 레포에서 실제로 깨졌던 함정, 렌더 확인 방법.

**`/blog-terms`** — 독자가 모를 용어에 한 줄 설명 툴팁을 달고, 긴 설명은 보충 개념 절로
연결한다. `<abbr title="...">` 은 툴팁만, `[용어](#앵커 "설명")` 은 툴팁 + 클릭 이동.

**`/blog-refine`** — 맥락 없는 독자의 눈으로 재검토. AI 말투 제거, 결론 앞으로 끌어내기,
코드 실행 검증, 링크 확인, 보안 재확인. `draft` 는 그대로 둔다.

**`/blog-publish`** — `doctor --build` 로 계정·frontmatter·빌드를 점검하고, draft 를 내리고,
커밋·푸시하고, Actions 배포를 지켜본 뒤 실제 URL 이 뜨는지 확인한다.

### 다이어그램은 mermaid 로 (글마다 최소 하나)

블로그는 보여주는 매체다. **구조·흐름·비교가 나오는 글에는 그림이 들어간다.**
표와 코드블록만으로 끝나는 글은 아직 덜 된 것으로 본다.

` ```mermaid ` 코드펜스를 쓰면 빌드 시점에 SVG 로 구워진다. 클라이언트 JS 는 0이고
색은 CSS 가 테마에 맞춰 덮어쓴다.

**문법·함정·확인 방법은 `/blog-diagram` 스킬에 정리돼 있다.** 그림을 그릴 때는 그걸 읽는다.
여기서는 건드리면 안 되는 것만 적어 둔다.

- `astro.config.ts` — `rehypeMermaid` 옵션, `rehypeMermaidLineBreaks`,
  `syntaxHighlight.excludeLangs: ["mermaid"]` (Shiki 가 mermaid 를 먼저 채가지 않게)
- `src/utils/rehypeMermaidLineBreaks.ts` — `foreignObject` 안의 `<br>` 이 `<br></br>` 로
  직렬화되며 라벨이 잘리던 문제를 고친다. `typography.css` 의 `white-space: pre-line` 과 한 쌍
- `src/styles/typography.css` 의 `svg[aria-roledescription]` — mermaid 가 구워 넣은 색을
  테마 토큰으로 덮어쓴다
- 빌드에 **헤드리스 브라우저가 필요하다.** `package.json` 의 `prebuild` 가 chromium 을
  보장하고, CI 는 한글 라벨 폭 측정을 위해 `fonts-noto-cjk` 를 설치한다

### 손으로 쓸 때

`src/content/posts/_post-template.md` 를 복사해 `src/content/posts/<섹션>/<슬러그>.md` 로 만든다.
디렉터리가 곧 섹션이고 URL 이 된다 — `posts/study/hydration.md` → `/study/hydration/`.

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
node scripts/blog.mjs list --drafts            # 초안 목록
node scripts/blog.mjs show <섹션/슬러그>          # 원문 출력
node scripts/blog.mjs new --section study ...  # 초안 생성 (frontmatter/섹션 검증 포함)
node scripts/blog.mjs ready <섹션/슬러그>         # draft 해제
node scripts/blog.mjs doctor --build           # 계정/frontmatter/빌드 점검
```

## 구조

```
astro-paper.config.ts   # 사이트 제목·설명·소셜·기능 토글 (여기부터 본다)
astro.config.ts         # 통합, i18n(ko), 폰트, 마크다운 플러그인
.claude/skills/         # blog-capture / blog-lecture — 초안 쓰기
                        # blog-diagram / blog-terms — 그림·용어 (다른 스킬에서 불러 씀)
                        # blog-refine / blog-publish — 다듬고 발행
                        # (모두 이 레포 안에서만 동작)
ref/                    # 참고 자료 (강의 노트, AI 대화 내보내기). gitignore 됨
scripts/blog.mjs        # 글 파이프라인 헬퍼 CLI
src/
  data/sections.ts      # 섹션 정의 (key = 디렉터리 = URL). 하위 섹션은 children 에.
                        #   여기만 고치면 사이드바·홈·목록 페이지·검증이 따라온다
  data/resume.ts        # 홈(이력서) 내용. 이 파일만 고치면 홈이 바뀐다
  content/posts/        # 글. project/ study/ cert/ paper/ 하위에 둔다
  content.config.ts     # frontmatter 스키마
  components/Sidebar.astro  # 좌측 고정 네비 (모바일에서는 드로어)
  components/Header.astro   # 모바일 전용 상단 바
  layouts/              # Layout(공통 셸) / PostLayout
  pages/
    index.astro             # 홈 = 이력서
    [section]/index.astro              # 섹션 글 목록      → /study/
    [section]/[subsection]/index.astro # 하위 섹션 글 목록  → /study/database/
    [...slug]/index.astro              # 글 본문          → /study/database/acid/
    tags/ archives/ search/
  styles/theme.css      # 색 토큰 (라이트/다크)
.github/workflows/deploy.yml  # main 푸시 시 자동 배포
```

### 섹션

| 섹션 | 디렉터리 / URL | 담는 것 |
| --- | --- | --- |
| 프로젝트 | `project` | 만들면서 부딪힌 것들. 왜 그렇게 만들었는지까지 |
| Study | `study` | 공부 기록, Claude와의 대화에서 건진 인사이트 |
| └ Database | `study/database` | 트랜잭션, 인덱스, 복제. 강의 정리가 여기 쌓인다 |
| 자격증 | `cert` | 준비 과정, 정리한 개념, 시험 후기 |
| 논문 | `paper` | 읽은 논문을 내 말로 다시 정리한 기록 |

섹션을 추가·수정하려면 `src/data/sections.ts` 한 곳만 고치고 디렉터리를 만든다.
하위 섹션은 `children` 에 넣으면 되고, 두 단계까지 라우팅된다.
사이드바 카운트, 홈 카드, 목록 페이지, `blog.mjs` 검증이 모두 이 파일을 읽는다.

### 알아둘 것

- **제목 번호는 손으로 적지 않는다.** `typography.css` 의 CSS 카운터가 h2 는 `1. 2. 3.`,
  h3 는 `1.1 1.2` 로 매긴다. 절 순서를 바꿔도 번호가 알아서 따라온다.
  사이드바 목차(`TableOfContents.astro`)도 같은 규칙으로 세므로 둘이 어긋나지 않는다.
- **글 페이지에는 사이드바에 목차가 생긴다.** `render()` 가 준 `headings` 를
  글 페이지 → `PostLayout` → `Layout` → `Sidebar` 로 넘기면 된다. 현재 읽는 절은
  IntersectionObserver 로 표시한다. h2·h3 만 목차에 넣는다(h4 이하는 뺀다).
- **초안은 로컬에서만 보인다.** `draft: true` 인 글은 `npm run dev` 에서 보이고 배포 빌드에서 빠진다.
- **동적 OG 이미지는 꺼져 있다.** satori 가 쓰는 폰트를 한글로 바꾸면 Google 폰트의 한글
  서브셋이 100여 개 파일로 쪼개져 있어 글리프 커버리지를 못 채운다. 대신 `public/default-og.png`
  정적 카드를 쓴다. 나중에 한글 서브셋 폰트 파일을 하나 넣으면 `features.dynamicOgImage` 를
  다시 켤 수 있다.
- **검색은 pagefind.** 빌드 시 `dist/pagefind` 를 만들어 `public/` 으로 복사한다.
  이 디렉터리는 `.gitignore` 에 있다.

`CLAUDE.md` 는 이 파일(`AGENTS.md`)로 향하는 심볼릭 링크다. 내용은 여기서 고친다.

## 배포

`main` 에 푸시하면 GitHub Actions 가 빌드해서 Pages 로 배포한다.
배포 상태는 `gh run list` 로 확인.

## 문서

- [AstroPaper README](https://github.com/satnaing/astro-paper#readme) — 테마 원본. 설정 항목 설명이 여기 있다
- [Astro 콘텐츠 컬렉션](https://docs.astro.build/en/guides/content-collections/)
- [Astro 라우팅](https://docs.astro.build/en/guides/routing/)
- [Tailwind CSS v4](https://tailwindcss.com/docs) — `@utility` 로 유틸리티를 정의한다.
  Astro 의 scoped `<style>` 안에서는 `@apply` 가 동작하지 않으므로 공용 유틸리티는
  `src/styles/global.css` 에 둔다.

테마 원본 라이선스는 `LICENSE-astro-paper` 에 있다.
