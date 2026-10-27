#!/usr/bin/env python3
"""한국은행 ECOS에서 최신 금리를 받아 site/data/rates.json을 만든다.

- 주택담보대출 금리, 전세자금대출 금리: 예금은행 가중평균금리 대출금리 (신규취급액 기준, 121Y006)
- 예금 금리: 예금은행 가중평균금리 저축성수신금리 정기예금 (신규취급액 기준, 121Y002)

항목 코드는 이름으로 찾는다 (코드가 바뀌어도 이름이 같으면 그대로 동작).
필요: 환경변수 ECOS_API_KEY

사용:
  python scripts/rates.py --test   # 항목 이름·코드와 최근 값 확인
  python scripts/rates.py          # rates.json 저장
"""
import argparse
import datetime as dt
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "rates.json"
KEY = os.environ.get("ECOS_API_KEY", "").strip()
BASE = "https://ecos.bok.or.kr/api"

# 키: (통계표 코드, 항목 이름에 들어 있어야 하는 말들, 설명)
WANT = {
    "mort": ("121Y006", ["주택담보대출"], "주택담보대출"),
    "jloan": ("121Y006", ["전세자금대출"], "전세자금대출"),
    "deposit": ("121Y002", ["정기예금"], "정기예금"),
}

gh = os.environ.get("GITHUB_ACTIONS") == "true"


def note(title, msg):
    print(f"::notice title={title}::{msg}" if gh else f"{title}: {msg}")


def call(*parts):
    url = BASE + "/" + "/".join(urllib.parse.quote(str(p), safe="") for p in parts)
    with urllib.request.urlopen(url, timeout=30) as r:
        data = json.loads(r.read().decode("utf-8"))
    if "RESULT" in data:   # 오류나 데이터 없음
        raise RuntimeError(f"{data['RESULT'].get('CODE')}: {data['RESULT'].get('MESSAGE')}")
    return data


def items(stat):
    d = call("StatisticItemList", KEY, "json", "kr", 1, 500, stat)
    return d["StatisticItemList"]["row"]


def find_item(stat, words):
    rows = [r for r in items(stat) if r.get("CYCLE") == "M"]
    hit = [r for r in rows if all(w in r.get("ITEM_NAME", "") for w in words)]
    return hit[0] if hit else None, rows


def latest(stat, item):
    today = dt.date.today()
    start = f"{today.year - 1}{today.month:02d}"
    end = f"{today.year}{today.month:02d}"
    d = call("StatisticSearch", KEY, "json", "kr", 1, 100, stat, "M", start, end, item)
    rows = [r for r in d["StatisticSearch"]["row"] if r.get("DATA_VALUE") not in (None, "")]
    rows.sort(key=lambda r: r["TIME"])
    return rows[-1] if rows else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", action="store_true")
    args = ap.parse_args()
    if not KEY:
        sys.exit("ECOS_API_KEY가 없어요. GitHub Secrets 또는 환경변수에 넣어주세요.")

    out = {}
    for key, (stat, words, label) in WANT.items():
        try:
            it, rows = find_item(stat, words)
            if args.test:
                note(f"ecos-{stat}", " | ".join(f"{r['ITEM_CODE']} {r['ITEM_NAME']}" for r in rows[:40]))
            if not it:
                note("ecos-miss", f"{label}: {stat}에서 항목을 못 찾음")
                continue
            v = latest(stat, it["ITEM_CODE"])
            if not v:
                note("ecos-miss", f"{label}: 최근 값 없음")
                continue
            out[key] = {"value": round(float(v["DATA_VALUE"]), 2), "month": v["TIME"], "item": it["ITEM_NAME"], "stat": stat}
            note("ecos", f"{label}: {out[key]['value']}% ({v['TIME']}, {it['ITEM_NAME']})")
        except Exception as e:
            note("ecos-error", f"{label}: {e}")

    if args.test:
        return
    if not out:
        sys.exit("금리를 하나도 못 받았어요. 기존 파일을 그대로 둬요.")
    old = json.loads(OUT.read_text())["rates"] if OUT.exists() else {}
    merged = {**old, **out}   # 못 받은 항목은 지난 값 유지
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "updated": dt.date.today().isoformat(),
        "source": "한국은행 경제통계시스템(ECOS), 예금은행 가중평균금리(신규취급액 기준)",
        "rates": merged,
    }, ensure_ascii=False, indent=1) + "\n")
    print(f"저장: {OUT.relative_to(ROOT)} {merged}")


if __name__ == "__main__":
    main()
