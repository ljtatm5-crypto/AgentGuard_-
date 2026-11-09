# 数据库与迁移

## 本地开发

默认使用 SQLite：

```env
AGENTGUARD_DATABASE_URL=sqlite:///./agentguard.db
AGENTGUARD_DB_AUTO_CREATE=true
```

## PostgreSQL / Neon

Vercel Functions 使用 Neon PostgreSQL 连接池，并关闭启动时自动建表：

```env
AGENTGUARD_DATABASE_URL=postgresql+psycopg://USER:PASSWORD@POOLED_HOST/DB?sslmode=require
AGENTGUARD_DB_AUTO_CREATE=false
AGENTGUARD_DB_POOL_SIZE=5
AGENTGUARD_DB_MAX_OVERFLOW=5
AGENTGUARD_DB_POOL_RECYCLE_SECONDS=300
```

首次部署或 Schema 变更时，先迁移再部署新后端：

```bash
cd backend
AGENTGUARD_DATABASE_URL="postgresql+psycopg://..." alembic upgrade head
python scripts/verify_persistence.py
```

## 当前迁移

- `0001_initial`：Agent、TestSuite、TestCase、TestRun、TraceEvent、Finding、AuthorizationRecord 与 Alembic 版本表。
- `0002_case_ground_truth`：为 `test_cases` 增加独立 `ground_truth` JSON 字段；风险指标只读取已审核、按 Agent 版本绑定的真值。

## 已验证

- 空 SQLite 数据库从 `0001_initial` 升级到 `0002_case_ground_truth (head)` 通过。
- SQLite 迁移升级/降级通过。
- SQLite 文件重新建立 SQLAlchemy Engine 后记录仍存在。
- CI 覆盖 PostgreSQL 16 服务、迁移、跨会话持久化和后端测试。
- Vercel 生产后端连接 Neon PostgreSQL；生产迁移与发布验收记录在 `competition/04_运行证据/`。

## 部署顺序

1. 先对 Neon 执行 `alembic upgrade head`。
2. 再部署使用新模型的后端。
3. 最后部署前端并执行匿名/私有读取验收。