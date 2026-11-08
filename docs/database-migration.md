# 数据库与迁移

## 本地开发

默认使用 SQLite：

```env
AGENTGUARD_DATABASE_URL=sqlite:///./agentguard.db
AGENTGUARD_DB_AUTO_CREATE=true
```

## PostgreSQL / Neon

Vercel Functions 应使用 Neon 的连接池地址，并关闭启动时自动建表：

```env
AGENTGUARD_DATABASE_URL=postgresql+psycopg://USER:PASSWORD@POOLED_HOST/DB?sslmode=require
AGENTGUARD_DB_AUTO_CREATE=false
AGENTGUARD_DB_POOL_SIZE=5
AGENTGUARD_DB_MAX_OVERFLOW=5
AGENTGUARD_DB_POOL_RECYCLE_SECONDS=300
```

首次部署或 Schema 变更时运行：

```bash
cd backend
AGENTGUARD_DATABASE_URL="postgresql+psycopg://..." alembic upgrade head
python scripts/verify_persistence.py
```

## 当前迁移

- `0001_initial`：Agent、TestSuite、TestCase、TestRun、TraceEvent、Finding、AuthorizationRecord 与 Alembic 版本表。

## 已验证

- SQLite 迁移升级/降级通过。
- SQLite 文件重新建立 SQLAlchemy Engine 后记录仍存在。
- CI 新增 PostgreSQL 16 服务、迁移、跨会话持久化和后端测试。

## BLOCKED

真实 Neon 数据库尚未创建，因为需要用户在 Vercel/Neon 完成账号授权并提供连接串。当前线上后端仍使用 `/tmp` SQLite。
