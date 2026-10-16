# 协作开发约定

## 分支

- `main`：可运行、可演示、可合并的稳定主线。
- `feature/test-engine`：队员 A，测试用例生成、批量执行、判定和指标。
- `feature/security-agent`：队员 B，Agent 适配、安全样本、工具权限和攻击链。
- `feature/platform`：队员 C，页面、数据展示、报告和部署。

三条功能分支都从最新 `main` 创建。功能分支完成一个可验证的小任务后及时提交，不要在分支里长期堆积一大批互相无关的改动。

## 共享契约

`Agent`、`TestSuite`、`TestCase`、`TestRun`、`TraceEvent`、`Finding` 的字段和状态枚举属于团队公共契约。修改前先在 PR 描述中说明影响，再同时更新后端 Schema、接口说明和前端类型；不要用前端硬编码绕过接口不一致。

## 合并前检查

```powershell
cd backend
uv run pytest

cd ..\frontend
npm run build
```

提交信息建议使用：

```text
feat(test): add mixed judge evidence
fix(security): block protected write tool
feat(platform): add trace panel
```

合并前至少由另一名成员运行相关接口或页面。每次合并后，回到 `main` 跑一遍接入 → 生成 → 执行 → 判定 → 轨迹 → 报告的 P0 闭环。
