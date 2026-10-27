#!/usr/bin/env python3
"""국토교통부 실거래가 API로 지역별 아파트 시세를 모아 site/data/regions.json을 만든다.

- 지역 평균 매매가: 최근 3개월 모든 면적 평균
- 84㎡(34평형) 매매 중간값, 전세 중간값 → 전세가율
- 최근 5년·10년 연평균 상승률: 같은 3개월 창의 84㎡(34평형) 매매 중간값 비교

필요: 환경변수 MOLIT_API_KEY (공공데이터포털 일반 인증키, 매매·전월세 공용)
시군구 코드는 행안부 법정동코드 API(같은 키)로 받고, 실패하면 data/lawd_fallback.json(수도권만)을 쓴다.

사용:
  python scripts/collect.py --test           # 노원구 한 달치로 키·응답 확인
  python scripts/collect.py                  # 전체 수집
  python scripts/collect.py --only 11 41 28  # 시도 코드 앞자리로 범위 제한
"""
import argparse
import datetime as dt
import json
import os
import statistics
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "regions.json"
FALLBACK = ROOT / "data" / "lawd_fallback.json"

TRADE = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
RENT = "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent"
LAWD = "https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList"

AREA_84 = (81.0, 87.0)        # 전용 84㎡(34평형) 구간
WINDOW = 3                     # 최근 몇 개월
SIDO_NAMES = ["서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시",
              "세종특별자치시", "경기도", "강원특별자치도", "충청북도", "충청남도", "전북특별자치도", "전라남도",
              "경상북도", "경상남도", "제주특별자치도"]

KEY = os.environ.get("MOLIT_API_KEY", "").strip()
calls = 0


def get(url, params, tries=3):
    global calls
    q = urllib.parse.urlencode(params, safe="")
    # 일반 인증키(Decoding 키)는 한 번 인코딩해서 보냄
    full = f"{url}?serviceKey={urllib.parse.quote(KEY, safe='')}&{q}"
    for i in range(tries):
        try:
            calls += 1
            with urllib.request.urlopen(full, timeout=30) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # 네트워크 일시 오류는 재시도
            if i == tries - 1:
                raise
            print(f"  retry {i + 1}: {e}", file=sys.stderr)
            time.sleep(2 * (i + 1))


def num(s):
    s = (s or "").replace(",", "").strip()
    return float(s) if s else 0.0


def fetch_items(url, lawd, ym):
    """한 시군구·한 달의 거래 전체 (페이지 넘김 포함)"""
    items, page = [], 1
    while True:
        text = get(url, {"LAWD_CD": lawd, "DEAL_YMD": ym, "numOfRows": 1000, "pageNo": page})
        root = ET.fromstring(text)
        code = (root.findtext(".//resultCode") or "").strip()
        if code not in ("00", "000"):
            msg = root.findtext(".//resultMsg") or root.findtext(".//returnAuthMsg") or text[:200]
            raise RuntimeError(f"API 오류 {code}: {msg}")
        rows = [{c.tag: (c.text or "").strip() for c in it} for it in root.iter("item")]
        items += rows
        total = int(root.findtext(".//totalCount") or 0)
        if page * 1000 >= total or not rows:
            return items
        page += 1


def months_back(end, n):
    """end(YYYYMM 정수 튜플)부터 n개월 거꾸로"""
    y, m = end
    out = []
    for _ in range(n):
        out.append(f"{y}{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return out


def lawd_codes(only):
    """{코드: 이름} — 행안부 API, 실패 시 예비 목록"""
    codes = {}
    try:
        for sido in SIDO_NAMES:
            page = 1
            while True:
                text = get(LAWD, {"type": "json", "pageNo": page, "numOfRows": 1000, "locatadd_nm": sido})
                data = json.loads(text)
                block = data.get("StanReginCd")
                if not block:
                    raise RuntimeError(text[:200])
                rows = next((b["row"] for b in block if "row" in b), [])
                for r in rows:
                    rc = r.get("region_cd", "")
                    if r.get("umd_cd") == "000" and r.get("ri_cd") == "00" and r.get("sgg_cd") != "000":
                        codes[rc[:5]] = r.get("locatadd_nm", "").strip()
                if len(rows) < 1000:
                    break
                page += 1
        src = "행정안전부 법정동코드"
    except Exception as e:
        print(f"법정동코드 API를 못 써서 예비 목록 사용: {e}", file=sys.stderr)
        codes = json.loads(FALLBACK.read_text())["codes"]
        src = "예비 목록(수도권)"
    # 세종은 시군구가 없어서 36110 하나
    if not only or "36" in only:
        codes.setdefault("36110", "세종특별자치시")
    if only:
        codes = {c: n for c, n in codes.items() if c[:2] in only}
    # 시 전체 코드(예: 41110 수원시)는 구 코드와 겹치므로 구가 있으면 제외
    parents = {c for c in codes if c[4] == "0" and any(o != c and o[:4] == c[:4] for o in codes)}
    return {c: n for c, n in sorted(codes.items()) if c not in parents}, src


def med(xs):
    return round(statistics.median(xs), 1) if xs else None


def window_trades(lawd, end):
    deals = []
    for ym in months_back(end, WINDOW):
        for it in fetch_items(TRADE, lawd, ym):
            if it.get("cdealType", "").upper() == "O":   # 해제된 거래 제외
                continue
            deals.append((num(it.get("dealAmount")), num(it.get("excluUseAr"))))
    return deals


def window_rents(lawd, end):
    jeonse = []
    for ym in months_back(end, WINDOW):
        for it in fetch_items(RENT, lawd, ym):
            if num(it.get("monthlyRent")) == 0:            # 월세 0 = 전세
                jeonse.append((num(it.get("deposit")), num(it.get("excluUseAr"))))
    return jeonse


def in84(rows):
    return [p for p, a in rows if AREA_84[0] <= a <= AREA_84[1]]


def cagr(now, then, years):
    if not now or not then:
        return None
    return round(((now / then) ** (1 / years) - 1) * 100, 2)


def main():
    global KEY
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--only", nargs="*", default=[])
    ap.add_argument("--end", help="창의 마지막 달 YYYYMM (기본: 지난달)")
    args = ap.parse_args()
    if not KEY:
        sys.exit("MOLIT_API_KEY가 없어요. GitHub Secrets 또는 환경변수에 넣어주세요.")

    today = dt.date.today()
    if args.end:
        end = (int(args.end[:4]), int(args.end[4:]))
    else:
        end = (today.year, today.month - 1) if today.month > 1 else (today.year - 1, 12)

    if args.test:
        ym = f"{end[0]}{end[1]:02d}"
        t = fetch_items(TRADE, "11350", ym)
        r = fetch_items(RENT, "11350", ym)
        # GitHub Actions 알림으로도 남겨서 로그를 열지 않아도 결과가 보이게
        gh = os.environ.get("GITHUB_ACTIONS") == "true"
        def note(title, msg):
            print(f"::notice title={title}::{msg}" if gh else f"{title}: {msg}")
        note("count", f"노원구 {ym} 매매 {len(t)}건, 전월세 {len(r)}건")
        if t:
            note("trade", json.dumps(t[0], ensure_ascii=False))
        if r:
            note("rent", json.dumps(r[0], ensure_ascii=False))
        try:
            raw = get(LAWD, {"type": "json", "pageNo": 1, "numOfRows": 5, "locatadd_nm": "경기도"})
            note("lawd-raw", raw[:600].replace("\n", " "))
        except Exception as e:
            note("lawd-raw", f"호출 실패: {e}")
        try:
            codes, src = lawd_codes({"41"})
            note("lawd", f"{src}, 경기 {len(codes)}곳: " + ", ".join(f"{c} {n}" for c, n in list(codes.items())[:60]))
        except Exception as e:
            note("lawd", f"실패: {e}")
        return

    codes, src = lawd_codes(set(args.only))
    print(f"시군구 {len(codes)}곳 ({src}), 창 {months_back(end, WINDOW)[::-1]}")
    regions = {}
    for i, (code, name) in enumerate(codes.items(), 1):
        try:
            now = window_trades(code, end)
            rents = window_rents(code, end)
            y5 = window_trades(code, (end[0] - 5, end[1]))
            y10 = window_trades(code, (end[0] - 10, end[1]))
        except Exception as e:
            print(f"[{i}/{len(codes)}] {code} {name}: 실패 {e}", file=sys.stderr)
            continue
        prices = [p for p, _ in now]
        p84, j84 = med(in84(now)), med(in84(rents))
        regions[code] = {
            "name": name,
            "avg": round(statistics.mean(prices), 1) if prices else None,   # 만원, 모든 면적
            "cnt": len(prices),
            "p84": p84, "n84": len(in84(now)),                               # 84㎡(34평형) 매매 중간값
            "j84": j84, "nj84": len(in84(rents)),                            # 84㎡(34평형) 전세 중간값
            "jratio": round(j84 / p84 * 100, 1) if p84 and j84 else None,
            "g5": cagr(p84, med(in84(y5)), 5),
            "g10": cagr(p84, med(in84(y10)), 10),
        }
        r = regions[code]
        print(f"[{i}/{len(codes)}] {code} {name}: 평균 {r['avg']}만 ({r['cnt']}건), 84㎡ {p84} / 전세 {j84}, "
              f"5년 {r['g5']}% 10년 {r['g10']}%  (누적 호출 {calls})")
        time.sleep(0.05)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    window = months_back(end, WINDOW)
    OUT.write_text(json.dumps({
        "updated": today.isoformat(),
        "window": [window[-1], window[0]],
        "source": "국토교통부 실거래가 공개시스템 (공공데이터포털 API)",
        "codes_source": src,
        "unit": "만원",
        "regions": regions,
    }, ensure_ascii=False, indent=1) + "\n")
    print(f"저장: {OUT.relative_to(ROOT)} ({len(regions)}곳, API 호출 {calls}회)")


if __name__ == "__main__":
    main()
