/**
 * Append Bootcamp Readiness QA items to AE only (does not touch CRM).
 * Usage: node scripts/add-bootcamp-qa-findings.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { resolve } from 'path'

const AE = '00000000-0000-0000-0000-000000000001'
const SESSION_NAME = 'AE - May 2026 - Bootcamp Readiness'
const REPORTER = 'Aida (From Harshal)'

const NEW_ITEMS = [
  {
    title: 'Missing Node Order Validation & Guidance',
    description:
      'Users are unsure which workflow nodes can follow others. Certain nodes must always be last, but the UI provides no guidance or restrictions.',
    tags: ['builder', 'validation'],
    priority: 'high',
  },
  {
    title: 'Unsupported Node Compatibility Is Unclear',
    description:
      'Users cannot determine which nodes are supported per tenant/customer until runtime failure.',
    tags: ['builder', 'validation'],
    priority: 'high',
  },
  {
    title: 'Preconfigured Workflow Templates Needed',
    description: 'Common workflows are recreated all the time. Need reusable templates for frequent use cases.',
    tags: ['templates'],
    priority: 'high',
  },
  {
    title: 'Missing "What\'s New" section for updates',
    description:
      'Users are unaware of new workflow activities/features added to the system. Also applies to changes to current activities. Activity name changes cause confusion.',
    tags: ['overall experience'],
    priority: 'medium',
  },
  {
    title: 'Split-Screen Should Be Default for UCX nodes',
    description:
      'UCX-enabled tenants should have split screen enabled by default for candidate-facing activities',
    tags: ['ucx', 'side panels'],
    priority: 'high',
  },
  {
    title: 'Extend Validation',
    description:
      'Builder should extend to cover all errors and to provide warnings and recommendations as well.',
    tags: ['builder', 'validation'],
    priority: 'medium',
  },
  {
    title: 'Detect Conflicting Screening Logic',
    description: 'Screening qualification/disqualification rules can conflict without detection.',
    tags: ['screening'],
    priority: 'high',
  },
  {
    title: 'Trigger Node Is Confusing',
    description: 'Trigger configuration is unclear due to locale/job targeting complexity.',
    tags: ['trigger', 'builder'],
    priority: 'high',
  },
  {
    title: 'Job Selection Dropdown Is Incomplete',
    description:
      'Only posted jobs appear in dropdowns, blocking setup for unpublished jobs. No warning is given, users just don\'t know why they don\'t appear.',
    tags: ['trigger'],
    priority: 'high',
  },
  {
    title: 'Support Pre-Live Workflow Assignment',
    description: 'Users want workflows configured before jobs are posted/live.',
    tags: ['general'],
    priority: 'medium',
  },
  {
    title: 'Adding Activities is More Difficult Now',
    description:
      'The new experience of adding new activities is more difficult to use and adds friction because of the modal. One option could be showing more activities in a side panel.',
    tags: ['builder', 'adding activities'],
    priority: 'medium',
  },
  {
    title: 'Add Contextual Node Suggestions',
    description:
      'When clicking the Plus button to add activities, the builder should recommend logical next steps',
    tags: ['guidance', 'builder'],
    priority: 'medium',
  },
  {
    title: 'Job Search vs Job Application Is Confusing',
    description:
      'It\'s difficult to understand the distinction between workflow types. Job Application should be the default entry point instead of Job Search.',
    tags: ['workflow list'],
    priority: 'high',
  },
  {
    title: 'Chatbot & Web Workflows Should Be Linked',
    description:
      'Maintaining separate chatbot/web workflows for the same exact purpose creates inconsistencies. Possible solution: create shared workflow architecture with channel-specific overrides.',
    tags: ['channels', 'general'],
    priority: 'high',
  },
  {
    title: 'Go to node',
    description: 'Connection arrows/buttons remain visible after node deletion.',
    tags: ['bug'],
    priority: 'low',
    categories: ['bugs'],
  },
  {
    title: 'Add Workflow Simulation Mode',
    description:
      'It\'s difficult for users to test their workflows (a mandatory step). If they change something about the 10th node and want to preview it, they have to go through all 9 steps to reach the 10th and preview it in the published UCX. Therefore, having a preview/simulation mode with dummy data, allowing users to jump directly to any step, would be a great feature.',
    tags: ['ucx', 'new feature'],
    priority: 'low',
    categories: ['Improvement'],
  },
]

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
  const env = {}
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    env[line.slice(0, i)] = line.slice(i + 1).replace(/^["']|["']$/g, '')
  }
  return env
}

function descHtml(text) {
  return `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
}

function newFinding(item) {
  const now = new Date().toISOString()
  return {
    id: randomUUID(),
    title: item.title,
    description: descHtml(item.description),
    tags: item.tags,
    priority: item.priority,
    effort: 'medium',
    status: 'not_started',
    environment: 'STG',
    categories: item.categories ?? ['Improvement'],
    comments: [],
    screenshots: [],
    figmaLink: '',
    ticketLink: '',
    assignee: '',
    reporter: REPORTER,
    createdAt: now,
    updatedAt: now,
  }
}

async function fetchAeState(sb) {
  const { data: sessions, error: sErr } = await sb
    .from('qa_sessions')
    .select('id, name, created_at')
    .eq('workspace_id', AE)
  if (sErr) throw sErr

  const { data: findings, error: fErr } = await sb.from('qa_findings').select('*').eq('workspace_id', AE)
  if (fErr) throw fErr

  const findingIds = (findings ?? []).map((f) => f.id)
  let comments = []
  let screenshots = []
  if (findingIds.length > 0) {
    const { data: c } = await sb.from('qa_comments').select('*').eq('workspace_id', AE).in('finding_id', findingIds)
    const { data: sh } = await sb.from('qa_screenshots').select('*').eq('workspace_id', AE).in('finding_id', findingIds)
    comments = c ?? []
    screenshots = sh ?? []
  }

  const commentsByFinding = new Map()
  for (const c of comments) {
    if (!commentsByFinding.has(c.finding_id)) commentsByFinding.set(c.finding_id, [])
    commentsByFinding.get(c.finding_id).push({
      id: c.id,
      author: c.author,
      text: c.text,
      createdAt: c.created_at,
    })
  }
  const shotsByFinding = new Map()
  for (const sh of screenshots) {
    if (!shotsByFinding.has(sh.finding_id)) shotsByFinding.set(sh.finding_id, [])
    shotsByFinding.get(sh.finding_id).push({
      id: sh.id,
      name: sh.name,
      dataUrl: sh.data_url,
      createdAt: sh.created_at,
    })
  }

  const findingsBySession = new Map()
  for (const f of findings ?? []) {
    if (!findingsBySession.has(f.session_id)) findingsBySession.set(f.session_id, [])
    findingsBySession.get(f.session_id).push({
      id: f.id,
      title: f.title,
      description: f.description,
      tags: f.tags ?? [],
      priority: f.priority,
      effort: f.effort ?? 'medium',
      status: f.status,
      environment: f.environment,
      categories: f.categories ?? ['bugs'],
      comments: commentsByFinding.get(f.id) ?? [],
      screenshots: shotsByFinding.get(f.id) ?? [],
      figmaLink: f.figma_link ?? '',
      ticketLink: f.ticket_link ?? '',
      assignee: f.assignee ?? '',
      reporter: f.reporter ?? '',
      createdAt: f.created_at,
      updatedAt: f.updated_at,
    })
  }

  return {
    sessions: (sessions ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      createdAt: s.created_at,
      findings: findingsBySession.get(s.id) ?? [],
    })),
  }
}

async function persistAeState(sb, state) {
  const sessionsPayload = state.sessions.map((s) => ({
    workspace_id: AE,
    id: s.id,
    name: s.name,
    created_at: s.createdAt,
  }))
  const findingsPayload = state.sessions.flatMap((s) =>
    s.findings.map((f) => ({
      workspace_id: AE,
      id: f.id,
      session_id: s.id,
      title: f.title,
      description: f.description,
      tags: f.tags,
      priority: f.priority,
      effort: f.effort,
      status: f.status,
      environment: f.environment,
      categories: f.categories,
      figma_link: f.figmaLink,
      ticket_link: f.ticketLink,
      assignee: f.assignee,
      reporter: f.reporter,
      created_at: f.createdAt,
      updated_at: f.updatedAt,
    })),
  )
  const commentsPayload = state.sessions.flatMap((s) =>
    s.findings.flatMap((f) =>
      f.comments.map((c) => ({
        workspace_id: AE,
        id: c.id,
        finding_id: f.id,
        author: c.author,
        text: c.text,
        created_at: c.createdAt,
      })),
    ),
  )
  const screenshotsPayload = state.sessions.flatMap((s) =>
    s.findings.flatMap((f) =>
      f.screenshots.map((sh) => ({
        workspace_id: AE,
        id: sh.id,
        finding_id: f.id,
        name: sh.name,
        data_url: sh.dataUrl,
        created_at: sh.createdAt,
      })),
    ),
  )

  for (const table of ['qa_comments', 'qa_screenshots', 'qa_findings', 'qa_sessions']) {
    const { error } = await sb.from(table).delete().eq('workspace_id', AE)
    if (error) throw error
  }
  if (sessionsPayload.length) {
    const { error } = await sb.from('qa_sessions').insert(sessionsPayload)
    if (error) throw error
  }
  if (findingsPayload.length) {
    const { error } = await sb.from('qa_findings').insert(findingsPayload)
    if (error) throw error
  }
  if (commentsPayload.length) {
    const { error } = await sb.from('qa_comments').insert(commentsPayload)
    if (error) throw error
  }
  if (screenshotsPayload.length) {
    const { error } = await sb.from('qa_screenshots').insert(screenshotsPayload)
    if (error) throw error
  }

  const { error: blobErr } = await sb.from('workspace_app_data').upsert(
    {
      workspace_id: AE,
      id: 'qa',
      data: state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id,id' },
  )
  if (blobErr) throw blobErr
}

async function main() {
  const env = loadEnv()
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
  const state = await fetchAeState(sb)

  let session = state.sessions.find((s) => s.name === SESSION_NAME)
  if (!session) {
    throw new Error(`Session not found: "${SESSION_NAME}". Existing: ${state.sessions.map((s) => s.name).join(', ')}`)
  }

  const existingTitles = new Set(session.findings.map((f) => f.title.trim().toLowerCase()))
  let added = 0
  for (const item of NEW_ITEMS) {
    if (existingTitles.has(item.title.trim().toLowerCase())) {
      console.log(`Skip (exists): ${item.title}`)
      continue
    }
    session.findings.push(newFinding(item))
    existingTitles.add(item.title.trim().toLowerCase())
    added++
  }

  if (added === 0) {
    console.log('All items already present; nothing to add.')
    return
  }

  await persistAeState(sb, state)
  console.log(`Added ${added} finding(s) to "${SESSION_NAME}" in Automation Engine (reporter: ${REPORTER}).`)
  console.log(`Session now has ${session.findings.length} finding(s).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
