import type { Root, Element, RootContent } from "hast";

/**
 * 코드에 translate="no" 를 붙여 브라우저 번역이 건드리지 못하게 한다.
 *
 * 페이지는 lang="ko" 라 외국 방문자에게 번역 제안이 뜨는데, 번역을 켜면
 * SQL 주석·문자열·식별자까지 바뀌어 코드가 결과 표와 맞지 않게 된다.
 * 크롬 내장 번역·구글 번역·사파리 모두 이 속성을 지킨다.
 *
 * 코드블록(<pre>)과 인라인 코드(<code>)만 막는다. mermaid 그림은 라벨을
 * 읽을 수 있어야 하므로 번역되게 둔다 — rehype-mermaid 가 이미 SVG 로
 * 바꿔 놓은 뒤에 돌아야 하는 이유다.
 */
const TAGS = new Set(["pre", "code", "kbd", "samp"]);

export function rehypeNoTranslate() {
  return (tree: Root) => {
    walk(tree as unknown as Element);
  };
}

function walk(node: Element): void {
  const children = node.children as RootContent[] | undefined;
  if (!children) return;

  for (const child of children) {
    if (child.type !== "element") continue;

    if (TAGS.has(child.tagName)) {
      child.properties = { ...child.properties, translate: "no" };
      continue; // 안쪽은 부모 속성을 물려받는다
    }
    walk(child);
  }
}
