/**
 * 글 섹션 정의.
 *
 * `key` 는 `src/content/posts/<key>/` 디렉터리 이름이자 URL 경로가 된다.
 * 예: src/content/posts/study/hydration.md  →  /study/hydration/
 *
 * 섹션을 추가하려면 여기에 항목을 넣고 해당 디렉터리를 만들면 된다.
 * `scripts/blog.mjs` 도 이 파일을 읽어 검증하므로 다른 곳을 고칠 필요는 없다.
 */
export type Section = {
  key: string;
  label: string;
  description: string;
};

export const SECTIONS: Section[] = [
  {
    key: "project",
    label: "프로젝트",
    description: "만들면서 부딪힌 것들. 왜 그렇게 만들었는지까지.",
  },
  {
    key: "study",
    label: "Study",
    description: "공부하며 정리한 기록과 Claude와의 대화에서 건진 인사이트.",
  },
  {
    key: "cert",
    label: "자격증",
    description: "준비 과정, 정리한 개념, 시험장에서 느낀 것.",
  },
  {
    key: "paper",
    label: "논문",
    description: "읽은 논문을 내 말로 다시 정리한 기록.",
  },
];

export const SECTION_KEYS = SECTIONS.map(s => s.key);

export function getSection(key: string): Section | undefined {
  return SECTIONS.find(s => s.key === key);
}

/** 글 id(`study/hydration`)에서 섹션 키를 뽑는다. */
export function sectionOf(id: string): string {
  return id.split("/")[0] ?? "";
}
