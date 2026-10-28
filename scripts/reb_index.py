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

from common import SIDO_SHORT, SIDO_SHORT_BY_CODE

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "index.json"
KEY = os.environ.get("REB_API_KEY", "").strip()
BASE = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"
TABLES = {"sale": "A_2024_00045", "jeonse": "A_2024_00050"}
# 주택 유형별 지수 표와 저장 파일 (TABLES·OUT은 --type에 따라 바뀜)
TYPE_TABLES = {
    "apt": ({"sale": "A_2024_00045", "jeonse": "A_2024_00050"}, "index.json", "regions.json"),            # 아파트, 2003.11~
    "villa": ({"sale": "A_2024_00080", "jeonse": "A_2024_00085"}, "index-villa.json", "regions-villa.json"),  # 연립·다세대
    "offi": ({"sale": "A_2024_00615", "jeonse": "A_2024_00618"}, "index-offi.json", "regions-offi.json"),    # 오피스텔(시계열), 2018~
}
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
    ap.add_argument("--type", choices=list(TYPE_TABLES), default="apt")
    args = ap.parse_args()
    global TABLES, OUT
    TABLES, out_name, reg_name = TYPE_TABLES[args.type]
    OUT = ROOT / "site" / "data" / out_name
    if not KEY:
        sys.exit("REB_API_KEY가 없어요.")

    today = dt.date.today()
    end = f"{today.year}{today.month:02d}"
    if args.test:
        # (통계표 목록 확인은 끝남: 유형별 표는 TYPE_TABLES. 알림은 한 단계에 10개까지만 보여서 뺌)
        for k, tbl in TABLES.items():
            try:
                rows = rows_all(STATBL_ID=tbl, START_WRTTIME=ym_add(end, -4), END_WRTTIME=end)
                months = sorted({r.get("WRTTIME_IDTFR_ID") for r in rows})
                note(f"reb-{k}", f"{tbl}: {len(rows)}행, 달 {months}")
                if rows:
                    note(f"reb-{k}-row", json.dumps(rows[0], ensure_ascii=False))
                    note(f"reb-{k}-grp", " | ".join(sorted({f"{r.get('GRP_FULLNM')}/{r.get('CLS_FULLNM')}" for r in rows})[:80]))
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

    reg_file = ROOT / "site" / "data" / reg_name
    if not reg_file.exists():   # 시세 파일이 아직 없으면 아파트 지역 목록으로 맞춤
        reg_file = ROOT / "site" / "data" / "regions.json"
    regions = json.loads(reg_file.read_text())["regions"]
    series = {}   # 표 → {경로 키: {달: 지수}}
    names = {}
    for k, tbl in TABLES.items():
        rows = rows_all(STATBL_ID=tbl, START_WRTTIME="200001", END_WRTTIME=end)
        s = {}
        for r in rows:
            if r.get("DTA_VAL") is None:
                continue
            full = r.get("CLS_FULLNM") or ""
            if r.get("GRP_FULLNM"):   # 오피스텔 표: 지역은 GRP, CLS는 크기(전체·40㎡이하…) → 전체만
                if r.get("CLS_NM") != "전체":
                    continue
                full = r["GRP_FULLNM"].replace("(구)", "")
            key = path_key(full)
            if key:
                s.setdefault(key, {})[r["WRTTIME_IDTFR_ID"]] = float(r["DTA_VAL"])
                names[key] = r.get("CLS_FULLNM")
        series[k] = s
        note("reb", f"{k}: {len(rows)}행, 지역 {len(s)}곳")
    latest = max(m for s in series["sale"].values() for m in s)

    out, how = {}, {"own": 0, "parent": 0, "sido": 0, "none": 0}
    for code, r in regions.items():
        cands = our_keys(r["name"])
        hit = None
        for level, key in cands:
            if key in series["sale"]:
                hit = (level, key)
                break
        if not hit:   # 시도 지수도 없으면 전국 지수 (오피스텔은 광역시·경기 정도만 지역 지수가 있음)
            nat = next((k for k in ("전국", "전체") if k in series["sale"]), None)
            if nat:
                hit = ("nation", nat)
        if not hit:
            how["none"] += 1
            continue
        how[hit[0]] += 1
        level, key = hit
        out[code] = {"level": level, "label": label_of(key, level),
                     "sale": growth(series["sale"].get(key), latest),
                     "jeonse": growth(series["jeonse"].get(key), latest)}
    for sc, short in SIDO_SHORT_BY_CODE.items():
        if short in series["sale"]:
            out["sido:" + sc] = {"level": "sido", "label": f"{short} 전체",
                                 "sale": growth(series["sale"][short], latest),
                                 "jeonse": growth(series["jeonse"].get(short), latest)}
    note("reb-match", f"지역 {len(regions)}곳: 자기 지수 {how['own']}, 상위 시 지수 {how['parent']}, 시도 지수 {how['sido']}, 전국 지수 {how['nation']}, 없음 {how['none']}")
    unmatched = [n for n in series["sale"] if n not in {v for c in regions.values() for _, v in our_keys(c["name"])}]
    note("reb-unused", " | ".join(names.get(n, n) for n in unmatched)[:900])
    for c in ["11350", "11680", "26350", "41135", "51190", "12330"]:
        if c in out:
            note("reb-sample", f"{c} {regions[c]['name']}: {json.dumps(out[c], ensure_ascii=False)}")

    OUT.write_text(json.dumps({
        "updated": today.isoformat(),
        "latest": latest,
        "type": args.type,
        "source": "한국부동산원 R-ONE 월간 매매·전세가격지수 " + ", ".join(TABLES.values()),
        "regions": dict(sorted(out.items())),
    }, ensure_ascii=False, indent=1) + "\n")
    print(f"저장: {OUT.relative_to(ROOT)} ({len(out)}곳, 최신 {latest})")




def path_key(full):
    """'서울>강북지역>동북권>노원구' → '서울 노원구', '전남광주>광주>광산구' → '전남광주 광산구', '강원' → '강원'
    권역 묶음(…지역, …권)은 지역 이름이 아니라서 뺌"""
    raw = [p for p in full.split(">") if p]
    group = lambda p: p.endswith("지역") or p.endswith("권")
    if not raw or group(raw[-1]):   # '서울>강북지역' 같은 권역 묶음은 안 씀 (시도 지수와 이름이 겹침)
        return None
    parts = [p for p in raw if not group(p)]
    if parts == ["전체"]:   # 오피스텔 표의 전국
        return "전체"
    if not parts or parts[0] in ("전국", "수도권", "지방권", "5대광역시", "4대광역시", "기타지방", "8개도", "6대광역시"):
        return None
    if parts[0] == "전남광주" and len(parts) > 1 and parts[1] in ("광주", "전남"):
        parts = [parts[0]] + parts[2:] if len(parts) > 2 else [parts[1]]   # 옛 광주·전남 묶음은 '광주'·'전남'
    return " ".join(parts)


def our_keys(name):
    """우리 지역 이름 → 찾아볼 지수 키 (자기 → 상위 시 → 시도) 순서"""
    parts = name.split()
    sido = SIDO_SHORT.get(parts[0], parts[0])
    rest = parts[1:]
    out = []
    if rest:
        out.append(("own", " ".join([sido] + rest)))
        if len(rest) > 1:
            out.append(("parent", " ".join([sido, rest[0]])))
    else:
        out.append(("own", sido))
    if sido == "전남광주":   # 옛 광주 5개 구는 '광주', 나머지는 '전남' 지수로
        out.append(("sido", "광주" if rest and rest[0] in ("동구", "서구", "남구", "북구", "광산구") else "전남"))
    else:
        out.append(("sido", sido))
    return out


def label_of(key, level):
    if level == "nation":
        return "전국"
    parts = key.split()
    return f"{parts[0]} 전체" if level == "sido" else parts[-1] if level == "own" else parts[-1]


def growth(s, latest):
    """같은 달끼리 비교한 연평균 상승률(%): 5·10·15·20년, 그리고 지수 시작 달부터"""
    if not s or latest not in s:
        return None
    now = s[latest]
    g = {"from": min(s)}
    for yrs in (5, 10, 15, 20):
        m = ym_add(latest, -12 * yrs)
        if s.get(m):
            g[f"g{yrs}"] = round(((now / s[m]) ** (1 / yrs) - 1) * 100, 2)
    first = min(s)
    yrs = (int(latest[:4]) - int(first[:4])) + (int(latest[4:]) - int(first[4:])) / 12
    if yrs >= 3 and s[first]:
        g["gall"] = round(((now / s[first]) ** (1 / yrs) - 1) * 100, 2)
    return g


if __name__ == "__main__":
    main()
