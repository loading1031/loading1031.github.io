import type { Root, Element, RootContent } from "hast";

/**
 * mermaid 라벨의 줄바꿈을 고친다.
 *
 * rehype-mermaid 가 만든 SVG 안에서 라벨은 <foreignObject> 안의 <p> 에 들어가고
 * 줄바꿈은 <br> 로 표현된다. 그런데 이 <br> 은 SVG 네임스페이스로 직렬화되면서
 * void 태그로 취급되지 않아 `<br></br>` 가 된다. 브라우저는 이걸 줄바꿈 두 번으로
 * 읽으므로, mermaid 가 빌드 시점에 계산해 둔 박스 높이를 넘겨 텍스트가 잘린다.
 *
 * <br> 을 줄바꿈 문자로 바꾸고 CSS 의 `white-space: pre-line` 으로 렌더하면
 * 빌드 시점 측정값과 실제 렌더 줄 수가 일치한다.
 * (typography.css 의 `svg[aria-roledescription]` 규칙과 짝을 이룬다.)
 *
 * foreignObject 안의 <br> 만 건드린다. 본문 마크다운의 <br> 은 그대로 둔다.
 */
export function rehypeMermaidLineBreaks() {
  return (tree: Root) => {
    walk(tree as unknown as Element, false);
  };
}

function walk(node: Element, insideForeignObject: boolean): void {
  const children = node.children as RootContent[] | undefined;
  if (!children) return;

  const inFO = insideForeignObject || node.tagName === "foreignObject";

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type !== "element") continue;

    if (inFO && child.tagName === "br") {
      children[i] = { type: "text", value: "\n" };
      continue;
    }
    walk(child, inFO);
  }
}
