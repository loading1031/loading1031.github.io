# loading.log

공부한 내용과 Claude와의 대화에서 얻은 인사이트를 정리해 올리는 개인 기술 블로그.
Astro 블로그 템플릿 기반, GitHub Pages 배포.

- 사이트: https://loading1031.github.io
- 레포: https://github.com/loading1031/loading1031.github.io

## ⚠️ 계정 주의

**반드시 개인 GitHub 계정(`loading1031` / tjdans1031@gmail.com)으로만 커밋·푸시한다.**
이 맥의 전역 git 설정은 회사 계정((회사 계정))이므로,
이 레포에는 로컬 설정이 걸려 있다. 커밋 전에 확인:

```bash
git config user.email   # tjdans1031@gmail.com 이어야 함
gh auth status          # loading1031 계정으로 푸시
```

전역 설정을 건드리지 말고, 항상 이 레포의 로컬 설정만 사용한다.

## 글 쓰기

1. `src/content/_post-template.md` 를 복사해 `src/content/blog/<slug>.md` 로 만든다.
   파일 이름이 곧 URL (`/blog/<slug>/`) 이므로 영문 소문자 + 하이픈으로 짓는다.
2. frontmatter 를 채운다. 필수는 `title`, `description`, `pubDate`.
3. `tags` 는 `src/consts.ts` 의 `TAG_LABELS` 에 정의된 값을 쓴다 (`study` / `insight` / `til`).
   새 분류를 추가할 때는 `TAG_LABELS` 에 한글 라벨도 같이 등록한다.
4. `draft: true` 인 글은 로컬(`npm run dev`)에서만 보이고 배포에는 빠진다. 완성되면 지운다.

글의 기준: **6개월 뒤의 내가 읽고 바로 써먹을 수 있는가.**
Claude 답변은 그대로 붙여넣지 말고 이해한 말로 다시 쓴다.

## 명령어

```bash
npm run dev      # 로컬 서버 (draft 글도 보임)
npm run build    # 프로덕션 빌드 + 타입 체크
npm run preview  # 빌드 결과 미리보기
```

## 구조

```
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
