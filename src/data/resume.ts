/**
 * 홈(소개)에 표시되는 내용. 이 파일만 고치면 홈이 바뀐다.
 *
 * ⚠️ 아래 내용은 자리를 잡아두기 위한 예시다. 실제 경력으로 채울 것.
 *    비워둔 배열(`[]`)은 홈에서 해당 섹션 자체가 렌더링되지 않는다.
 */

export type Period = { from: string; to?: string };

export const profile = {
  name: "윤로딩",
  role: "백엔드 개발자", // TODO: 실제 직무로
  tagline: "배운 걸 흘려보내지 않으려고 기록합니다.",
  location: "Seoul, Korea",
  email: "tjdans1031@gmail.com",
  github: "https://github.com/loading1031",
  /** public/ 아래 경로. 없으면 이니셜 원형이 표시된다. 예: "/avatar.jpg" */
  avatar: undefined as string | undefined,
};

/** 홈 상단 소개. 두세 문장이면 충분하다. */
export const summary = `TODO: 어떤 일을 해왔고 무엇에 관심이 있는지 두세 문장으로.
기술 나열보다 "무슨 문제를 어떻게 풀어왔는지"가 읽는 사람에게 남는다.`;

export const experience: {
  company: string;
  role: string;
  period: Period;
  summary?: string;
  highlights: string[];
}[] = [
  {
    company: "TODO: 회사명",
    role: "TODO: 직무",
    period: { from: "2024.01" },
    summary: "TODO: 팀에서 맡은 범위 한 줄.",
    highlights: [
      "TODO: 무엇을 만들었고 그래서 뭐가 달라졌는지. 가능하면 수치.",
      "TODO: 기술 선택을 했다면 왜 그걸 골랐는지.",
    ],
  },
];

export const education: {
  school: string;
  degree: string;
  period: Period;
  note?: string;
}[] = [
  {
    school: "TODO: 학교",
    degree: "TODO: 전공",
    period: { from: "2020.03", to: "2024.02" },
  },
];

export const skills: { category: string; items: string[] }[] = [
  { category: "Language", items: ["TODO", "TODO"] },
  { category: "Backend", items: ["TODO"] },
  { category: "Infra", items: ["TODO"] },
];

/** 자격증. 상세 후기는 /cert 섹션에 글로 쓴다. */
export const certifications: {
  name: string;
  issuer: string;
  date: string;
}[] = [];

/** 대표 프로젝트. 자세한 기록은 /project 섹션에 글로 쓴다. */
export const featuredProjects: {
  name: string;
  description: string;
  url?: string;
  stack: string[];
}[] = [];

export function formatPeriod({ from, to }: Period): string {
  return `${from} – ${to ?? "현재"}`;
}
