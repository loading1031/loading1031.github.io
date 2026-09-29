/**
 * 홈(소개)에 표시되는 내용. 이 파일만 고치면 홈이 바뀐다.
 *
 * 공개 페이지이므로 이력서에서 옮길 때 사내 수치·내부 논의·보안 이슈는 뺀다.
 * 비워둔 배열(`[]`)은 홈에서 해당 섹션 자체가 렌더링되지 않는다.
 */

export type Period = { from: string; to?: string };

export const profile = {
  name: "윤성문",
  role: "Back-end Engineer",
  tagline: "배운 걸 흘려보내지 않으려고 기록합니다.",
  location: "Seoul, Korea",
  email: "tjdans1031@gmail.com",
  github: "https://github.com/loading1031",
  /** public/ 아래 경로. 없으면 이니셜 원형이 표시된다. 예: "/avatar.jpg" */
  avatar: undefined as string | undefined,
};

/** 홈 상단 소개. 두세 문장이면 충분하다. */
export const summary = `Python/Django 기반으로 CS 플랫폼, 외부 쿠폰 벤더 연동, 인플루언서 마케팅 플랫폼을 만들어 온 백엔드 개발자입니다.`;

export const experience: {
  company: string;
  role: string;
  period: Period;
  summary?: string;
  highlights: string[];
}[] = [
  {
    company: "Vely Monkeys",
    role: "Back-end Engineer",
    period: { from: "2025.12" },
    summary:
      "인도 시장 커머스 서비스 Maccaron 및 인플루언서 마케팅 플랫폼. Python/Django 기반 서버 4개 저장소에서 작업.",
    highlights: [
      "CS 플랫폼 (2026.04 – 07) — 외부 SaaS(Zendesk)에 의존하던 CS를 설계부터 맡아 자체 구축. 웹훅은 HMAC 검증 후 원본만 적재하고 처리는 배치로 분리해 실패 시 재처리가 가능하게 했습니다. 지표 정의에서는 OPEN→SOLVED→REOPEN 처럼 순환하는 티켓 상태를 '처리중'으로 묶어 보여주자는 제 제안과, 상태를 하나하나 정확히 보고 싶다는 팀원의 요구가 부딪혔습니다. 논의 끝에 \"그 기간에 접수된 티켓의 현재 상태를 본다\"는 정의로 합의했고, 이 정의로는 과거 시점을 소급할 수 없다는 한계도 문서에 남긴 뒤 3차에 나눠 출시했습니다.",
      "리워드 티켓 (2026.08) — 외부 쿠폰 벤더 연동에서 응답을 못 받아도 재시도가 안전하도록, 멱등키를 거래 행에서 파생해 먼저 커밋한 뒤 API를 호출하게 설계. 웹훅은 조건부 원자 UPDATE로 처리하고 12개 PR로 나눠 배포했습니다.",
      "딥링크 착지 정책 (2026.07 – 08) — 외부 진입 시 웹뷰·네이티브 두 스택을 함께 정리해 콜드스타트 뒤로가기 종료와 반복 진입 스택 포화를 해결하고, 리셋을 외부 진입으로 한정해 인앱 스택은 보존. 이 정책은 private 진입 경로와 소스 불변식 테스트로 고정했습니다.",
      "creator-hub (2025.12 – 2026.03) — Instagram API 호출 한도를 Redis 슬라이딩 윈도우로 재설계하고, 발송 요청 영속화와 Celery Beat 재시도 디스패처로 Auto DM 유실과 중복 재시도를 없앴습니다.",
    ],
  },
];

export const education: {
  school: string;
  degree: string;
  period?: Period;
  note?: string;
}[] = [
  {
    school: "가천대학교",
    degree: "컴퓨터공학과 / 금융수학과 복수전공",
  },
];

/** 수상·논문·연구 활동. */
export const awards: { name: string; date: string }[] = [
  {
    name: "2025 교내 창의적 종합 설계 대회 설계상 — GraphDB 기반 추천 시스템(OmniCard)",
    date: "2025.09",
  },
  {
    name: "POSTECH SURF 연구 참여 — BERT 기반 블록체인 트래픽 이상 탐지 논문 재현",
    date: "2025.06 – 07",
  },
  { name: "2025 KAICTS 춘계 학술대회 우수 발표 논문상", date: "2025.05" },
  {
    name: "논문(공저) — A Reconfigurable and Low Complexity Multistage Binary Classification for On-device Cardiovascular Disease Diagnosis, JBER vol.46 no.2",
    date: "2025.04",
  },
  { name: "가천대 iNES 연구실", date: "2024.07 – 2025.06" },
  { name: "UMC 연합 개발 동아리 (4~6기)", date: "2023.03 – 2024.06" },
];

export const skills: { category: string; items: string[] }[] = [
  { category: "Language", items: ["Python"] },
  { category: "Backend", items: ["Django / DRF", "Celery + Beat"] },
  { category: "Data", items: ["PostgreSQL", "Redis"] },
  {
    category: "Infra",
    items: ["AWS (EC2·S3·ALB·Route53·RDS·SES)", "Docker", "GitHub Actions"],
  },
  {
    category: "외부 연동",
    items: [
      "Instagram Graph API",
      "Zendesk",
      "외부 쿠폰 벤더 API",
      "Apple/Google Review API",
    ],
  },
];

/** 자격증. 상세 후기는 /cert 섹션에 글로 쓴다. */
export const certifications: {
  name: string;
  issuer: string;
  date: string;
}[] = [
  { name: "정보처리기사", issuer: "한국산업인력공단", date: "2026.09" },
  { name: "SQLD (SQL 개발자)", issuer: "한국데이터산업진흥원", date: "2025.12" },
];

/** 대표 프로젝트. 자세한 기록은 /project 섹션에 글로 쓴다. */
export const featuredProjects: {
  name: string;
  description: string;
  url?: string;
  stack: string[];
}[] = [
  {
    name: "골방(Golbang)",
    url: "https://play.google.com/store/apps/details?id=com.ines.golbang",
    description:
      "골프 모임·기록 관리 앱. Full-stack 3인으로 Android·iOS 동시 런칭 후 실사용자를 받으며 운영했습니다. (2024.07 – 2026.01)",
    stack: ["Flutter", "Django"],
  },
  {
    name: "OmniCard",
    url: "https://github.com/2025-Gachon-capstone",
    description:
      "구매 이력에 맞춰 혜택이 바뀌는 AI 카드 플랫폼. PM 겸 AI 담당으로 구매 시퀀스 임베딩·그래프 DB 타겟팅·RAG 챗봇을 구현했습니다. (2025.04 – 09)",
    stack: ["Graph DB", "BERT", "RAG"],
  },
  {
    name: "Gifticon-NFT",
    url: "https://github.com/Gachon-BlockChain",
    description:
      "바코드 도용·이중 판매를 막는 NFT 기반 중고 기프티콘 마켓. 스마트 컨트랙트 설계·구현을 전담했습니다. (2025.03 – 05)",
    stack: ["Smart Contract", "Full-stack"],
  },
];

export function formatPeriod({ from, to }: Period): string {
  return `${from} – ${to ?? "현재"}`;
}
