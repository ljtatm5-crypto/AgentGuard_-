import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = resolve(process.cwd());
const docs = [
  {
    source: join(repo, 'competition/01_作品介绍文档/AgentGuard_作品说明书.md'),
    html: join(repo, 'competition/01_作品介绍文档/AgentGuard_作品说明书.html'),
    pdf: join(repo, 'competition/01_作品介绍文档/AgentGuard_作品说明书.pdf'),
    png: join(repo, 'competition/01_作品介绍文档/作品说明书_第1页.png'),
    title: 'AgentGuard 智测盾作品说明书',
  },
  {
    source: join(repo, 'competition/03_测试数据与实验/实验分析报告.md'),
    html: join(repo, 'competition/03_测试数据与实验/实验分析报告.html'),
    pdf: join(repo, 'competition/03_测试数据与实验/实验分析报告.pdf'),
    png: join(repo, 'competition/03_测试数据与实验/实验分析报告_第1页.png'),
    title: 'AgentGuard 实验分析报告',
  },
];

const printCss = `
body { font-family: "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; color:#17364a; line-height:1.72; max-width:900px; margin:36px auto; padding:0 28px; }
h1 { color:#102a3d; border-bottom:3px solid #27657a; padding-bottom:12px; line-height:1.25; }
h2 { color:#27657a; margin-top:30px; break-after:avoid; }
h3 { color:#355f70; break-after:avoid; }
p, li { orphans:3; widows:3; }
table { border-collapse:collapse; width:100%; margin:18px 0; break-inside:avoid; }
th,td { border:1px solid #cfdde5; padding:8px 10px; text-align:left; vertical-align:top; }
th { background:#eaf4f2; }
code { background:#f1f5f7; padding:2px 5px; border-radius:4px; overflow-wrap:anywhere; }
pre { background:#f1f5f7; padding:14px; border-radius:8px; overflow:auto; white-space:pre-wrap; }
blockquote { border-left:4px solid #8ab6c4; margin-left:0; padding-left:16px; color:#55758f; }
@page { size:A4; margin:15mm 16mm; }
@media print { body { max-width:none; margin:0; padding:0; } a { color:#27657a; } }
`;

for (const doc of docs) {
  mkdirSync(dirname(doc.html), { recursive: true });
  let html = execFileSync('pandoc', [
    doc.source,
    '--from', 'markdown+pipe_tables',
    '--to', 'html5',
    '--standalone',
    '--metadata', `title=${doc.title}`,
  ], { encoding: 'utf8' });
  html = html.replace(/<header id="title-block-header">[\s\S]*?<\/header>\s*/, '');
  html = html.replace('</head>', `<style>${printCss}</style>\n</head>`);
  writeFileSync(doc.html, html, 'utf8');
}

const playwrightPath = pathToFileURL(join(repo, 'frontend-apple/node_modules/playwright/index.mjs')).href;
const { chromium } = await import(playwrightPath);
const browser = await chromium.launch({ headless: true });
try {
  for (const doc of docs) {
    const page = await browser.newPage({ viewport: { width: 900, height: 1280 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(doc.html).href, { waitUntil: 'load' });
    await page.screenshot({ path: doc.png, fullPage: false });
    await page.pdf({ path: doc.pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
    await page.close();
    const rendered = readFileSync(doc.html, 'utf8');
    if ((rendered.match(/<h1/g) || []).length !== 1) throw new Error(`expected exactly one H1: ${doc.html}`);
    console.log(`rendered ${doc.title}`);
  }
} finally {
  await browser.close();
}