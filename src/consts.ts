// 사이트 전역 설정. 다른 파일에서 import 해서 사용한다.

export const SITE_TITLE = 'loading.log';
export const SITE_DESCRIPTION = '공부하며 정리한 기록과 Claude와 나눈 대화에서 건진 인사이트';
export const AUTHOR = 'Yoon Loading';
export const GITHUB_URL = 'https://github.com/loading1031';

/** 글 분류. src/content/blog/*.md 의 tags 값과 매칭된다. */
export const TAG_LABELS: Record<string, string> = {
	study: '공부 기록',
	insight: 'Claude 인사이트',
	til: 'TIL',
};
