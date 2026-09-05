/**
 * 글 섹션 정의.
 *
 * `key` 는 `src/content/posts/` 아래 디렉터리 이름이자 URL 경로가 된다.
 * 하위 섹션(children)을 두면 디렉터리도 한 단계 더 들어간다.
 *
 *   src/content/posts/study/hydration.md           →  /study/hydration/
 *   src/content/posts/study/database/acid.md       →  /study/database/acid/
 *
 * 섹션을 추가하려면 여기에 항목을 넣고 해당 디렉터리를 만들면 된다.
 * 사이드바, 홈 카드, 섹션 목록 페이지, `scripts/blog.mjs` 검증이 모두 이 파일을 읽는다.
 */
export type Section = {
  key: string;
  label: string;
  description: string;
  children?: Section[];
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
    children: [
      {
        key: "database",
        label: "Database",
        description:
          "트랜잭션, 인덱스, 복제 — 데이터베이스가 안에서 실제로 무엇을 하는지.",
      },
    ],
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

export type FlatSection = Section & {
  /** URL 이자 디렉터리 경로. 예: "study" 또는 "study/database" */
  path: string;
  /** 상위 섹션 경로. 최상위면 undefined */
  parentPath?: string;
};

/** 최상위와 하위 섹션을 한 줄로 펼쳐서 반환한다. */
export function flattenSections(
  sections: Section[] = SECTIONS,
  parentPath?: string
): FlatSection[] {
  const out: FlatSection[] = [];
  for (const section of sections) {
    const path = parentPath ? `${parentPath}/${section.key}` : section.key;
    out.push({ ...section, path, parentPath });
    if (section.children) {
      out.push(...flattenSections(section.children, path));
    }
  }
  return out;
}

export const ALL_SECTIONS = flattenSections();
export const SECTION_PATHS = ALL_SECTIONS.map(s => s.path);

export function getSectionByPath(path: string): FlatSection | undefined {
  return ALL_SECTIONS.find(s => s.path === path);
}

/** 글 id(`study/database/acid`)가 속한 섹션 경로(`study/database`)를 돌려준다. */
export function sectionPathOf(id: string): string {
  return id.split("/").slice(0, -1).join("/");
}

/** 글 id 가 속한 섹션 정보. 정의되지 않은 디렉터리면 undefined. */
export function sectionOf(id: string): FlatSection | undefined {
  return getSectionByPath(sectionPathOf(id));
}

/** 그 섹션과 하위 섹션에 속한 글인지. 사이드바 개수 집계에 쓴다. */
export function isUnderSection(id: string, path: string): boolean {
  return id.startsWith(`${path}/`);
}
