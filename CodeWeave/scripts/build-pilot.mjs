#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const VAULT = resolve(HERE, '../..')
const SOURCE_REL = '01-阶段课程/教学单元/U01-Git与Shell/README.md'
const SOURCE_ID = 'SRC-U01-GIT'
const EXPECTED_SOURCE_SHA256 = '1e5ed98bcc42f9e85ca8d78cc259feffed2d1d921d163f07cb689691990caeec'
const PROJECTION_REL = 'CodeWeave/发布正文/U01-Git与Shell.md'
const CONTENT_ID = 'cw-u01-git-shell'
const EXERCISE_ID = 'ex-u01-pipefail'
const STAGE_ID = 'S0'
const RULES_REL = 'CodeWeave/rules/教学规则.md'
const RULES_JSON_REL = 'CodeWeave/rules/teaching-rules.json'
const TOPIC_INDEX_REL = 'CodeWeave/主题定位索引.md'
const SOURCE_CARD_REL = `CodeWeave/知识来源/${SOURCE_ID}.md`

const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex')
const normalize = (value) => String(value).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}
const inlineList = (items) => `[${items.map((item) => JSON.stringify(String(item))).join(', ')}]`

function write(relative, content) {
  const path = join(VAULT, relative)
  const normalized = normalize(content)
  if (existsSync(path) && readFileSync(path, 'utf8') === normalized) return path
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, normalized, 'utf8')
  return path
}
function writeJson(relative, value) {
  return write(relative, `${JSON.stringify(value, null, 2)}\n`)
}
function readJson(relative) {
  const path = join(VAULT, relative)
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
}
function rewriteRelativeLinks(text) {
  return text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, target) => {
    const clean = target.trim().replace(/^<|>$/g, '')
    if (/^(https?:|mailto:|#)/i.test(clean)) return match
    return label === clean ? label : `${label}（原单元路径：${clean}）`
  })
}
function parseHeadings(text) {
  const lines = normalize(text).split('\n')
  const out = []
  let frontmatter = lines[0]?.trim() === '---'
  let fence = null
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (frontmatter) {
      if (index > 0 && line.trim() === '---') frontmatter = false
      continue
    }
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)
    if (marker) {
      if (fence === null) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null
      continue
    }
    if (fence !== null) continue
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (match) out.push({ level: match[1].length, title: match[2].replace(/\s+#+\s*$/, '').trim(), line: index + 1 })
  }
  return out
}
function topicRecords(text, fileHash) {
  const lines = text.split('\n')
  const marks = parseHeadings(text)
  const h2 = marks.filter((mark) => mark.level === 2)
  return h2.map((mark) => {
    const next = marks.find((candidate) => candidate.line > mark.line && candidate.level <= 2)
    const end = next ? next.line - 1 : lines.length
    const body = lines.slice(mark.line, end).join('\n').trim()
    const ancestors = marks.filter((candidate) => candidate.line < mark.line && candidate.level < 2).map((candidate) => candidate.title)
    const headingPath = [...ancestors, mark.title]
    return {
      path: PROJECTION_REL,
      headingPath,
      title: mark.title,
      level: 2,
      line: mark.line,
      topicKind: body ? 'topic' : 'container',
      sourceIds: [SOURCE_ID],
      verificationStatus: '库内已存在',
      contentHash: sha256(stableStringify({ headingPath, body })),
      fileHash,
      isEmpty: !body,
    }
  })
}
function sectionBody(text, title) {
  const lines = normalize(text).split('\n')
  const marks = parseHeadings(text)
  const mark = marks.find((candidate) => candidate.level === 1 && candidate.title === title)
  if (!mark) throw new Error(`规则来源缺少标题：${title}`)
  const next = marks.find((candidate) => candidate.line > mark.line && candidate.level <= 1)
  const end = next ? next.line - 1 : lines.length
  return lines.slice(mark.line, end).join('\n').trim()
}

const sourceRaw = readFileSync(join(VAULT, SOURCE_REL))
const sourceHash = createHash('sha256').update(sourceRaw).digest('hex')
if (sourceHash !== EXPECTED_SOURCE_SHA256) {
  throw new Error(`源单元已变化，拒绝静默重建投影。请先复核 U01 原文，再更新 EXPECTED_SOURCE_SHA256。\n期望 ${EXPECTED_SOURCE_SHA256}\n实际 ${sourceHash}`)
}
const sourceText = normalize(sourceRaw.toString('utf8'))
const rewritten = rewriteRelativeLinks(sourceText).trim()
const projection = [
  '---',
  'type: knowledge-volume',
  'topic_levels: [2]',
  'updated: 2026-11-20',
  `source_ids: [${SOURCE_ID}]`,
  'verification_status: 库内已存在',
  `source_path: ${SOURCE_REL}`,
  `source_sha256: ${sourceHash}`,
  '---',
  '',
  `> 来源：\`${SOURCE_REL}\`。本页由 CodeWeave 适配生成器投影，不直接编辑；修改请改原文后重跑生成器。`,
  '',
  rewritten,
  '',
].join('\n')
write(PROJECTION_REL, projection)
const projectionHash = sha256(projection)
const records = topicRecords(projection, projectionHash)

const oldManifest = readJson('CodeWeave/content-manifest.json')
const oldTopics = Array.isArray(oldManifest?.topics) ? oldManifest.topics : []
const keyOf = (topic) => `${topic.path}#${topic.headingPath.join(' > ')}`
const existingByKey = new Map(oldTopics.map((topic) => [keyOf(topic), topic]))
let nextSequence = oldTopics.reduce((max, topic) => Math.max(max, Number(/(\d+)$/.exec(topic.topicId)?.[1] ?? 0)), 0)
const currentTopics = records.map((record) => {
  const old = existingByKey.get(keyOf(record))
  const topicId = old?.topicId ?? `topic-${String(++nextSequence).padStart(4, '0')}`
  return { topicId, ...record, status: 'active' }
})
const currentKeys = new Set(currentTopics.map(keyOf))
const retiredTopics = oldTopics
  .filter((topic) => !currentKeys.has(keyOf(topic)))
  .map((topic) => ({ ...topic, status: 'retired', retiredReason: 'generator: 不再由 CodeWeave 首批试点投影生成' }))

const topicIndex = [
  '# CodeWeave 主题定位索引',
  '',
  `## ${PROJECTION_REL.replace(/\.md$/, '')}`,
  ...records.map((record) => `- [[${PROJECTION_REL.replace(/\.md$/, '')}#${record.title}]]`),
  '',
].join('\n')
write(TOPIC_INDEX_REL, topicIndex)

const ruleBody = [
  `- ${STAGE_ID} 开发环境与工程习惯：首批只接入 U01 Git 与 Shell；完成示例、练习和证据不等于 G0 通过。`,
  '- 复习间隔按 0、1、3 天登记；自测与盲测必须由学习者独立完成，资料库不代填掌握度。',
].join('\n')
const rulesText = `# 阶段与复习规则\n\n${ruleBody}\n`
write(RULES_REL, rulesText)
const ruleFingerprint = sha256(sectionBody(rulesText, '阶段与复习规则'))
const rules = {
  schemaVersion: 2,
  ruleVersion: '2026-11-20-pilot.1',
  sourceRefs: [{ path: RULES_REL, headingPath: ['阶段与复习规则'] }],
  ruleSections: [{
    id: 'R-PILOT-STAGES',
    path: RULES_REL,
    headingPath: ['阶段与复习规则'],
    covers: ['stages', 'reviewOffsetsDays'],
  }],
  sectionReviews: {
    'R-PILOT-STAGES': {
      reviewedAt: '2026-11-20',
      reviewer: 'CodeWeave 首批接入',
      fingerprint: ruleFingerprint,
    },
  },
  stages: [{
    id: STAGE_ID,
    title: '开发环境与工程习惯',
    checkpoint: '完成 U01 示例、练习与独立盲测并保留证据；不代表 G0 已通过。',
    deliverables: ['Git 提交历史', '冲突解决记录', 'Shell 退出码证据'],
    prerequisites: [],
  }],
  reviewOffsetsDays: [0, 1, 3],
}
writeJson(RULES_JSON_REL, rules)

const sourceCard = [
  `# ${SOURCE_ID}：U01 Git 与 Shell`,
  '',
  '| 字段 | 值 |',
  '| --- | --- |',
  `| source_id | \`${SOURCE_ID}\` |`,
  '| 核验状态 | 库内已存在 |',
  `| 原始路径 | \`${SOURCE_REL}\` |`,
  `| 原始 SHA-256 | \`${sourceHash}\` |`,
  `| 投影路径 | \`${PROJECTION_REL}\` |`,
  '',
  '本卡登记资料库内自包含教学单元；投影由 `CodeWeave/scripts/build-pilot.mjs` 生成，不替代原单元的独立练习与盲测。',
  '',
].join('\n')
write(SOURCE_CARD_REL, sourceCard)

const primary = records.find((record) => record.title.startsWith('2. ')) ?? records[0]
if (!primary) throw new Error('投影没有可发布的二级主题')
const primaryTopic = currentTopics.find((topic) => keyOf(topic) === keyOf(primary))
const sectionRefs = currentTopics.map((topic) => `${topic.path}#${topic.headingPath.join(' > ')}`)
const primaryRef = `${primaryTopic.path}#${primaryTopic.headingPath.join(' > ')}`
const unit = [
  '---',
  'schemaVersion: 1',
  'type: teaching-unit',
  `contentId: ${CONTENT_ID}`,
  `primaryTopicId: ${primaryTopic.topicId}`,
  `primaryTopicRef: ${JSON.stringify(primaryRef)}`,
  `stageIds: [${STAGE_ID}]`,
  'titleRef: "U01：Git 与 Shell"',
  'subject: Git',
  'language: shell',
  'objective: "理解 Git 提交图、分支与冲突，并能识别 Shell 管道退出码被掩盖的场景。"',
  'lessonKind: guided',
  'prerequisiteRefs: []',
  `sectionRefs: ${inlineList(sectionRefs)}`,
  `exerciseIds: [${EXERCISE_ID}]`,
  'projectTaskRef: ""',
  'runEnvironment: external',
  'executionPolicy: external',
  'estimatedMinutes: 45',
  'reviewOffsetsDays: [0, 1, 3]',
  'verificationStatus: 库内已存在',
  `sourceIds: [${SOURCE_ID}]`,
  'status: published',
  'legacyRefs: []',
  '---',
  '',
  '本单元由资料库 U01 原文投影，保留原有示例、练习和盲测边界。',
  '',
].join('\n')
write('CodeWeave/教学单元/U01-Git与Shell.md', unit)

const exercise = [
  '---',
  'schemaVersion: 1',
  'type: exercise',
  `exerciseId: ${EXERCISE_ID}`,
  `primaryLessonId: ${CONTENT_ID}`,
  `supportingTopicIds: [${primaryTopic.topicId}]`,
  'title: "用 pipefail 暴露管道上游失败"',
  'prompt: "在临时目录运行 false | true，再启用 set -o pipefail 重跑；记录两次退出码，并解释为什么默认管道会掩盖上游失败。"',
  'inputConvention: "在 Bash 中提交命令、退出码与一段解释；不要用 || true 吞掉失败。"',
  'testCases: ["默认 false | true 返回 0", "set -o pipefail 后同一管道返回非 0"]',
  'hintLevels: [L1, L2]',
  'executionPolicy: external',
  'language: shell',
  'version: 1',
  'expectedOutput: ["默认退出码=0", "pipefail退出码=1"]',
  'evidenceChecklist: ["命令原文", "两次退出码", "失败传播解释"]',
  'rubric: ["能复现默认掩盖", "能证明 pipefail 生效", "不伪造退出码"]',
  '---',
  '',
  '```bash',
  'false | true; echo $?',
  'set -o pipefail',
  'false | true; echo $?',
  '```',
  '',
  '外部执行，不把终端输出自动判定为通过。',
  '',
].join('\n')
write('CodeWeave/练习/EX-U01-PIPEFAIL.md', exercise)

writeJson('CodeWeave/mappings/topic-id-map.json', { schemaVersion: 1, entries: [] })
writeJson('CodeWeave/mappings/legacy-map.json', { mapVersion: '2026-11-20-pilot.1', entries: [] })
const manifest = {
  schemaVersion: 1,
  vaultId: oldManifest?.vaultId ?? 'fullstack-study-library',
  publishWhitelist: {
    contentRoot: 'CodeWeave/发布正文',
    contentTypes: ['knowledge-volume'],
    excludedPathSegments: [],
    teachingUnitDir: 'CodeWeave/教学单元',
    exerciseDir: 'CodeWeave/练习',
    sourceRoot: 'CodeWeave/知识来源',
    rulesPath: RULES_JSON_REL,
    legacyMapPath: 'CodeWeave/mappings/legacy-map.json',
    topicIdMapPath: 'CodeWeave/mappings/topic-id-map.json',
    topicIndexPath: TOPIC_INDEX_REL,
  },
  sourceRegistry: {
    ...(oldManifest?.sourceRegistry ?? {}),
    [SOURCE_ID]: { verificationStatus: '库内已存在', path: SOURCE_REL },
  },
  topics: [...currentTopics, ...retiredTopics],
  publishedContentIds: oldManifest?.publishedContentIds ?? [],
}
writeJson('CodeWeave/content-manifest.json', manifest)

console.log(JSON.stringify({
  source: SOURCE_REL,
  sourceSha256: sourceHash,
  projection: PROJECTION_REL,
  projectionSha256: projectionHash,
  topics: currentTopics.length,
  retiredTopics: retiredTopics.length,
  primaryTopicId: primaryTopic.topicId,
  rulesFingerprint: ruleFingerprint,
  files: [
    'CodeWeave/content-manifest.json', PROJECTION_REL, TOPIC_INDEX_REL,
    'CodeWeave/教学单元/U01-Git与Shell.md', 'CodeWeave/练习/EX-U01-PIPEFAIL.md',
    SOURCE_CARD_REL, RULES_REL, RULES_JSON_REL,
    'CodeWeave/mappings/topic-id-map.json', 'CodeWeave/mappings/legacy-map.json',
  ],
}, null, 2))
