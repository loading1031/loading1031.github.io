#!/usr/bin/env node
/**
 * 블로그 글 파이프라인 헬퍼.
 *
 *   node scripts/blog.mjs new --title "..." --slug my-post --tags study --source "..." [--body-file -]
 *   node scripts/blog.mjs list [--drafts]
 *   node scripts/blog.mjs show <slug>
 *   node scripts/blog.mjs ready <slug>        # draft 를 내려서 배포 대상으로 만든다
 *   node scripts/blog.mjs doctor [--build]    # 계정/frontmatter/빌드 점검
 *
 * 판단이 필요한 일(무엇을 쓸지, 어떻게 다듬을지)은 스킬이 하고,
 * 틀리면 안 되는 기계적인 일(파일 생성, frontmatter 형식, 계정 확인)은 이 스크립트가 한다.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_DIR = path.join(ROOT, 'src/content/blog');
const EXPECTED_EMAIL = 'tjdans1031@gmail.com';
const EXPECTED_OWNER = 'loading1031';
const KNOWN_TAGS = ['study', 'insight', 'til'];

const USAGE = `블로그 글 파이프라인 헬퍼

  node scripts/blog.mjs new --title "제목" --slug my-post --tags study [--description "..."] [--source "..."] [--body-file -]
  node scripts/blog.mjs list [--drafts]       초안/공개 글 목록
  node scripts/blog.mjs show <slug>           글 원문 출력
  node scripts/blog.mjs ready <slug>          draft 를 내려 배포 대상으로 전환
  node scripts/blog.mjs doctor [--build]      계정/frontmatter/빌드 점검

태그: ${KNOWN_TAGS.join(' | ')}`;

// ---------- 인자 파싱 ----------

function parseArgs(argv) {
	const flags = {};
	const positional = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg.startsWith('--')) {
			const key = arg.slice(2);
			const next = argv[i + 1];
			if (next === undefined || next.startsWith('--')) {
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
		console.error('✗ 블로그 폴더 밖에서는 실행할 수 없다.');
		console.error(`    현재 위치: ${cwd}`);
		console.error(`    블로그 폴더: ${root}`);
		console.error('');
		console.error('  다른 프로젝트 세션에서 블로그 글을 쓰면 그 세션의 컨텍스트(사내 코드 등)가');
		console.error('  공개될 글에 섞일 수 있다. 블로그 폴더에서 세션을 새로 열고 거기서 쓸 것.');
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
		if (!line.trim() || line.trimStart().startsWith('#')) continue;
		const sep = line.indexOf(':');
		if (sep === -1) continue;
		const key = line.slice(0, sep).trim();
		let value = line.slice(sep + 1).trim();
		if (value.startsWith('[') && value.endsWith(']')) {
			value = value
				.slice(1, -1)
				.split(',')
				.map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
				.filter(Boolean);
		} else if (value === 'true' || value === 'false') {
			value = value === 'true';
		} else {
			value = value.replace(/^['"]|['"]$/g, '');
		}
		data[key] = value;
	}
	return { data, body: match[2] };
}

function quote(value) {
	return `'${String(value).replace(/'/g, "''")}'`;
}

function buildFrontmatter({ title, description, pubDate, tags, draft, source }) {
	const lines = [
		'---',
		`title: ${quote(title)}`,
		`description: ${quote(description)}`,
		`pubDate: ${quote(pubDate)}`,
		`tags: [${tags.map(quote).join(', ')}]`,
	];
	if (source) lines.push(`source: ${quote(source)}`);
	if (draft) lines.push('draft: true');
	lines.push('---');
	return lines.join('\n');
}

// ---------- 공용 ----------

function today() {
	return new Date().toLocaleDateString('sv-SE'); // 로컬 시간대 기준 YYYY-MM-DD
}

function listPosts() {
	if (!fs.existsSync(BLOG_DIR)) return [];
	return fs
		.readdirSync(BLOG_DIR)
		.filter((file) => /\.(md|mdx)$/.test(file))
		.map((file) => {
			const filePath = path.join(BLOG_DIR, file);
			const parsed = parseFrontmatter(fs.readFileSync(filePath, 'utf-8'));
			return { file, filePath, slug: file.replace(/\.(md|mdx)$/, ''), ...(parsed ?? { data: null, body: '' }) };
		})
		.sort((a, b) => String(b.data?.pubDate ?? '').localeCompare(String(a.data?.pubDate ?? '')));
}

function findPost(slug) {
	if (!slug) fail('slug 을 지정해야 한다.');
	const post = listPosts().find((item) => item.slug === slug);
	if (!post) fail(`'${slug}' 글을 찾을 수 없다. node scripts/blog.mjs list 로 확인.`);
	return post;
}

function git(args) {
	return execFileSync('git', args, { cwd: ROOT, encoding: 'utf-8' }).trim();
}

// ---------- 명령어 ----------

function cmdNew(flags) {
	const title = flags.title;
	if (typeof title !== 'string' || !title.trim()) fail('--title 이 필요하다.');

	let slug = typeof flags.slug === 'string' ? flags.slug : '';
	if (!slug) {
		slug = title
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.trim()
			.replace(/\s+/g, '-');
	}
	if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
		fail(`slug 이 유효하지 않다: '${slug}'. --slug 로 영문 소문자+하이픈 형태를 직접 지정할 것.`);
	}

	const filePath = path.join(BLOG_DIR, `${slug}.md`);
	if (fs.existsSync(filePath)) fail(`이미 존재한다: src/content/blog/${slug}.md`);

	const tags = (typeof flags.tags === 'string' ? flags.tags : 'study')
		.split(',')
		.map((tag) => tag.trim())
		.filter(Boolean);
	const unknown = tags.filter((tag) => !KNOWN_TAGS.includes(tag));
	if (unknown.length > 0) {
		fail(`모르는 태그: ${unknown.join(', ')}. 사용 가능: ${KNOWN_TAGS.join(', ')} (새로 만들려면 src/consts.ts 의 TAG_LABELS 에 먼저 등록)`);
	}

	let body = '';
	if (flags['body-file'] === '-') {
		body = fs.readFileSync(0, 'utf-8');
	} else if (typeof flags['body-file'] === 'string') {
		body = fs.readFileSync(flags['body-file'], 'utf-8');
	}

	const frontmatter = buildFrontmatter({
		title: title.trim(),
		description: typeof flags.description === 'string' ? flags.description : 'TODO: 한두 문장 요약',
		pubDate: typeof flags.pubDate === 'string' ? flags.pubDate : today(),
		tags,
		draft: flags.publish !== true,
		source: typeof flags.source === 'string' ? flags.source : undefined,
	});

	fs.mkdirSync(BLOG_DIR, { recursive: true });
	fs.writeFileSync(filePath, `${frontmatter}\n\n${body.trim()}\n`, 'utf-8');
	console.log(`✓ 초안 생성: src/content/blog/${slug}.md`);
	console.log(`  미리보기: npm run dev → http://localhost:4321/blog/${slug}/`);
}

function cmdList(flags) {
	const posts = listPosts();
	const filtered = flags.drafts ? posts.filter((post) => post.data?.draft === true) : posts;
	if (filtered.length === 0) {
		console.log(flags.drafts ? '초안 없음.' : '글 없음.');
		return;
	}
	for (const post of filtered) {
		const state = post.data?.draft === true ? '초안 ' : '공개 ';
		const tags = Array.isArray(post.data?.tags) ? post.data.tags.join(',') : '';
		console.log(`${state} ${post.data?.pubDate ?? '????-??-??'}  ${post.slug.padEnd(28)} [${tags}]  ${post.data?.title ?? ''}`);
	}
	console.log(`\n총 ${filtered.length}개`);
}

function cmdShow(slug) {
	const post = findPost(slug);
	console.log(fs.readFileSync(post.filePath, 'utf-8'));
}

function cmdReady(slug) {
	const post = findPost(slug);
	if (post.data?.draft !== true) {
		console.log(`이미 공개 상태다: ${post.slug}`);
		return;
	}
	const raw = fs.readFileSync(post.filePath, 'utf-8');
	const updated = raw.replace(/^draft:\s*true\s*\r?\n/m, '');
	if (updated === raw) fail('draft: true 줄을 찾지 못했다. 직접 확인할 것.');
	fs.writeFileSync(post.filePath, updated, 'utf-8');
	console.log(`✓ 공개 대상으로 전환: ${post.slug}`);
}

function cmdDoctor(flags) {
	let failed = 0;
	const check = (label, ok, detail) => {
		console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
		if (!ok) failed++;
	};

	// 1. 개인 계정으로 커밋되는지 (회사 계정 유출 방지)
	let email = '';
	try {
		email = git(['config', 'user.email']);
	} catch {
		/* 설정 없음 */
	}
	check('git 커밋 계정', email === EXPECTED_EMAIL, email || '설정되지 않음');
	if (email !== EXPECTED_EMAIL) {
		console.log(`    고치기: git config user.email ${EXPECTED_EMAIL} && git config user.name ${EXPECTED_OWNER}`);
	}

	let remote = '';
	try {
		remote = git(['remote', 'get-url', 'origin']);
	} catch {
		/* 원격 없음 */
	}
	check('origin 원격', remote.includes(`${EXPECTED_OWNER}/`), remote || '설정되지 않음');

	// 전역 credential helper 는 gh 의 활성 계정(회사)을 따라간다.
	// 레포 로컬에서 개인 토큰으로 고정해두지 않으면 푸시가 실패하거나 엉뚱한 계정으로 붙는다.
	let helper = '';
	try {
		helper = execFileSync('git', ['config', '--local', '--get-all', 'credential.https://github.com.helper'], {
			cwd: ROOT,
			encoding: 'utf-8',
		});
	} catch {
		/* 설정 없음 */
	}
	const helperPinned = helper.includes(`gh auth token -u ${EXPECTED_OWNER}`);
	check('푸시 자격증명 고정', helperPinned, helperPinned ? '개인 계정 토큰' : '전역 설정(회사 계정)으로 새어나감');
	if (!helperPinned) {
		console.log(`    고치기: git config --local credential.https://github.com.helper "" && \\`);
		console.log(`             git config --local --add credential.https://github.com.helper '!f() { echo "username=${EXPECTED_OWNER}"; echo "password=$(gh auth token -u ${EXPECTED_OWNER})"; }; f'`);
	}

	// 2. frontmatter
	const posts = listPosts();
	const problems = [];
	for (const post of posts) {
		if (!post.data) {
			problems.push(`${post.file}: frontmatter 없음`);
			continue;
		}
		for (const key of ['title', 'description', 'pubDate']) {
			if (!post.data[key]) problems.push(`${post.file}: ${key} 누락`);
		}
		if (Number.isNaN(Date.parse(post.data.pubDate))) {
			problems.push(`${post.file}: pubDate 형식 오류 (${post.data.pubDate})`);
		}
		if (String(post.data.description).startsWith('TODO')) {
			problems.push(`${post.file}: description 이 아직 TODO`);
		}
		for (const tag of post.data.tags ?? []) {
			if (!KNOWN_TAGS.includes(tag)) problems.push(`${post.file}: 모르는 태그 '${tag}'`);
		}
		if (post.body.trim().length < 200 && post.data.draft !== true) {
			problems.push(`${post.file}: 본문이 너무 짧다 (공개 글인데 200자 미만)`);
		}
	}
	check(`frontmatter (${posts.length}개 글)`, problems.length === 0);
	for (const problem of problems) console.log(`    ${problem}`);
	if (problems.length > 0) failed++;

	const drafts = posts.filter((post) => post.data?.draft === true);
	console.log(`· 초안 ${drafts.length}개 / 공개 ${posts.length - drafts.length}개`);

	// 3. 빌드 (--build 일 때만, 느리므로)
	if (flags.build) {
		try {
			execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'pipe' });
			check('프로덕션 빌드', true);
		} catch (error) {
			check('프로덕션 빌드', false);
			console.log(String(error.stdout ?? '') + String(error.stderr ?? ''));
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
	case 'new':
		cmdNew(flags);
		break;
	case 'list':
		cmdList(flags);
		break;
	case 'show':
		cmdShow(positional[0]);
		break;
	case 'ready':
		cmdReady(positional[0]);
		break;
	case 'doctor':
		cmdDoctor(flags);
		break;
	default:
		console.log(USAGE);
		process.exit(command ? 1 : 0);
}
