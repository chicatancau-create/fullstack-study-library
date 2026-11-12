// MS10 原始面经采集器：渲染公开牛客页面，仅记录可核对的原文片段。
// 规则：登录墙/仅作者可见/内容已删除 → 记 blocked，不绕过；匹配必须命中题号、slug 或公司内唯一题名。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launchBrowser, sleep } from '../../../06-实验代码/_shared/headless.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const BANK = path.resolve(here, '..');
const EVIDENCE_FILE = path.join(here, 'evidence', 'interview-evidence.json');
const LOG_FILE = path.join(here, 'evidence', 'evidence-collection-log.json');

const COMPANY_CODE = {
  字节跳动: 'BD',
  腾讯: 'TX',
  阿里巴巴: 'ALI',
  美团: 'MT',
  滴滴: 'DD',
  华为: 'HW',
};
const COMPANY_SHORT = {
  字节跳动: '字节',
  腾讯: '腾讯',
  阿里巴巴: '阿里',
  美团: '美团',
  滴滴: '滴滴',
  华为: '华为',
};

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  })
);
const company = args.company;
if (!COMPANY_CODE[company]) {
  console.error('用法: node collect_interview_evidence.mjs --company=字节跳动 [--max-pages=3] [--max-posts=30] [--port=9515]');
  process.exit(2);
}
const maxPages = Number(args['max-pages'] || 3);
const maxPosts = Number(args['max-posts'] || 30);
const port = Number(args.port || 9515);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SOFT_404 = ['页面不存在', '内容不存在', '仅作者可见', '该内容已被删除', '页面未找到'];
const LOGIN_WALL = ['登录后查看', '请先登录', '登录后可查看'];

const norm = s => String(s)
  .replace(/\s+/g, '')
  .replace(/[（）()【】\[\]:：、,，.。]/g, '')
  .toLowerCase();

// 从 "112. 路径总和" 拆出题号与题名
function splitTitle(title) {
  const m = String(title).match(/^\s*(\d+)\s*[.、]\s*(.+)$/);
  if (m) return { num: m[1], name: m[2].trim() };
  return { num: null, name: String(title).trim() };
}

// 只接受真 slug；题库里有补充题的 question_url 内嵌了微信/站外链接，必须排除
function slugOf(url) {
  const m = String(url).match(/leetcode\.(?:cn|com)\/problems\/([a-z0-9-]+)\/?$/i);
  return m && !/^(https?|www)$/i.test(m[1]) ? m[1].toLowerCase() : null;
}

function buildMatchers(list) {
  const items = list.map(q => {
    const { num, name } = splitTitle(q.title);
    return { id: q.id, title: q.title, num, name, nname: norm(name), slug: slugOf(q.question_url), link: q.question_url };
  });
  // 公司内题名唯一性：只有唯一且不被更长题名包含时才允许纯题名匹配
  for (const it of items) {
    const sameName = items.filter(o => o.nname === it.nname);
    const longer = items.filter(o => o !== it && o.nname.length > it.nname.length && o.nname.includes(it.nname));
    it.uniqueName = sameName.length === 1 && longer.length === 0 && it.nname.length >= 4;
    it.aliases = buildAliases(it, items);
  }
  return items;
}

// 保守别名：只做无歧义的等价替换，且替换后在公司内仍唯一
function buildAliases(it, items) {
  const out = [];
  const candidates = [];
  // 纯 ASCII 缩写（LRU / LFU / KMP）在面经里常独立出现
  if (/^(?:[A-Z]{2,6})$/.test(it.name) && it.name.length >= 3) candidates.push(it.name);
  // 汉字近义：反转/翻转、环/圈
  const swapped = it.name.replace(/反转/g, '翻转').replace(/翻转/g, '反转');
  if (swapped !== it.name) candidates.push(swapped);
  for (const c of candidates) {
    const nc = norm(c);
    if (nc.length < 3) continue;
    const clash = items.filter(o => o !== it && (o.nname === nc || o.nname.includes(nc) || nc.includes(o.nname)));
    if (clash.length === 0) out.push(c);
  }
  return out;
}

function matchText(text, matchers) {
  const flat = norm(text);
  const hits = [];
  for (const it of matchers) {
    let by = null;
    let quote = null;
    // slug 必须整段独立出现："longest-valid-parentheses" 内含 "valid-parentheses"，
    // 不加边界会把 32 题误判成 20 题
    if (it.slug && new RegExp(`(^|[^a-z0-9-])${escapeRe(it.slug)}([^a-z0-9-]|$)`).test(flat)) {
      by = 'slug';
      quote = lineAround(text, it.slug);
    }
    // 题号后必须跟题名或句读；"LeetCode 79 单词搜索" 与 "LeetCode 212 单词搜索" 不能混
    if (!by && it.num) {
      const re = new RegExp(`(?:leetcode|力扣)\\s*${it.num}(?!\\d)`, 'i');
      const line = lineAroundRegex(text, re);
      if (line && !conflictsWithLineNumber(line, it.num)) {
        by = 'leetcode-number';
        quote = line;
      }
    }
    if (!by && it.num) {
      const re = new RegExp(`(^|[^0-9])${it.num}\\s*[.、]\\s*${escapeRe(it.name)}(?![A-Za-z0-9\\u4e00-\\u9fa5])`);
      if (re.test(text)) {
        by = 'number-title';
        quote = lineAroundRegex(text, re);
      }
    }
    if (!by && it.uniqueName) {
      const re = new RegExp(escapeRe(it.name));
      // 题名命中必须有做题语境：同一行出现涉题字样，排除"平衡二叉树"这类数据结构解说
      const line = lineAroundRegex(text, re);
      if (line && hasExamContext(line) && !conflictsWithLineNumber(line, it.num)) {
        by = 'unique-name';
        quote = line;
      }
    }
    if (!by) {
      for (const alias of it.aliases || []) {
        const re = new RegExp(escapeRe(alias));
        const line = lineAroundRegex(text, re);
        if (line && hasExamContext(line) && !conflictsWithLineNumber(line, it.num)) {
          by = 'alias';
          quote = line;
          break;
        }
      }
    }
    if (by) hits.push({ id: it.id, title: it.title, by, quote: (quote || it.name).slice(0, 118) });
  }
  // 同一题只保留优先级最高的一条命中，避免一题多法重复计入
  const rank = { slug: 0, 'leetcode-number': 1, 'number-title': 2, 'unique-name': 3, alias: 4 };
  const best = new Map();
  for (const h of hits) {
    const cur = best.get(h.id);
    if (!cur || rank[h.by] < rank[cur.by]) best.set(h.id, h);
  }
  return [...best.values()];
}

const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hasExamContext = line => /(手撕|算法|leetcode|力扣|代码题|编程题|撕|题目|实现|写一个)/i.test(line);

// 该行提到 leetcode/力扣 题号但不是本题号 → 这一行属于别的题（如 212 单词搜索 vs 79 单词搜索）
function conflictsWithLineNumber(line, num) {
  if (!num) return false;
  const nums = [...line.matchAll(/(?:leetcode|力扣|\/problems\/)\s*(\d+)/gi)].map(m => m[1]);
  const bare = [...line.matchAll(/[（(]\s*(\d+)\s*[)）]/g)].map(m => m[1]);
  const all = [...nums, ...bare];
  return all.length > 0 && !all.includes(String(num));
}

function lineAround(text, needle) {
  const lines = text.split('\n');
  return (lines.find(l => l.includes(needle)) || '').trim() || null;
}

function lineAroundRegex(text, re) {
  const lines = text.split('\n');
  return (lines.find(l => re.test(l)) || '').trim() || null;
}

// 同一面经常被不同账号重复发帖：只取正文前 15 条问答行做指纹。
// 页面侧栏推荐与热度数字每次都不同，不能参与比对。
function coreOf(text) {
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  const qa = lines.filter(l => /^(\d+[.、]|[1-9]\uFE0F?\u20E3|手撕|一面|二面|三面)/.test(l) && l.length >= 4 && l.length <= 200);
  return qa.slice(0, 15).join('|').replace(/\d+/g, '').replace(/\s+/g, '');
}

function detectRole(title, text) {
  // 帖子内常按场次写「面试岗位：X」；多场面试时取最常见岗位，并如实标注为系列帖
  const declared = [...text.matchAll(/面试岗位[：:]\s*([^\｜|\n，,]{2,20})/g)].map(m => m[1].trim());
  if (declared.length) {
    const tally = new Map();
    for (const d of declared) tally.set(d, (tally.get(d) || 0) + 1);
    const [top, n] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    const basis = declared.length > 1
      ? `正文 ${declared.length} 场面试的岗位标注，最常见为「${top}」（${n} 场）`
      : `正文标注「面试岗位：${top}」`;
    return { role: top, basis };
  }
  const rules = [
    ['全栈', /(全栈|Full[ -]?Stack)/i],
    ['前端', /(前端|React|Vue)[^\n]{0,6}(面|岗|开发|工程师)/i],
    ['算法', /(算法岗|算法工程师|机器学习|大模型|推荐算法|数据科学家)/],
    ['后端', /(后端|服务端|Java|Golang|Go语言|C\+\+后端)/i],
    ['测试', /(测试开发|QA)/],
    ['数据', /(数据分析|数据开发|大数据)/],
  ];
  for (const [role, re] of rules) {
    if (re.test(title)) return { role, basis: '标题明确标注岗位' };
  }
  const head = text.slice(0, 400);
  for (const [role, re] of rules) {
    if (re.test(head)) return { role, basis: `正文首段含「${role}」相关字样` };
  }
  return { role: '未标注', basis: '标题与正文首段未明确岗位' };
}

function extractPublishedAt(text) {
  let m = text.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
  if (m) return m[1];
  m = text.match(/(\d{2}-\d{2} \d{2}:\d{2})/);
  if (m) return `${m[1]}（页面仅显示月日）`;
  return '未标注';
}

// robots.txt 公布 sitemap1/sitemap2；/search 被 Disallow，采集只能走 sitemap
async function fetchSitemapUrls(files) {
  const out = [];
  for (const f of files) {
    try {
      const res = await fetch(`https://www.nowcoder.com/${f}`, {
        headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000),
      });
      const text = await res.text();
      const urls = (text.match(/https:\/\/www\.nowcoder\.com\/(?:discuss|feed\/main\/detail)\/[A-Za-z0-9]+/g) || [])
        .map(u => u.replace(/[?].*$/, ''));
      out.push(...urls);
    } catch (e) {
      console.warn(`sitemap ${f} 读取失败: ${e.message}`);
    }
  }
  return [...new Set(out)];
}

// 用原始 HTML 的 title 预筛，避免为每条候选都启动渲染。
// 结果缓存到 evidence/sitemap-titles.json，换公司复跑不必重扫。
const TITLE_CACHE = path.join(here, 'evidence', 'sitemap-titles.json');
async function loadTitleCache() {
  try { return JSON.parse(fs.readFileSync(TITLE_CACHE, 'utf8')); } catch { return {}; }
}

async function prefilterByTitle(urls, company, limit, cache) {
  const short = COMPANY_SHORT[company];
  const INTERVIEW = /(面经|面试|一面|二面|三面|四面|手撕|秋招|春招|实习|凉经|offer|后端|前端|全栈|算法)/i;
  const todo = urls.filter(u => cache[u] === undefined);
  const CONC = 24;
  for (let i = 0; i < todo.length; i += CONC) {
    const batch = todo.slice(i, i + CONC);
    await Promise.all(batch.map(async url => {
      try {
        const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(12000) });
        const html = await res.text();
        cache[url] = ((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '').trim();
      } catch { cache[url] = ''; }
    }));
    if (i % 480 === 0) console.log(`  标题预筛 ${Math.min(i + CONC, todo.length)}/${todo.length}`);
  }
  fs.writeFileSync(TITLE_CACHE, JSON.stringify(cache) + '\n');

  const hits = [];
  for (const url of urls) {
    const title = cache[url] || '';
    if (!title) continue;
    const related = title.includes(company) || title.includes(short);
    if (related && INTERVIEW.test(title)) hits.push([url, title]);
    if (hits.length >= limit) break;
  }
  return hits;
}

async function sha256Of(url) {  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, bytes: buf.length, sha: crypto.createHash('sha256').update(buf).digest('hex') };
  } catch {
    return { status: 0, bytes: 0, sha: null };
  }
}

const evidence = JSON.parse(fs.readFileSync(EVIDENCE_FILE, 'utf8'));
const log = fs.existsSync(LOG_FILE)
  ? JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'))
  : { schema: 1, note: '面经采集尝试记录：仅记录公开访问结果，遇到登录墙/仅作者可见即停止，不绕过、不猜测 URL。', accessed_at: '', attempts: [] };

const knownUrls = new Set(evidence.records.map(r => r.url.split('?')[0]));
const seenFingerprints = new Set(
  evidence.records
    .map(r => r.body_fingerprint)
    .filter(Boolean)
);
const list = JSON.parse(fs.readFileSync(path.join(BANK, company, '题目索引.json'), 'utf8'));
const matchers = buildMatchers(list);

let nextSeq = evidence.records.filter(r => r.company === company).length + 1;
const newRecords = [];
const attempts = [];

const b = await launchBrowser({ port });
try {
  await b.page.viewport(1280, 900);
  // 候选来源：robots.txt 公布的 sitemap（/search 被 Disallow，不得使用）
  const candidates = new Map();
  const sitemapUrls = await fetchSitemapUrls(['sitemap1.txt', 'sitemap2.txt']);
  const scanBudget = Math.min(sitemapUrls.length, Number(args['scan'] || 1200));
  console.log(`sitemap 候选 URL: ${sitemapUrls.length}（扫描 ${scanBudget} 条）`);
  for (let i = 0; i < scanBudget; i++) {
    const u = sitemapUrls[i];
    if (knownUrls.has(u)) continue;
    candidates.set(u, '');
  }
  const prefilter = await prefilterByTitle([...candidates.keys()], company, maxPosts * 4, await loadTitleCache());
  const targets = prefilter.filter(([url]) => !knownUrls.has(url)).slice(0, maxPosts);
  console.log(`标题预筛后 ${targets.length} 个页面待深抓`);

  for (const [url, label] of targets) {
    await sleep(1800);
    let page = null;
    try {
      await b.page.goto(url);
      await sleep(3200);
      page = await b.page.eval(`(() => {
        const t = document.body ? document.body.innerText : '';
        return { title: document.title, text: t };
      })()`);
    } catch (e) {
      attempts.push({ url, title: label || '', result: 'blocked', reason: `渲染失败: ${e.message}` });
      console.log(`BLOCK ${url} 渲染失败`);
      continue;
    }

    const body = page.text || '';
    const soft = SOFT_404.filter(k => body.includes(k));
    const wall = LOGIN_WALL.filter(k => body.includes(k));
    if (soft.length || wall.length) {
      attempts.push({ url, title: page.title, result: 'blocked', reason: `命中 ${[...soft, ...wall].join('/')}` });
      console.log(`BLOCK ${url} ${[...soft, ...wall].join('/')}`);
      continue;
    }

    // 必须是面经帖：标题或正文出现面试语境；博客合集/资料清单不算
    const INTERVIEW_CTX = /(面经|面试|一面|二面|三面|四面|手撕|秋招|春招|实习面|凉经|oc|offer)/i;
    if (!INTERVIEW_CTX.test(page.title) && !INTERVIEW_CTX.test(body.slice(0, 1200))) {
      attempts.push({ url, title: page.title, result: 'not-interview', reason: '缺少面经语境' });
      console.log(`SKIP-NOTINTERVIEW ${page.title.slice(0, 24)}`);
      continue;
    }
    // 资料/博客合集：正文以站内外链为主（如"10k"博客清单）
    const blogLinks = (body.match(/https?:\/\/[^\s)]+/g) || []).length;
    if (blogLinks > 8) {
      attempts.push({ url, title: page.title, result: 'link-dump', reason: `外链 ${blogLinks} 条，属资料合集` });
      console.log(`SKIP-LINKDUMP ${page.title.slice(0, 24)} (${blogLinks} links)`);
      continue;
    }

    // 公司相关性：标题或正文必须出现目标公司，避免把别家面经验证成本家题目
    const companyHit = page.title.includes(company) || page.title.includes(COMPANY_SHORT[company]) || body.includes(company) || body.includes(COMPANY_SHORT[company]);
    if (!companyHit) {
      attempts.push({ url, title: page.title, result: 'wrong-company', reason: `未出现「${company}」字样` });
      console.log(`SKIP-COMPANY ${page.title.slice(0, 26)}`);
      continue;
    }
    // 多公司合辑帖：题面无法归属到单一公司，不能当本家原始面经
    const others = Object.keys(COMPANY_SHORT).filter(c => c !== company
      && (page.title.includes(c) || page.title.includes(COMPANY_SHORT[c])));
    if (others.length) {
      attempts.push({ url, title: page.title, result: 'multi-company', reason: `标题含其他公司: ${others.join('/')}` });
      console.log(`SKIP-MULTI ${page.title.slice(0, 26)}`);
      continue;
    }

    const hits = matchText(body, matchers);
    if (!hits.length) {
      attempts.push({ url, title: page.title, result: 'no-match', reason: '正文未命中题库题号/题名' });
      console.log(`NOMATCH ${page.title.slice(0, 30)}`);
      continue;
    }

    // 同一面经常被重复发帖：按正文核心区指纹去重（去掉页头作者/时间与页尾计数）
    const fingerprint = crypto.createHash('sha256').update(coreOf(body)).digest('hex');    if (seenFingerprints.has(fingerprint)) {
      attempts.push({ url, title: page.title, result: 'duplicate', reason: '与已采页面正文重复' });
      console.log(`DUP ${page.title.slice(0, 30)}`);
      continue;
    }
    seenFingerprints.add(fingerprint);

    const shell = await sha256Of(url);
    const cleanTitle = page.title.replace(/_牛客网$/, '');
    const role = detectRole(cleanTitle, body);
    const id = `NC-${COMPANY_CODE[company]}-${String(nextSeq++).padStart(3, '0')}`;
    const record = {
      id,
      url,
      title: cleanTitle,
      published_at: extractPublishedAt(body),
      accessed_at: new Date().toISOString().slice(0, 10),
      company,
      role: role.role,
      role_basis: role.basis,
      quote: hits[0].quote,
      supports_questions: [...new Set(hits.map(h => h.id))],
      matches: hits.map(h => ({ question: h.id, by: h.by, quote: h.quote })),
      http_status: shell.status,
      raw_html_bytes: shell.bytes,
      raw_html_sha256: shell.sha,
      hash_scope: 'raw_html_shell；正文由客户端渲染，引文经渲染抓取核对',
      body_fingerprint: fingerprint,
      login_required: false,
      retrieval: 'headless CDP 渲染 + curl 取壳哈希',
      verifier: 'qoder-agent',
      status: 'verified-public',
    };
    newRecords.push(record);
    attempts.push({ url, title: page.title, result: 'success', evidence_id: id, mapped: record.supports_questions });
    console.log(`OK ${id} ${record.supports_questions.join(',')} <- ${record.title.slice(0, 34)}`);
  }
} finally {
  await b.close();
}

if (newRecords.length) {
  evidence.records.push(...newRecords);
  fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(evidence, null, 2) + '\n');
}
log.accessed_at = new Date().toISOString().slice(0, 10);
log.attempts = Array.isArray(log.attempts) ? log.attempts : [];
log.attempts.push(...attempts);
fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2) + '\n');

const linked = new Set(newRecords.flatMap(r => r.supports_questions));
console.log(`\n新增证据 ${newRecords.length} 条，覆盖 ${linked.size} 题；记录 ${attempts.length} 次尝试`);
