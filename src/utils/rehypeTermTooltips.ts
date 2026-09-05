import type { Root, Element, RootContent } from "hast";

/**
 * 본문 용어에 한 줄 설명 툴팁을 붙인다.
 *
 * 새 문법을 만들지 않고 마크다운이 원래 갖고 있는 title 을 쓴다.
 *
 *   [가시성 검사](#가시성-검사 "스냅샷과 튜플 헤더를 비교해 이 행이 나에게 보이는지 판정")
 *     → 점선 밑줄 + 마우스 올리면 툴팁 + 누르면 아래 상세 설명으로 이동
 *
 *   <abbr title="트랜잭션마다 커밋/중단 상태를 2비트로 적어 둔 파일">pg_xact</abbr>
 *     → 점선 밑줄 + 툴팁만. 따로 상세 설명을 두지 않는 용어에 쓴다.
 *
 * title 속성을 그대로 두면 브라우저 기본 툴팁이 겹쳐 뜨므로 data-tip 으로 옮긴다.
 * 실제 모양은 typography.css 의 `[data-tip]` 규칙이 만든다.
 */
export function rehypeTermTooltips() {
  return (tree: Root) => {
    walk(tree as unknown as Element);
  };
}

/**
 * 마크다운에 직접 쓴 인라인 HTML(`<abbr title="...">`)은 이 시점에 아직 element 가
 * 아니라 raw 문자열 노드다. 그래서 문자열 단계에서 한 번 더 바꿔 준다.
 */
const ABBR_WITH_TITLE = /<abbr\s+title="([^"]*)"\s*>/g;

function rewriteRawAbbr(value: string): string {
  return value.replace(
    ABBR_WITH_TITLE,
    (_match, tip: string) =>
      `<abbr class="term term-plain" tabindex="0" data-tip="${tip}">`
  );
}

function walk(node: Element): void {
  const children = node.children as RootContent[] | undefined;
  if (!children) return;

  for (const child of children) {
    if (child.type === "raw" && typeof child.value === "string") {
      child.value = rewriteRawAbbr(child.value);
      continue;
    }
    if (child.type !== "element") continue;

    const title = child.properties?.title;
    const href = child.properties?.href;
    const isAnchorTerm =
      child.tagName === "a" && typeof href === "string" && href.startsWith("#");
    const isAbbrTerm = child.tagName === "abbr";

    if (typeof title === "string" && title && (isAnchorTerm || isAbbrTerm)) {
      child.properties = {
        ...child.properties,
        title: undefined,
        "data-tip": title,
        className: [
          ...toArray(child.properties?.className),
          "term",
          isAnchorTerm ? "term-linked" : "term-plain",
        ],
      };
      // abbr 은 기본적으로 포커스를 못 받는다. 키보드로도 툴팁을 볼 수 있게 한다.
      if (isAbbrTerm) child.properties.tabIndex = 0;
    }

    walk(child);
  }
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === "string") return value.split(" ").filter(Boolean);
  return [];
}
