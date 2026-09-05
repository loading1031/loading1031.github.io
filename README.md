# loading.log

공부한 내용과 Claude와의 대화에서 얻은 인사이트를 정리하는 개인 블로그.

🔗 https://loading1031.github.io

## 로컬 실행

```bash
npm install
npm run dev
```

## 글 추가

`src/content/_post-template.md` 를 복사해 `src/content/blog/<slug>.md` 로 만들고 frontmatter 를 채운다.
`main` 에 푸시하면 GitHub Actions 가 자동으로 빌드·배포한다.

자세한 내용은 [AGENTS.md](./AGENTS.md) 참고.

Built with [Astro](https://astro.build).
