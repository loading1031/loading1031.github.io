#!/usr/bin/env node
/**
 * 블로그 글 파이프라인 헬퍼.
 *
 * 판단이 필요한 일(무엇을 쓸지, 어떻게 다듬을지)은 스킬이 하고,
 * 틀리면 안 되는 기계적인 일(파일 생성, frontmatter 형식, 계정 확인)은 이 스크립트가 한다.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POSTS_DIR = path.join(ROOT, "src/content/posts");
const SECTIONS_FILE = path.join(ROOT, "src/data/sections.ts");
const EXPECTED_EMAIL = "tjdans1031@gmail.com";
const EXPECTED_OWNER = "loading1031";

/**
 * 섹션 정의는 src/data/sections.ts 한 곳에만 둔다.
 * 여기서는 그 파일을 읽어 key/label 만 뽑아 쓴다 (사이트와 어긋나지 않도록).
 */
function loadSections() {
  const source = fs.readFileSync(SECTIONS_FILE, "utf-8");
  const sections = [];
  const re = /key:\s*"([^"]+)",\s*\n\s*label:\s*"([^"]+)"/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    sections.push({ key: match[1], label: match[2] });
  }
  if (sections.length === 0) {
    fail("src/data/sections.ts 에서 섹션을 읽지 못했다. 파일 형식을 확인할 것.");
  }
  return sections;
}

const SECTIONS = loadSections();
const SECTION_KEYS = SECTIONS.map(s => s.key);

const USAGE = `블로그 글 파이프라인 헬퍼

  node scripts/blog.mjs new --section study --title "제목" --slug my-post [--description "..."] [--tags a,b] [--body-file -]
  node scripts/blog.mjs list [--drafts] [--section study]   글 목록
  node scripts/blog.mjs show <섹션/슬러그>                    글 원문 출력
  node scripts/blog.mjs ready <섹션/슬러그>                   draft 를 내려 배포 대상으로 전환
  node scripts/blog.mjs doctor [--build]                    계정/frontmatter/빌드 점검

섹션: ${SECTIONS.map(s => `${s.key} (${s.label})`).join(" | ")}`;

// ---------- 인자 파싱 ----------

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/**
 * 블로그 폴더 밖에서 실행되는 것을 막는다.
 *
 * 다른 프로젝트(특히 회사 레포) 세션에서 블로그 글을 쓰면, 그 세션 컨텍스트에 사내 정보가
 * 들어 있는 채로 공개될 글을 만들게 된다. 글은 언제나 이 레포에서 연 세션에서 쓴다.
 */
function requireInsideRepo() {
  const cwd = fs.realpathSync(process.cwd());
  const root = fs.realpathSync(ROOT);
  if (cwd !== root && !cwd.startsWith(root + path.sep)) {
    console.error("✗ 블로그 폴더 밖에서는 실행할 수 없다.");
    console.error(`    현재 위치: ${cwd}`);
    console.error(`    블로그 폴더: ${root}`);
    console.error("");
    console.error("  다른 프로젝트 세션에서 블로그 글을 쓰면 그 세션의 컨텍스트(사내 코드 등)가");
    console.error("  공개될 글에 섞일 수 있다. 블로그 폴더에서 세션을 새로 열고 거기서 쓸 것.");
    process.exit(1);
  }
}

// ---------- frontmatter ----------

/** 이 블로그가 쓰는 범위(문자열 / 불리언 / 문자열 배열)만 다루는 최소 파서. */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map(item => item.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    } else if (value === "true" || value === "false") {
      value = value === "true";
    } else {
      value = value.replace(/^['"]|['"]$/g, "");
    }
    data[key] = value;
  }
  return { data, body: match[2] };
}

function quote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

/** Asia/Seoul 기준 ISO 문자열. content 스키마가 z.date() 라 오프셋이 있어야 한다. */
function nowInSeoul() {
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  const seoul = new Date(now.getTime() + 9 * 3600 * 1000);
  return (
    `${seoul.getUTCFullYear()}-${pad(seoul.getUTCMonth() + 1)}-${pad(seoul.getUTCDate())}` +
    `T${pad(seoul.getUTCHours())}:${pad(seoul.getUTCMinutes())}:00+09:00`
  );
}

// ---------- 공용 ----------

function listPosts() {
  const posts = [];
  for (const section of SECTION_KEYS) {
    const dir = path.join(POSTS_DIR, section);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!/\.(md|mdx)$/.test(file) || file.startsWith("_")) continue;
      const filePath = path.join(dir, file);
      const parsed = parseFrontmatter(fs.readFileSync(filePath, "utf-8"));
      posts.push({
        section,
        file,
        filePath,
        slug: file.replace(/\.(md|mdx)$/, ""),
        id: `${section}/${file.replace(/\.(md|mdx)$/, "")}`,
        ...(parsed ?? { data: null, body: "" }),
      });
    }
  }
  // 섹션 디렉터리 밖에 있는 글도 찾아서 알려준다 (라우팅이 안 된다)
  for (const file of fs.readdirSync(POSTS_DIR)) {
    if (!/\.(md|mdx)$/.test(file) || file.startsWith("_")) continue;
    posts.push({
      section: null,
      file,
      filePath: path.join(POSTS_DIR, file),
      slug: file.replace(/\.(md|mdx)$/, ""),
      id: file.replace(/\.(md|mdx)$/, ""),
      data: null,
      body: "",
    });
  }
  return posts.sort((a, b) =>
    String(b.data?.pubDatetime ?? "").localeCompare(String(a.data?.pubDatetime ?? ""))
  );
}

function findPost(id) {
  if (!id) fail("글을 <섹션/슬러그> 형태로 지정해야 한다. 예: study/hello-blog");
  const post = listPosts().find(item => item.id === id || item.slug === id);
  if (!post) fail(`'${id}' 글을 찾을 수 없다. node scripts/blog.mjs list 로 확인.`);
  return post;
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf-8" }).trim();
}

// ---------- 명령어 ----------

function cmdNew(flags) {
  const section = typeof flags.section === "string" ? flags.section : "";
  if (!SECTION_KEYS.includes(section)) {
    fail(`--section 이 필요하다. 사용 가능: ${SECTION_KEYS.join(", ")}`);
  }

  const title = flags.title;
  if (typeof title !== "string" || !title.trim()) fail("--title 이 필요하다.");

  let slug = typeof flags.slug === "string" ? flags.slug : "";
  if (!slug) {
    slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    fail(`slug 이 유효하지 않다: '${slug}'. --slug 로 영문 소문자+하이픈 형태를 직접 지정할 것.`);
  }

  const dir = path.join(POSTS_DIR, section);
  const filePath = path.join(dir, `${slug}.md`);
  if (fs.existsSync(filePath)) fail(`이미 존재한다: src/content/posts/${section}/${slug}.md`);

  const tags = (typeof flags.tags === "string" ? flags.tags : "")
    .split(",")
    .map(tag => tag.trim())
    .filter(Boolean);

  let body = "";
  if (flags["body-file"] === "-") {
    body = fs.readFileSync(0, "utf-8");
  } else if (typeof flags["body-file"] === "string") {
    body = fs.readFileSync(flags["body-file"], "utf-8");
  }

  const lines = [
    "---",
    `title: ${quote(title.trim())}`,
    `description: ${quote(
      typeof flags.description === "string" ? flags.description : "TODO: 한두 문장 요약"
    )}`,
    `pubDatetime: ${typeof flags.pubDatetime === "string" ? flags.pubDatetime : nowInSeoul()}`,
  ];
  if (tags.length > 0) lines.push(`tags: [${tags.map(quote).join(", ")}]`);
  if (flags.publish !== true) lines.push("draft: true");
  lines.push("---");

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n\n${body.trim()}\n`, "utf-8");
  console.log(`✓ 초안 생성: src/content/posts/${section}/${slug}.md`);
  console.log(`  미리보기: npm run dev → http://localhost:4321/${section}/${slug}/`);
}

function cmdList(flags) {
  let posts = listPosts();
  if (flags.drafts) posts = posts.filter(p => p.data?.draft === true);
  if (typeof flags.section === "string") {
    posts = posts.filter(p => p.section === flags.section);
  }
  if (posts.length === 0) {
    console.log(flags.drafts ? "초안 없음." : "글 없음.");
    return;
  }
  for (const post of posts) {
    const state = post.section === null ? "위치오류" : post.data?.draft === true ? "초안  " : "공개  ";
    const date = String(post.data?.pubDatetime ?? "????-??-??").slice(0, 10);
    console.log(`${state} ${date}  ${post.id.padEnd(34)} ${post.data?.title ?? ""}`);
  }
  console.log(`\n총 ${posts.length}개`);
}

function cmdShow(id) {
  console.log(fs.readFileSync(findPost(id).filePath, "utf-8"));
}

function cmdReady(id) {
  const post = findPost(id);
  if (post.data?.draft !== true) {
    console.log(`이미 공개 상태다: ${post.id}`);
    return;
  }
  const raw = fs.readFileSync(post.filePath, "utf-8");
  const updated = raw.replace(/^draft:\s*true\s*\r?\n/m, "");
  if (updated === raw) fail("draft: true 줄을 찾지 못했다. 직접 확인할 것.");
  fs.writeFileSync(post.filePath, updated, "utf-8");
  console.log(`✓ 공개 대상으로 전환: ${post.id}`);
}

function cmdDoctor(flags) {
  let failed = 0;
  const check = (label, ok, detail) => {
    console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failed++;
  };

  // 1. 개인 계정으로 커밋·푸시되는지 (회사 계정 유출 방지)
  let email = "";
  try {
    email = git(["config", "user.email"]);
  } catch {
    /* 설정 없음 */
  }
  check("git 커밋 계정", email === EXPECTED_EMAIL, email || "설정되지 않음");
  if (email !== EXPECTED_EMAIL) {
    console.log(`    고치기: git config user.email ${EXPECTED_EMAIL} && git config user.name ${EXPECTED_OWNER}`);
  }

  let remote = "";
  try {
    remote = git(["remote", "get-url", "origin"]);
  } catch {
    /* 원격 없음 */
  }
  check("origin 원격", remote.includes(`${EXPECTED_OWNER}/`), remote || "설정되지 않음");

  // 전역 credential helper 는 gh 의 활성 계정(회사)을 따라간다.
  let helper = "";
  try {
    helper = execFileSync(
      "git",
      ["config", "--local", "--get-all", "credential.https://github.com.helper"],
      { cwd: ROOT, encoding: "utf-8" }
    );
  } catch {
    /* 설정 없음 */
  }
  const helperPinned = helper.includes(`gh auth token -u ${EXPECTED_OWNER}`);
  check(
    "푸시 자격증명 고정",
    helperPinned,
    helperPinned ? "개인 계정 토큰" : "전역 설정(회사 계정)으로 새어나감"
  );

  // 2. frontmatter
  const posts = listPosts();
  const problems = [];
  for (const post of posts) {
    if (post.section === null) {
      problems.push(`${post.file}: 섹션 디렉터리 밖에 있다 (${SECTION_KEYS.join("/")} 중 하나로 옮길 것)`);
      continue;
    }
    if (!post.data) {
      problems.push(`${post.id}: frontmatter 없음`);
      continue;
    }
    for (const key of ["title", "description", "pubDatetime"]) {
      if (!post.data[key]) problems.push(`${post.id}: ${key} 누락`);
    }
    if (Number.isNaN(Date.parse(post.data.pubDatetime))) {
      problems.push(`${post.id}: pubDatetime 형식 오류 (${post.data.pubDatetime})`);
    }
    if (String(post.data.description).startsWith("TODO")) {
      problems.push(`${post.id}: description 이 아직 TODO`);
    }
    if (post.body.trim().length < 200 && post.data.draft !== true) {
      problems.push(`${post.id}: 본문이 너무 짧다 (공개 글인데 200자 미만)`);
    }
  }
  check(`frontmatter (${posts.length}개 글)`, problems.length === 0);
  for (const problem of problems) console.log(`    ${problem}`);
  if (problems.length > 0) failed++;

  for (const section of SECTIONS) {
    const inSection = posts.filter(p => p.section === section.key);
    const drafts = inSection.filter(p => p.data?.draft === true).length;
    console.log(
      `· ${section.label.padEnd(6)} 공개 ${inSection.length - drafts}, 초안 ${drafts}`
    );
  }

  // 3. 빌드 (--build 일 때만, 느리므로)
  if (flags.build) {
    try {
      execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "pipe" });
      check("프로덕션 빌드", true);
    } catch (error) {
      check("프로덕션 빌드", false);
      console.log(String(error.stdout ?? "") + String(error.stderr ?? ""));
      failed++;
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

// ---------- 진입점 ----------

const [command, ...rest] = process.argv.slice(2);
const { flags, positional } = parseArgs(rest);

if (command) requireInsideRepo();

switch (command) {
  case "new":
    cmdNew(flags);
    break;
  case "list":
    cmdList(flags);
    break;
  case "show":
    cmdShow(positional[0]);
    break;
  case "ready":
    cmdReady(positional[0]);
    break;
  case "doctor":
    cmdDoctor(flags);
    break;
  default:
    console.log(USAGE);
    process.exit(command ? 1 : 0);
}
