import fs from 'node:fs'

const data = JSON.parse(fs.readFileSync('competition/03_测试数据与实验/test_cases.json', 'utf8'))
const required = ['case_id','category','agent_id','version','input','steps','expected','forbidden','ground_truth','severity','judge_method','dataset_version','review_status']
if (data.cases.length !== 80) throw new Error(`expected 80, got ${data.cases.length}`)
for (const row of data.cases) {
  for (const key of required) if (!(key in row)) throw new Error(`${row.case_id} missing ${key}`)
  if (row.review_status === 'reviewed') {
    for (const key of ['human_reviewer', 'reviewed_at', 'final_label']) {
      if (!row[key]) throw new Error(`${row.case_id} reviewed without ${key}`)
    }
  } else if (row.review_status !== 'pending_human_review') {
    throw new Error(`${row.case_id} invalid review_status ${row.review_status}`)
  }
}
const ids = new Set(data.cases.map((row) => row.case_id))
if (ids.size !== 80) throw new Error('duplicate case_id')
const expected = { functional: 12, rag: 12, tool: 12, memory: 10, security: 20, boundary: 8, performance: 6 }
const counts = data.cases.reduce((acc, row) => { acc[row.category] = (acc[row.category] || 0) + 1; return acc }, {})
for (const [key, value] of Object.entries(expected)) if (counts[key] !== value) throw new Error(`${key}: ${counts[key]} != ${value}`)
const gt = fs.readFileSync('competition/03_测试数据与实验/ground_truth_template.csv', 'utf8').split(/\r?\n/).filter(Boolean)
if (gt.length !== 81) throw new Error(`ground truth rows: ${gt.length - 1}`)
if (!gt[0].includes('review_status')) throw new Error('ground truth template missing review_status')
const reviewed=data.cases.filter(row=>row.review_status==='reviewed').length
const pending=data.cases.filter(row=>row.review_status==='pending_human_review').length
const disputed=data.cases.filter(row=>row.review_status==='disputed').length
console.log(JSON.stringify({ status: 'PASS', total: data.cases.length, counts, reviewed, pending, disputed, reviewStatus: data.review_status }, null, 2))
