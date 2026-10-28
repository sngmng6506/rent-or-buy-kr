#!/usr/bin/env python3
"""한국부동산원 R-ONE 월간 아파트 매매·전세가격지수 → site/data/index.json

- 실거래 중간값은 달마다 팔린 단지가 달라 상승률이 흔들려서, 같은 표본 아파트를 따라가는 지수로 상승률을 구함
- 통계표: (월) 매매가격지수_아파트 A_2024_00045, (월) 전세가격지수_아파트 A_2024_00050, 항목 100001(지수)
필요: 환경변수 REB_API_KEY

사용:
  python scripts/reb_index.py --test   # 응답 모양·지역 이름·시작 달 확인 (::notice로 출력)
  python scripts/reb_index.py          # index.json 저장
"""
import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "index.json"
KEY = os.environ.get("REB_API_KEY", "").strip()
BASE = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"
TABLES = {"sale": "A_2024_00045", "jeonse": "A_2024_00050"}
ITEM = "100001"
gh = os.environ.get("GITHUB_ACTIONS") == "true"


def note(title, msg):
    msg = str(msg).replace("\n", " ")[:900]
    print(f"::notice title={title}::{msg}" if gh else f"{title}: {msg}")


def call(**params):
    q = {"KEY": KEY, "Type": "json", "pIndex": 1, "pSize": 1000, "ITM_ID": ITEM, "DTACYCLE_CD": "MM", **params}
    url = BASE + "?" + urllib.parse.urlencode(q)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                data = json.loads(r.read().decode("utf-8"))
            break
        except Exception:
            if attempt == 2:
                raise
            time.sleep(3)
    if "RESULT" in data:
        raise RuntimeError(f"{data['RESULT'].get('CODE')}: {data['RESULT'].get('MESSAGE')}")
    body = data["SttsApiTblData"]
    total = body[0]["head"][0]["list_total_count"] if "head" in body[0] else None
    rows = body[1]["row"] if len(body) > 1 else []
    return total, rows


def rows_all(**params):
    out, page = [], 1
    while True:
        total, rows = call(pIndex=page, **params)
        out += rows
        if not rows or total is None or len(out) >= int(total):
            return out
        page += 1


def ym_add(ym, months):
    y, m = int(ym[:4]), int(ym[4:])
    t = y * 12 + (m - 1) + months
    return f"{t // 12}{t % 12 + 1:02d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", action="store_true")
    args = ap.parse_args()
    if not KEY:
        sys.exit("REB_API_KEY가 없어요.")

    today = dt.date.today()
    end = f"{today.year}{today.month:02d}"
    if args.test:
        for k, tbl in TABLES.items():
            try:
                rows = rows_all(STATBL_ID=tbl, START_WRTTIME=ym_add(end, -4), END_WRTTIME=end)
                months = sorted({r.get("WRTTIME_IDTFR_ID") for r in rows})
                note(f"reb-{k}", f"{tbl}: {len(rows)}행, 달 {months}")
                if rows:
                    note(f"reb-{k}-row", json.dumps(rows[0], ensure_ascii=False))
                    last = [r for r in rows if r.get("WRTTIME_IDTFR_ID") == months[-1]]
                    names = [f"{r.get('CLS_ID')}={r.get('CLS_FULLNM') or r.get('CLS_NM')}" for r in last]
                    note(f"reb-{k}-regions", f"{len(names)}곳: " + " | ".join(names[:60]))
                    note(f"reb-{k}-regions2", " | ".join(names[60:160]))
                    note(f"reb-{k}-regions3", " | ".join(names[160:300]))
                # 시작 달 찾기: 전국(첫 지역) 오래된 구간
                old = rows_all(STATBL_ID=tbl, CLS_ID=rows[0]["CLS_ID"], START_WRTTIME="200001", END_WRTTIME=end) if rows else []
                om = sorted(r.get("WRTTIME_IDTFR_ID") for r in old)
                note(f"reb-{k}-span", f"{rows[0].get('CLS_NM') if rows else ''}: {om[:2]} ~ {om[-2:]} ({len(om)}달)")
            except Exception as e:
                note(f"reb-{k}-error", e)
        return

    # 실제 저장: 다음 단계에서 지역 매칭과 함께 구현
    sys.exit("아직 --test만 있어요.")


if __name__ == "__main__":
    main()
