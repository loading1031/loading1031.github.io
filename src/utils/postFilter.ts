import type { CollectionEntry } from "astro:content";
import config from "@/config";

/**
 * Determines whether a post is eligible to be listed/rendered.
 *
 * - 초안(draft)은 배포 빌드에서만 제외하고, 로컬 dev 에서는 보여준다
 *   (`/blog-capture` 로 만든 초안을 바로 확인할 수 있어야 하므로)
 * - In production, excludes scheduled posts until `pubDatetime` minus the configured margin
 * - In dev, always shows non-draft posts to make authoring easier
 */
export function postFilter({ data }: CollectionEntry<"posts">) {
  const isPublishTimePassed =
    Date.now() >
    new Date(data.pubDatetime).getTime() - config.posts.scheduledPostMargin;
  if (import.meta.env.DEV) return true;
  return !data.draft && isPublishTimePassed;
}
