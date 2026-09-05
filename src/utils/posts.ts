import { getCollection, type CollectionEntry } from 'astro:content';

/**
 * 공개된 글을 최신순으로 반환한다.
 * draft: true 인 글은 로컬 dev 에서만 보이고 프로덕션 빌드에서는 빠진다.
 */
export async function getPublishedPosts(): Promise<CollectionEntry<'blog'>[]> {
	const posts = await getCollection('blog', ({ data }) => import.meta.env.DEV || !data.draft);
	return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/** 태그별 글 개수를 많은 순으로 반환한다. */
export function collectTags(posts: CollectionEntry<'blog'>[]): { tag: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const post of posts) {
		for (const tag of post.data.tags) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
