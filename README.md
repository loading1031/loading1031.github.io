# loading.log

공부한 내용과 Claude와의 대화에서 얻은 인사이트를 정리하는 개인 블로그.

🔗 https://loading1031.github.io

## 로컬 실행

```bash
npm install
npm run dev
```

## 글이 올라오는 경로

Claude 세션에서 나온 내용을 정리해 올린다.
**글은 반드시 이 폴더에서 연 세션에서 쓴다** — 다른 프로젝트 세션에서 쓰면
그 세션 컨텍스트(사내 코드 등)가 공개될 글에 섞일 수 있다.

| 단계 | 하는 일 |
| --- | --- |
| `/blog-capture` | 무엇을 알게 됐는지 듣고 초안(`draft: true`)으로 저장 |
| `/blog-refine` | 독자 눈으로 편집, 코드·링크 검증 |
| `/blog-publish` | 점검 → draft 해제 → 커밋·푸시 → 배포 확인 |

손으로 쓸 때는 `src/content/_post-template.md` 를 복사해 `src/content/blog/<slug>.md` 로 만든다.
`main` 에 푸시하면 GitHub Actions 가 자동으로 빌드·배포한다.

자세한 내용은 [AGENTS.md](./AGENTS.md) 참고.

Built with [Astro](https://astro.build).
