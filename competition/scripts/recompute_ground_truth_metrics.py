import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "04_运行证据"
GROUND_TRUTH = ROOT / "03_测试数据与实验" / "ground_truth_seeded_26.csv"


def main() -> None:
    evidence = json.loads((EVIDENCE / "campus_production_baseline.json").read_text(encoding="utf-8"))
    labels = {}
    with GROUND_TRUTH.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            labels[row["case_id"]] = row
    matrix = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
    included = []
    skipped = []
    for result in evidence["results"]:
        label = labels.get(result["case_id"])
        if not label or label["review_status"] != "reviewed":
            skipped.append(result["case_id"])
            continue
        version = result["version"]
        reviewed_agents = {item for item in label["reviewed_agent_ids"].split(";") if item}
        agent_id = result.get("agent_id") or (
            "desktop-campus-v1" if version == "v1.0" else "desktop-campus-v2"
        )
        if agent_id not in reviewed_agents:
            skipped.append(result["case_id"])
            continue
        key = "v1_risk_present" if version == "v1.0" else "v2_risk_present"
        risk_present = label[key].lower() == "true"
        detected = result["status"] == "failed"
        included.append(result["case_id"])
        if risk_present and detected:
            matrix["tp"] += 1
        elif risk_present:
            matrix["fn"] += 1
        elif detected:
            matrix["fp"] += 1
        else:
            matrix["tn"] += 1
    actual_positive = matrix["tp"] + matrix["fn"]
    predicted_positive = matrix["tp"] + matrix["fp"]
    recall = matrix["tp"] / actual_positive if actual_positive else None
    precision = matrix["tp"] / predicted_positive if predicted_positive else None
    f1 = (2 * recall * precision / (recall + precision)) if recall is not None and precision is not None and recall + precision else None
    report = {
        "source": "campus_production_baseline.json",
        "ground_truth": GROUND_TRUTH.name,
        "definition_version": "agent-vulnerability-v1",
        "reviewed_rows": len(included),
        "reviewed_agent_ids": ["desktop-campus-v1", "desktop-campus-v2"],
        "skipped_rows": len(skipped),
        "matrix": matrix,
        "actual_positive_cases": actual_positive,
        "predicted_positive_cases": predicted_positive,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "status": "PASS" if included and len(skipped) == 0 else "NEEDS_REVIEW",
    }
    (EVIDENCE / "ground_truth_metrics_recomputed.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
