/**
 * 방문자 카운터 API 주소.
 *
 * `counter/` 의 Worker 를 배포하면 나오는 `https://<이름>.<서브도메인>.workers.dev` 를 넣는다.
 * 빈 문자열이면 카운터를 아예 렌더하지 않는다 — 배포 전이나 로컬에서 안전하게 비활성.
 *
 * 이 값은 클라이언트 번들에 들어간다. 공개 URL 이므로 비밀이 아니다.
 */
export const COUNTER_API = "https://blog.tjdans1031.workers.dev";
