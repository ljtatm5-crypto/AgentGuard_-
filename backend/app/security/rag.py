"""知识库与检索：正常 / 冲突 / 含测试性恶意指令三类文档。

信任等级（trust）是知识库隔离修复的核心：
    trusted   —— 官方维护的校园知识，可作为事实依据
    conflict  —— 与官方知识冲突的旧版本/来源不明文档，只能作为参考
    untrusted —— 含测试性恶意指令的文档（由本平台导出，仅供授权靶场使用）

检索实现为确定性的字符二元组 + 词面打分，保证同一输入同一结果，
使「修复前后同集回归」的差异只来自 Agent/策略变化，而不是检索抖动。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

# 知识文档随包分发（backend/app/security/knowledge/），不依赖仓库外路径
KNOWLEDGE_DIR = Path(__file__).resolve().parent / "knowledge"

TRUST_TRUSTED = "trusted"
TRUST_CONFLICT = "conflict"
TRUST_UNTRUSTED = "untrusted"


@dataclass
class Chunk:
    doc_id: str
    title: str
    scope: str
    trust: str
    version: str
    source: str
    text: str
    section: str = ""
    score: float = 0.0

    def to_dict(self) -> dict:
        return {
            "doc_id": self.doc_id, "title": self.title, "scope": self.scope,
            "trust": self.trust, "version": self.version, "source": self.source,
            "section": self.section, "score": self.score,
            "excerpt": self.text[:160],
        }

    def citable(self) -> str:
        return f"{self.title}#{self.section}"


_FRONT_MATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.S)


def _parse_doc(path: Path) -> tuple[dict, str]:
    raw = path.read_text(encoding="utf-8")
    meta: dict[str, str] = {}
    body = raw
    m = _FRONT_MATTER.match(raw)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
        body = raw[m.end():]
    meta.setdefault("doc_id", path.stem)
    meta.setdefault("title", path.stem)
    meta.setdefault("scope", "notices")
    meta.setdefault("trust", TRUST_TRUSTED)
    meta.setdefault("version", "1.0")
    meta.setdefault("source", str(path.parent.name))
    return meta, body.strip()


class KnowledgeBase:
    """从 data/knowledge/**/*.md 加载知识文档，按作用域过滤后可检索。"""

    def __init__(self, root: str | Path | None = None):
        self.root = Path(root) if root else KNOWLEDGE_DIR
        self.docs: list[dict] = []
        self.chunks: list[Chunk] = []
        self.reload()

    def reload(self) -> None:
        self.docs.clear()
        self.chunks.clear()
        if not self.root.exists():
            return
        for path in sorted(self.root.rglob("*.md")):
            meta, body = _parse_doc(path)
            doc = {**meta, "path": str(path), "body": body}
            self.docs.append(doc)
            for section, text in _split_sections(body):
                if not text.strip():
                    continue
                self.chunks.append(Chunk(
                    doc_id=meta["doc_id"], title=meta["title"], scope=meta["scope"],
                    trust=meta["trust"], version=meta["version"], source=meta["source"],
                    text=text.strip(), section=section,
                ))

    def stats(self) -> dict:
        out: dict[str, int] = {}
        for d in self.docs:
            out[d["trust"]] = out.get(d["trust"], 0) + 1
        return {"docs": len(self.docs), "chunks": len(self.chunks), "by_trust": out}

    def search(self, query: str, scope: str | None = None, top_k: int = 3,
               include_trust: set[str] | None = None, per_doc: int = 2) -> list[Chunk]:
        """按文档分组召回：先按文档最高分排序取 top_k 篇，再从每篇取 per_doc 个分节。

        这样既避免单一文档的多个分节挤占全部召回位，也不会因为只留一个分节
        而丢掉同一文档里的关键信息（例如「开放时间」和「借阅规则」分属两节）。
        include_trust=None 表示不做信任隔离（未修复版行为）。
        """
        q = (query or "").strip().lower()
        groups: dict[str, list[Chunk]] = {}
        for ch in self.chunks:
            if scope and ch.scope != scope:
                continue
            if include_trust is not None and ch.trust not in include_trust:
                continue
            score = _score(q, f"{ch.title} {ch.section} {ch.text}".lower())
            if score <= 0:
                continue
            groups.setdefault(ch.doc_id, []).append(Chunk(**{**ch.__dict__, "score": score}))

        ranked = sorted(groups.items(), key=lambda kv: (-max(c.score for c in kv[1]), kv[0]))[:top_k]
        out: list[Chunk] = []
        for _doc_id, chunks in ranked:
            chunks.sort(key=lambda c: (-c.score, c.section))
            out.extend(chunks[:per_doc])
        return out


def _split_sections(body: str) -> list[tuple[str, str]]:
    """按 markdown 标题切分；无标题时整篇为一段。"""
    parts: list[tuple[str, str]] = []
    current_title = "正文"
    buf: list[str] = []
    for line in body.splitlines():
        if line.strip().startswith("#"):
            if buf:
                parts.append((current_title, "\n".join(buf)))
                buf = []
            current_title = line.strip().lstrip("#").strip() or "正文"
        else:
            buf.append(line)
    if buf:
        parts.append((current_title, "\n".join(buf)))
    return parts or [("正文", body)]


def _score(query: str, hay: str) -> float:
    if not query:
        return 0.0
    score = 0.0
    for token in _tokens(query):
        if len(token) >= 2 and token in hay:
            score += 3.0
    qb = {query[i:i + 2] for i in range(len(query) - 1)}
    hb = {hay[i:i + 2] for i in range(len(hay) - 1)}
    score += len(qb & hb) * 0.4
    return round(score, 3)


def _tokens(s: str) -> list[str]:
    return [w for w in re.split(r"[\s,，。；;:：!！?？、（）()\[\]]+", s) if w]
