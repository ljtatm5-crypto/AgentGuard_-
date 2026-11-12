import json

import pytest

from app.services.xiaoan.retrieval import (
    KeywordRetriever, load_curated_passages, markdown_passages, tokens,
)


def test_chinese_terms_support_partial_queries():
    assert '授权' in tokens('如何完成授权连接 Dify？')
    assert 'dify' in tokens('如何完成授权连接 Dify？')


def test_heading_and_code_block_integrity():
    chunks = markdown_passages(document='example.md', title='说明', route='/agents',
        markdown='# 接入\n\nDify 授权\n\n```python\n# not a heading\nprint("ok")\n```\n\n## 校验\n\n输入授权编号。',
        max_tokens=100, overlap_tokens=12)
    assert len(chunks) == 2
    assert chunks[0].heading == '接入'
    assert '# not a heading' in chunks[0].text
    assert chunks[1].heading == '接入 / 校验'


def test_retrieval_returns_real_source_and_route():
    chunks = markdown_passages(document='guide.md', title='Dify 配置', route='/agents',
        markdown='# 授权接入\n\nDify API Key 通过服务端环境变量配置。')
    hits = KeywordRetriever(chunks).search('Dify API Key')
    assert hits
    assert hits[0][0].document == 'guide.md'
    assert hits[0][0].route == '/agents'
    assert hits[0][0].content_hash


def test_private_source_is_not_indexed(tmp_path):
    base = tmp_path / 'docs' / 'xiaoan'
    base.mkdir(parents=True)
    (base / 'public.md').write_text('# 教学\n\n如何创建测试？', encoding='utf-8')
    (base / 'secret.md').write_text('# 私人\n\n密钥不可外泄。', encoding='utf-8')
    (base / 'sources.json').write_text(json.dumps([
        {'path': 'docs/xiaoan/public.md', 'title': '教学', 'route': '/overview', 'access_level': 'public'},
        {'path': 'docs/xiaoan/secret.md', 'title': '私人', 'route': '/settings', 'access_level': 'private'},
    ]), encoding='utf-8')
    chunks = load_curated_passages(tmp_path)
    assert len(chunks) == 1
    assert '密钥不可外泄' not in chunks[0].text


def test_path_traversal_is_rejected(tmp_path):
    base = tmp_path / 'docs' / 'xiaoan'
    base.mkdir(parents=True)
    (base / 'sources.json').write_text(json.dumps([
        {'path': '../outside.md', 'title': 'bad', 'route': '/', 'access_level': 'public'}
    ]), encoding='utf-8')
    with pytest.raises(ValueError, match='invalid document source'):
        load_curated_passages(tmp_path)


def test_chunk_parameters_and_empty_query():
    with pytest.raises(ValueError):
        markdown_passages(document='x', title='x', markdown='a', route='/', max_tokens=30)
    assert not KeywordRetriever([]).search('')
