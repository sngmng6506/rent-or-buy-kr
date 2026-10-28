#!/usr/bin/env python3
"""국토교통부 실거래가 API로 지역별 시세를 모아 site/data/regions*.json을 만든다.

주택 유형(--type): apt 아파트 → regions.json, villa 연립·다세대(빌라) → regions-villa.json,
offi 오피스텔 → regions-offi.json. 유형마다 API·크기 구간·대표 크기가 다름

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
CACHE = ROOT / "data" / "lawd_codes.json"      # 마지막으로 성공한 법정동코드 목록

TRADE = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
RENT = "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent"
API = "https://apis.data.go.kr/1613000/{0}/get{0}"
LAWD = "https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList"

AREA_84 = (81.0, 87.0)        # 전용 84㎡(34평형) 구간
# 크기 구간: 전용면적 키 → (하한, 상한, 흔히 부르는 평형)
SIZES = {
    "39": (35.0, 44.9, 16), "49": (45.0, 53.9, 20), "59": (54.0, 64.9, 25), "74": (65.0, 79.9, 30),
    "84": (80.0, 89.9, 34), "101": (90.0, 107.9, 40), "114": (108.0, 125.0, 45),
}
# 빌라·오피스텔은 공급면적 '평형'이 정해져 있지 않아서 전용면적 평수로 부름 (세 번째 값 = 전용 평)
VILLA_SIZES = {
    "30": (20.0, 34.9, 9), "40": (35.0, 44.9, 12), "50": (45.0, 54.9, 15), "60": (55.0, 64.9, 18), "75": (65.0, 85.0, 23),
}
OFFI_SIZES = {
    "20": (10.0, 24.9, 6), "30": (25.0, 34.9, 9), "40": (35.0, 49.9, 12), "60": (50.0, 69.9, 18), "84": (70.0, 90.0, 25),
}
# 유형별 설정: API 이름, 저장 파일, 크기 구간, 대표 크기(상승률·전세가율 계산용)와 그 범위
TYPES = {
    "apt": {"trade": "RTMSDataSvcAptTradeDev", "rent": "RTMSDataSvcAptRent", "out": "regions.json",
            "sizes": SIZES, "main": "84", "main_range": AREA_84, "label": "아파트", "pyeong": "평형"},
    "villa": {"trade": "RTMSDataSvcRHTrade", "rent": "RTMSDataSvcRHRent", "out": "regions-villa.json",
              "sizes": VILLA_SIZES, "main": "60", "main_range": VILLA_SIZES["60"][:2], "label": "빌라(연립·다세대)", "pyeong": "평"},
    "offi": {"trade": "RTMSDataSvcOffiTrade", "rent": "RTMSDataSvcOffiRent", "out": "regions-offi.json",
             "sizes": OFFI_SIZES, "main": "30", "main_range": OFFI_SIZES["30"][:2], "label": "오피스텔", "pyeong": "평"},
}
WINDOW = 3                     # 최근 몇 개월
SIDO = {"11": "서울특별시", "26": "부산광역시", "27": "대구광역시", "28": "인천광역시", "29": "광주광역시",
        "30": "대전광역시", "31": "울산광역시", "36": "세종특별자치시", "41": "경기도", "51": "강원특별자치도",
        "43": "충청북도", "44": "충청남도", "52": "전북특별자치도", "46": "전라남도", "47": "경상북도",
        "48": "경상남도", "50": "제주특별자치도",
        "12": "전남광주통합특별시"}   # 2026년 7월 광주·전남 통합

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


LAWD_ERRORS = {}


def legacy_parent(name):
    """전남광주통합특별시 ○○ → 옛 광주·전남 코드 (과거 거래 비교용)"""
    if not name.startswith("전남광주통합특별시"):
        return []
    short = name.split(" ", 1)[1] if " " in name else name
    fb = json.loads(FALLBACK.read_text())["codes"]
    return [c for c, n in fb.items() if c[:2] in ("29", "46") and n.split(" ", 1)[1] == short]
# 2024년 이후 신설된 구 → 개편 전 코드 (과거 거래 비교용)
HIST_PARENT = {
    "41192": ["41190"], "41194": ["41190"], "41196": ["41190"],                      # 부천 원미·소사·오정
    "41591": ["41590"], "41593": ["41590"], "41595": ["41590"], "41597": ["41590"],  # 화성 만세·효행·병점·동탄
    "28125": ["28110", "28140"], "28155": ["28110"],                                 # 인천 제물포·영종
    "28275": ["28260"], "28290": ["28260"],                                          # 인천 서해·검단
}


def drop_legacy(regions):
    """개편으로 없어진 코드(예: 인천 중구 28110)는 새 코드에 거래가 있고 자기 거래가 없으면 뺌.
    법정동코드 API가 폐지 코드를 같이 주는 달이 있어서."""
    old_codes = {o for olds in HIST_PARENT.values() for o in olds}
    alive = {o for new, olds in HIST_PARENT.items() if (regions.get(new) or {}).get("cnt") for o in olds}
    return {c: r for c, r in regions.items() if not (c in old_codes and c in alive and not r.get("cnt"))}


def lawd_sido(name):
    """한 시도의 시군구 {코드: 이름}"""
    codes, page = {}, 1
    while True:
        text = get(LAWD, {"type": "json", "pageNo": page, "numOfRows": 1000, "locatadd_nm": name})
        block = json.loads(text).get("StanReginCd")
        if not block:
            if page > 1 and codes:      # 뒤쪽 쪽에서 '데이터 없음'이면 거기까지만
                return codes
            raise RuntimeError(text[:200])
        rows = next((b["row"] for b in block if "row" in b), [])
        for r in rows:
            if r.get("sgg_cd") == "000":
                continue
            sgg, name = r["region_cd"][:5], r.get("locatadd_nm", "").strip()
            if r.get("umd_cd") == "000" and r.get("ri_cd") == "00":
                codes[sgg] = name
            elif r.get("ri_cd") == "00" and sgg not in codes:
                # 시군구 줄이 빠진 경우가 있어서 읍면동 줄에서 시군구 이름을 만듦
                codes[sgg] = name.rsplit(" ", 1)[0]
        if len(rows) < 1000:
            return codes
        page += 1


def lawd_codes(only):
    """{코드: 이름} — 시도별로 행안부 API, 실패한 시도는 마지막 저장본 → 예비 목록 순으로"""
    fallback = json.loads(FALLBACK.read_text())["codes"]
    if CACHE.exists():
        fallback = {**fallback, **json.loads(CACHE.read_text())["codes"]}
    codes, used_fallback = {}, []
    for sc, name in SIDO.items():
        if only and sc not in only:
            continue
        try:
            try:
                got = lawd_sido(name)
            except Exception:
                time.sleep(3)
                got = lawd_sido(name)     # 간헐적 실패가 있어서 한 번 더
            if not got and sc != "36":
                raise RuntimeError("결과 없음")
            # API 응답에서 가끔 빠지는 시군구(예: 충북 영동군)는 저장본에서 보충
            missing = {c: n for c, n in fallback.items() if n.startswith(name + " ") and c not in got}
            if missing:
                print(f"법정동코드 {name}: 응답에 없는 {len(missing)}곳을 저장본에서 보충 {list(missing.values())}", file=sys.stderr)
            codes.update({**missing, **got})
        except Exception as e:
            LAWD_ERRORS[name] = str(e)[:200]
            print(f"법정동코드 {name} 실패, 예비 목록 사용: {e}", file=sys.stderr)
            codes.update({c: n for c, n in fallback.items() if n.startswith(name)})
            used_fallback.append(name)
    # 통합특별시 코드를 받았으면 옛 광주·전남 예비 코드는 버림
    if any(n.startswith("전남광주통합특별시") for n in codes.values()):
        codes = {c: n for c, n in codes.items() if c[:2] not in ("29", "46") or not n.startswith(("광주광역시", "전라남도"))}
        used_fallback = [x for x in used_fallback if x not in ("광주광역시", "전라남도")]
    if (not only or "36" in only) and not any(c.startswith("36") for c in codes):
        codes["36110"] = "세종특별자치시"     # 세종은 시군구가 없어서 36110 하나
    src = "행정안전부 법정동코드" + (f" (예비 목록: {', '.join(used_fallback)})" if used_fallback else "")
    # 시 전체 코드(예: 41110 수원시)는 구 코드와 겹치므로 구가 있으면 제외
    # 이름으로도 확인: "경기도 수원시" 아래 "경기도 수원시 장안구"가 있을 때만 부모로 봄
    # (영동군 43740과 증평군 43745처럼 앞자리만 같은 경우는 제외)
    parents = {c for c in codes if c[4] == "0" and any(o != c and o[:4] == c[:4] and codes[o].startswith(codes[c] + " ") for o in codes)}
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


def window_rents(lawd, end, with_monthly=False):
    """전세 [(보증금, 면적)], with_monthly면 월세 [(보증금, 월세, 면적)]도"""
    jeonse, monthly = [], []
    for ym in months_back(end, WINDOW):
        for it in fetch_items(RENT, lawd, ym):
            dep, mr, area = num(it.get("deposit")), num(it.get("monthlyRent")), num(it.get("excluUseAr"))
            if mr == 0:                                    # 월세 0 = 전세
                jeonse.append((dep, area))
            else:
                monthly.append((dep, mr, area))
    return (jeonse, monthly) if with_monthly else jeonse


def size_of(area):
    for k, (lo, hi, _) in SIZES.items():
        if lo <= area <= hi:
            return k
    return None


def rent_terms(jeonse, monthly):
    """월세 계약으로 지역의 전월세 전환율(연 %)과 보증금 비율(전세금 대비)을 구함.
    같은 크기의 전세 중간값을 기준으로 계약마다 계산해서 중간값을 씀"""
    jmed = {k: med(in_size(jeonse, k)) for k in SIZES}
    rates, ratios = [], []
    for dep, mr, area in monthly:
        k = size_of(area)
        J = jmed.get(k) if k else None
        if not J:
            continue
        gap = J - dep
        if gap < J * 0.1:                  # 보증금이 전세금과 거의 같으면 환산이 불안정해서 뺌
            continue
        r = mr * 12 / gap * 100
        if 0.5 <= r <= 20:                 # 이상치 제외
            rates.append(r)
        ratios.append(min(dep / J, 1))
    return (round(statistics.median(rates), 2) if len(rates) >= 5 else None,
            round(statistics.median(ratios), 3) if len(ratios) >= 5 else None,
            len(rates))


def in84(rows):
    return [p for p, a in rows if AREA_84[0] <= a <= AREA_84[1]]


def in_size(rows, key):
    lo, hi, _ = SIZES[key]
    return [p for p, a in rows if lo <= a <= hi]


def size_table(now, rents):
    """크기별 매매·전세 중간값과 건수"""
    out = {}
    for k in SIZES:
        t, j = in_size(now, k), in_size(rents, k)
        if t or j:
            out[k] = {"p": med(t), "n": len(t), "j": med(j), "nj": len(j)}
    return out


def cagr(now, then, years):
    if not now or not then:
        return None
    return round(((now / then) ** (1 / years) - 1) * 100, 2)


def use_type(kind):
    """유형에 맞게 API 주소·크기 구간·저장 파일을 바꿈 (아래 함수들이 이 전역값을 씀)"""
    global TRADE, RENT, OUT, SIZES, AREA_84, TYPE
    c = TYPES[kind]
    TYPE = kind
    TRADE, RENT = API.format(c["trade"]), API.format(c["rent"])
    OUT = ROOT / "site" / "data" / c["out"]
    SIZES, AREA_84 = c["sizes"], c["main_range"]


TYPE = "apt"


def main():
    global KEY
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--only", nargs="*", default=[])
    ap.add_argument("--end", help="창의 마지막 달 YYYYMM (기본: 지난달)")
    ap.add_argument("--type", choices=list(TYPES), default="apt", help="주택 유형 (기본 apt)")
    args = ap.parse_args()
    use_type(args.type)
    if not KEY:
        sys.exit("MOLIT_API_KEY가 없어요. GitHub Secrets 또는 환경변수에 넣어주세요.")

    today = dt.date.today()
    if args.end:
        end = (int(args.end[:4]), int(args.end[4:]))
    else:
        end = (today.year, today.month - 1) if today.month > 1 else (today.year - 1, 12)

    if args.test:
        ym = f"{end[0]}{end[1]:02d}"
        # GitHub Actions 알림으로도 남겨서 로그를 열지 않아도 결과가 보이게
        gh = os.environ.get("GITHUB_ACTIONS") == "true"
        def note(title, msg):
            print(f"::notice title={title}::{msg}" if gh else f"{title}: {msg}")
        t, r = [], []
        for name, url in (("trade", TRADE), ("rent", RENT)):
            try:
                rows = fetch_items(url, "11350", ym)
                (t if name == "trade" else r).extend(rows)
            except Exception as e:
                note(f"{TYPE}-{name}-error", f"{url.split('/')[-1]}: {e}")
        note("count", f"[{TYPE}] 노원구 {ym} 매매 {len(t)}건, 전월세 {len(r)}건")
        if t:
            note("trade", json.dumps(t[0], ensure_ascii=False))
        if r:
            note("rent", json.dumps(r[0], ensure_ascii=False))
        for probe in os.environ.get("PROBE_NAMES", "").split(","):
            if not probe.strip():
                continue
            try:
                raw = get(LAWD, {"type": "json", "pageNo": 1, "numOfRows": 3, "locatadd_nm": probe.strip()})
                note("probe", f"{probe}: {raw[:500]}")
            except Exception as e:
                note("probe", f"{probe}: 실패 {e}")
        for code in os.environ.get("PROBE_CODES", "").split(","):
            if code.strip():
                try:
                    note("probe", f"{code} 매매 {ym}: {len(fetch_items(TRADE, code.strip(), ym))}건")
                except Exception as e:
                    note("probe", f"{code}: 실패 {e}")
        try:
            raw = get(LAWD, {"type": "json", "pageNo": 1, "numOfRows": 5, "locatadd_nm": "경기도"})
            note("lawd-raw", raw[:600].replace("\n", " "))
        except Exception as e:
            note("lawd-raw", f"호출 실패: {e}")
        try:
            codes, src = lawd_codes(set())
            by = {}
            for c in codes:
                by[SIDO.get(c[:2], c[:2])] = by.get(SIDO.get(c[:2], c[:2]), 0) + 1
            note("lawd", f"{src}, 전국 {len(codes)}곳 · " + ", ".join(f"{k} {v}" for k, v in by.items()))
            note("lawd-41", ", ".join(f"{c} {n.replace('경기도 ', '')}" for c, n in codes.items() if c[:2] == "41"))
            note("lawd-jg", ", ".join(f"{c} {n}" for c, n in codes.items() if n.startswith("전남광주")))
            note("lawd-28", ", ".join(f"{c} {n.replace('인천광역시 ', '')}" for c, n in codes.items() if c[:2] == "28"))
            if LAWD_ERRORS:
                note("lawd-errors", json.dumps(LAWD_ERRORS, ensure_ascii=False))
        except Exception as e:
            note("lawd", f"실패: {e}")
        return

    codes, src = lawd_codes(set(args.only))
    if not LAWD_ERRORS:
        old = json.loads(CACHE.read_text())["codes"] if CACHE.exists() else {}
        if args.only:
            old = {c: n for c, n in old.items() if c[:2] not in set(args.only)}
        CACHE.write_text(json.dumps({"updated": dt.date.today().isoformat(), "codes": dict(sorted({**old, **codes}.items()))},
                                    ensure_ascii=False, indent=1) + "\n")
    print(f"시군구 {len(codes)}곳 ({src}), 창 {months_back(end, WINDOW)[::-1]}")
    regions = {}
    for i, (code, name) in enumerate(codes.items(), 1):
        try:
            now = window_trades(code, end)
            rents, monthly = window_rents(code, end, with_monthly=True)
            # 새로 생긴 구는 과거 거래가 옛 코드에 있을 수 있어서 지금 코드와 옛 코드를 함께 봄
            hist = list(dict.fromkeys([code] + HIST_PARENT.get(code, []) + legacy_parent(name)))
            y5 = [d for h in hist for d in window_trades(h, (end[0] - 5, end[1]))]
            y10 = [d for h in hist for d in window_trades(h, (end[0] - 10, end[1]))]
            # 전세금 상승률: 5년·10년 전 같은 달 전세 중간값
            r5 = [d for h in hist for d in window_rents(h, (end[0] - 5, end[1]))]
            r10 = [d for h in hist for d in window_rents(h, (end[0] - 10, end[1]))]
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
            "sizes": size_table(now, rents),
        }
        conv, wdep, nconv = rent_terms(rents, monthly)
        regions[code].update({
            "conv": conv, "wdep": wdep, "nconv": nconv,                    # 전월세 전환율(연 %), 월세 보증금/전세금
            "jg5": cagr(j84, med(in84(r5)), 5), "jg10": cagr(j84, med(in84(r10)), 10),   # 84㎡ 전세 상승률
        })
        # 84㎡ 거래가 없으면 59㎡(25평형)로 상승률 계산
        if TYPE == "apt" and regions[code]["g10"] is None and regions[code]["g5"] is None:
            p59 = med(in_size(now, "59"))
            regions[code]["g5"] = cagr(p59, med(in_size(y5, "59")), 5)
            regions[code]["g10"] = cagr(p59, med(in_size(y10, "59")), 10)
            if regions[code]["g5"] is not None or regions[code]["g10"] is not None:
                regions[code]["g_basis"] = "59"
        if len(hist) > 1:
            regions[code]["hist_from"] = hist[1:]   # 상승률은 개편 전 코드도 함께 비교
        r = regions[code]
        print(f"[{i}/{len(codes)}] {code} {name}: 평균 {r['avg']}만 ({r['cnt']}건), 84㎡ {p84} / 전세 {j84}, "
              f"5년 {r['g5']}% 10년 {r['g10']}%  (누적 호출 {calls})")
        time.sleep(0.05)

    regions = drop_legacy(regions)
    if not regions:   # 전부 실패(권한·호출 한도 등)면 기존 파일을 건드리지 않음
        sys.exit(f"[{TYPE}] 받은 지역이 하나도 없어요. 저장하지 않아요.")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    window = months_back(end, WINDOW)
    if OUT.exists():
        old = json.loads(OUT.read_text())["regions"]
        if args.only:
            # 일부 시도만 다시 모았으면 나머지 지역은 기존 파일에서 그대로 가져옴
            # 새로 받은 결과가 있는 시도만 교체 (수집 실패로 비면 기존 데이터 유지)
            got = {c[:2] for c in regions}
            drop = (set(args.only) & got) | ({"29", "46"} if "12" in got else set())
            kept = {c: r for c, r in old.items() if c[:2] not in drop or (c in codes and c not in regions)}
        else:
            # 전체 수집: 이번에 실패한 지역(호출 한도 등)은 기존 데이터를 유지
            kept = {c: r for c, r in old.items() if c in codes and c not in regions}
        if kept:
            print(f"기존 데이터 유지: {len(kept)}곳", file=sys.stderr)
        regions = drop_legacy(dict(sorted({**kept, **regions}.items())))
    OUT.write_text(json.dumps({
        "updated": today.isoformat(),
        "window": [window[-1], window[0]],
        "source": "국토교통부 실거래가 공개시스템 (공공데이터포털 API)",
        "codes_source": src,
        "unit": "만원",
        "type": TYPE, "type_label": TYPES[TYPE]["label"], "main": TYPES[TYPE]["main"], "pyeong_word": TYPES[TYPE]["pyeong"],
        "sizes": {k: {"min": v[0], "max": v[1], "pyeong": v[2]} for k, v in SIZES.items()},
        "regions": regions,
    }, ensure_ascii=False, indent=1) + "\n")
    print(f"저장: {OUT.relative_to(ROOT)} ({len(regions)}곳, API 호출 {calls}회)")


if __name__ == "__main__":
    main()
