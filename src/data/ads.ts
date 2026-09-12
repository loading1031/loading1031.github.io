/**
 * 광고(Google AdSense) 설정.
 *
 * **아직 켜지 않았다.** `client` 가 빈 문자열이면 광고 스크립트도, 광고 자리도
 * 아예 렌더되지 않는다 — 카운터(`COUNTER_API`)와 같은 방식이다.
 * 승인을 받으면 아래 두 값만 채우면 켜진다.
 *
 * ## 켜기 전에 해야 하는 일
 *
 * 1. **AdSense 승인.** 기술이 아니라 심사 문제다. 글이 적으면 "가치 없는 콘텐츠"로
 *    반려되는 게 흔하다. 글이 충분히 쌓인 뒤에 신청하는 편이 낫다.
 * 2. **`public/ads.txt` 를 만든다.** 승인 후에 만든다 — **미리 만들어 두면 안 된다.**
 *    내용이 빈 ads.txt 는 "이 사이트에 광고를 팔 수 있는 판매자가 없다"는 선언이라
 *    파일이 아예 없는 것보다 나쁘다. 승인 후 딱 이 한 줄을 넣는다:
 *
 *    ```
 *    google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
 *    ```
 *
 *    `github.io` 는 Public Suffix List 에 등재돼 있어서 `loading1031.github.io` 가
 *    그 자체로 루트 도메인 취급을 받는다. 그래서 커스텀 도메인 없이
 *    `https://loading1031.github.io/ads.txt` 로 서빙되는 이 파일이 유효하다.
 * 3. **개인정보처리방침 페이지.** AdSense 가 요구한다. `/privacy/` 에 이미 있고,
 *    광고를 켜면 쿠키 관련 문단이 자동으로 같이 켜진다.
 *
 * 이 값들은 비밀이 아니다. 클라이언트 번들에 그대로 들어간다.
 */
export const ADSENSE = {
  /** `ca-pub-XXXXXXXXXXXXXXXX`. 빈 문자열이면 광고 전체가 꺼진다. */
  client: "",
  /** 광고 단위별 슬롯 ID. AdSense 대시보드에서 광고 단위를 만들면 나온다. */
  slots: {
    /** 글 본문 끝, 댓글 위. 지금은 이 자리 하나만 쓴다. */
    postBottom: "",
  },
} as const;

/** 광고를 렌더할지. 퍼블리셔 ID 가 없으면 아무것도 하지 않는다. */
export const ADS_ENABLED = ADSENSE.client !== "";
