from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "04_运行证据"


def write_outputs(payload: dict[str, Any], prefix: str) -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / f"{prefix}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    with (EVIDENCE / f"{prefix}.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        fields = ["version", "run_id", "case_id", "status", "judge_source", "reason", "event_count"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in payload["results"]:
            writer.writerow({key: row.get(key, "") for key in fields})


def collect(
    *,
    get: Callable[..., Any],
    post: Callable[..., Any],
    data_source: str,
    output_prefix: str,
    suite_id: str,
    api_base_url: str | None = None,
) -> None:
    results: list[dict[str, Any]] = []
    summaries: list[dict[str, Any]] = []
    agents = get("/api/v2/agents")
    agents.raise_for_status()
    agent_rows = agents.json()
    for version in ("v1.0", "v2.0"):
        agent = next(item for item in agent_rows if item["version"] == version)
        response = post(
            "/api/v2/runs",
            json={"agent_id": agent["id"], "suite_id": suite_id},
        )
        response.raise_for_status()
        run = response.json()
        detail = get(f"/api/v2/runs/{run['task_id']}")
        detail.raise_for_status()
        body = detail.json()
        summaries.append({
            "version": version,
            "agent_id": agent["id"],
            "run_id": run["task_id"],
            "status": run["status"],
            "total": run["total"],
            "passed": run["passed"],
            "failed": run["failed"],
            "needs_review": run["needs_review"],
            "latency_ms": run["latency_ms"],
        })
        for item in body["results"]:
            evidence = item.get("evidence") or {}
            results.append({
                "version": version,
                "run_id": run["task_id"],
                "case_id": item["case_id"],
                "status": item["status"],
                "judge_source": item.get("judge_source", "rule"),
                "reason": item.get("reason", ""),
                "event_count": len(evidence.get("event_ids") or []),
            })

    payload = {
        "experiment": "deterministic-campus-baseline",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "data_source": data_source,
        "note": "This is a real deterministic target run, not a real LLM/Dify experiment.",
        "suite_id": suite_id,
        "api_base_url": api_base_url,
        "summaries": summaries,
        "results": results,
    }
    write_outputs(payload, output_prefix)
    print(json.dumps({
        "status": "PASS",
        "data_source": data_source,
        "output_prefix": output_prefix,
        "summaries": summaries,
        "result_rows": len(results),
    }, ensure_ascii=False, indent=2))


def run_local(output_prefix: str, suite_id: str) -> None:
    with TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        os.environ["AGENTGUARD_ENVIRONMENT"] = "test"
        os.environ["AGENTGUARD_ALLOW_ANONYMOUS_WRITES"] = "true"
        os.environ["AGENTGUARD_DATABASE_URL"] = f"sqlite:///{Path(tmp, 'baseline.db').as_posix()}"
        os.environ["AGENTGUARD_DB_AUTO_CREATE"] = "true"

        from fastapi.testclient import TestClient
        from app.main import app
        from app.db.session import engine

        with TestClient(app) as client:
            collect(
                get=client.get,
                post=client.post,
                data_source="deterministic-local-campus-agent",
                output_prefix=output_prefix,
                suite_id=suite_id,
            )
        engine.dispose()


def run_remote(base_url: str, token_file: Path | None, output_prefix: str, suite_id: str) -> None:
    import httpx

    token = token_file.read_text(encoding="utf-8").strip() if token_file else os.environ.get("AGENTGUARD_WRITE_TOKEN", "").strip()
    if not token:
        raise SystemExit("remote mode requires --token-file or AGENTGUARD_WRITE_TOKEN")

    base = base_url.rstrip("/")
    with httpx.Client(
        base_url=base,
        headers={"Authorization": f"Bearer {token}"},
        timeout=120,
        follow_redirects=False,
    ) as client:
        collect(
            get=client.get,
            post=client.post,
            data_source="deterministic-production-campus-agent",
            output_prefix=output_prefix,
            suite_id=suite_id,
            api_base_url=base,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the deterministic CampusGuard V1.0/V2.0 baseline")
    parser.add_argument("--base-url", help="Run against a deployed API instead of the local test client")
    parser.add_argument("--token-file", type=Path, help="Operator token file for remote mode")
    parser.add_argument("--output-prefix", default="campus_baseline", help="Evidence filename prefix")
    parser.add_argument("--suite-id", default="desktop-security-v1")
    args = parser.parse_args()

    if args.base_url:
        run_remote(args.base_url, args.token_file, args.output_prefix, args.suite_id)
    else:
        run_local(args.output_prefix, args.suite_id)


if __name__ == "__main__":
    main()