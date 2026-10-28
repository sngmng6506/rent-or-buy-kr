#!/usr/bin/env python3
"""지역별 페이지를 만든다: site/r/<시군구코드>/index.html, site/r/index.html

- 각 지역 페이지 = 계산기(site/index.html, app.js·app.css 공용)를 그 지역으로 연 상태 + 그 지역 시세 설명
- 검색으로 "노원구 전세 매매" 같은 말을 찾는 사람이 바로 그 지역 계산기로 들어오게 하려는 것
- site/index.html 이나 site/data/regions.json 이 바뀌면 다시 실행 (수집 워크플로우가 매달 실행)

사용: python scripts/build_pages.py
"""
import html
import json
import re
import shutil
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
OUT = SITE / "r"

PYEONG = {"39": 16, "49": 20, "59": 25, "74": 30, "84": 34, "101": 40, "114": 45}
SIDO_ORDER = ["11", "28", "41", "26", "27", "30", "36", "12", "29", "31", "43", "44", "45", "52", "46", "47", "48", "51", "42", "50"]


def won(man):
    """만 원 단위 → '8억 2,800만 원'"""
    if man is None:
        return "—"
    man = int(round(man / 100.0) * 100) if man >= 10000 else int(round(man))
    eok, rest = divmod(man, 10000)
    if eok and rest:
        return f"{eok}억 {rest:,}만 원"
    if eok:
        return f"{eok}억 원"
    return f"{rest:,}만 원"


def cell(man):
    """표 칸: 단위(원)는 머리글에 있으니 뺌 — '8억 2,800만'"""
    return won(man).removesuffix(" 원") if man else "—"


def ym(s):
    return f"{s[:4]}년 {int(s[4:])}월" if s else ""


SIDO_SHORT = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구", "인천광역시": "인천", "대전광역시": "대전",
    "울산광역시": "울산", "세종특별자치시": "세종", "경기도": "경기", "강원특별자치도": "강원", "충청북도": "충북",
    "충청남도": "충남", "전북특별자치도": "전북", "전남광주통합특별시": "전남광주", "경상북도": "경북",
    "경상남도": "경남", "제주특별자치도": "제주",
}


def short_name(name):
    """목록 안에서 쓰는 이름 (시도 빼고): '노원구', '수원시 장안구'"""
    parts = name.split()
    return " ".join(parts[1:]) if len(parts) > 1 else SIDO_SHORT.get(name, name)


def title_name(name):
    """제목용: 같은 이름 구(중구·동구 등)가 여러 시도에 있어서 시도 약칭을 붙임 — '서울 노원구'"""
    parts = name.split()
    sido = SIDO_SHORT.get(parts[0], parts[0])
    return " ".join([sido] + parts[1:]) if len(parts) > 1 else sido


def size_text(k):
    return f"{k}㎡({PYEONG[k]}평형)"


def pct(v):
    return f"{abs(v):.1f}%".replace(".0%", "%")


def describe(code, r, window):
    """지역 설명 문단과 표"""
    name, short = r["name"], short_name(r["name"])
    a, b = window
    lines = []
    first = f"{ym(a)}~{ym(b)} 실거래가 기준이에요. 이 기간 매매 거래는 {r.get('cnt', 0):,}건이에요."
    if r.get("jratio"):
        first += f" 전세금은 보통 집값의 {round(r['jratio'])}% 정도예요."
    lines.append(first)
    g10, g5 = r.get("g10"), r.get("g5")
    if g10 is not None:
        s = f"84㎡(34평형) 집값은 10년 전 같은 달보다 해마다 평균 {pct(g10)} {'올랐' if g10 >= 0 else '떨어졌'}어요"
        if g5 is not None:
            s += f". 5년 전과 비교하면 해마다 {pct(g5)} {'올랐' if g5 >= 0 else '떨어졌'}어요"
        lines.append(s + ".")
    if r.get("conv") and r.get("nconv", 0) >= 10:
        per1 = r["conv"] / 12 * 100   # 전세 1억당 월 (만 원)
        s = f"월세는 전세 1억당 월 {per1:.0f}만 원 꼴이에요"
        if r.get("wdep"):
            s += f" (보증금은 전세금의 {round(r['wdep'])}% 정도)"
        lines.append(s + ".")

    rows = []
    for k in PYEONG:
        sz = (r.get("sizes") or {}).get(k) or {}
        n, nj = sz.get("n", 0) or 0, sz.get("nj", 0) or 0
        if not n and not nj:
            continue
        few = ' class="few"' if n < 5 else ""
        rows.append(
            f'<tr><td>{size_text(k)}</td>'
            f'<td{few}>{cell(sz.get("p"))}</td>'
            f'<td>{cell(sz.get("j"))}</td>'
            f'<td>{n:,}건</td></tr>'
        )
    table = ""
    if rows:
        table = (
            '<div class="table"><table><thead><tr><th>크기</th><th>매매 중간값(원)</th><th>전세 중간값(원)</th><th>매매 거래</th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table></div>'
        )
    return lines, table


def meta_desc(r):
    s84 = (r.get("sizes") or {}).get("84") or {}
    bits = [f"{r['name']} 아파트"]
    if s84.get("p"):
        bits.append(f"84㎡(34평형) 매매 중간값 {won(s84['p'])}")
    if s84.get("j"):
        bits.append(f"전세 {won(s84['j'])}")
    return ", ".join(bits) + ". 가진 돈과 사는 기간을 넣으면 매매·전세·월세 중 어디가 돈이 더 남는지 바로 계산해요."


def page(tpl, code, r, siblings, window):
    name, short = r["name"], title_name(r["name"])
    lines, table = describe(code, r, window)
    nav = " ".join(
        f'<span class="here">{html.escape(short_name(n))}</span>' if c == code
        else f'<a href="r/{c}/index.html">{html.escape(short_name(n))}</a>'
        for c, n in siblings
    )
    facts = f"""
  <section class="panel facts" aria-labelledby="facts-h">
    <h2 id="facts-h">{html.escape(name)} 아파트 시세</h2>
    {''.join(f'<p>{html.escape(x)}</p>' for x in lines)}
    {table}
    <nav aria-label="같은 시도 다른 지역">{nav}</nav>
    <p><a href="r/index.html">전체 지역 보기</a> · <a href="index.html">처음 화면</a></p>
  </section>
"""
    for mark in ("<title>영끌각</title>", "<h1>이 집, 영끌해서 사야 하나?</h1>", '<a class="peek" id="peek"', '<script src="app.js"></script>'):
        assert mark in tpl, f"site/index.html에서 '{mark}'를 못 찾음 — build_pages.py도 고쳐야 해요"
    t = tpl
    t = t.replace("<title>영끌각</title>",
                  f"<title>{html.escape(short)} 아파트 매매·전세·월세 비교 | 영끌각</title>\n"
                  f'<meta name="description" content="{html.escape(meta_desc(r))}">\n'
                  f'<base href="../../">', 1)
    t = t.replace("<h1>이 집, 영끌해서 사야 하나?</h1>", f"<h1>{html.escape(short)} 아파트, 영끌해서 사야 하나?</h1>", 1)
    t = t.replace('  <a class="peek" id="peek"', facts + '\n  <a class="peek" id="peek"', 1)
    t = t.replace('<script src="app.js"></script>', f"<script>window.PRESET_REGION = '{code}';</script>\n<script src=\"app.js\"></script>", 1)
    return t


def index_page(faq_head_css, groups, sido_names, window):
    parts = []
    for sc in sorted(groups, key=lambda s: SIDO_ORDER.index(s) if s in SIDO_ORDER else 99):
        links = " ".join(f'<a href="r/{c}/index.html">{html.escape(short_name(n))}</a>' for c, n in groups[sc])
        parts.append(f'<section><h2>{html.escape(sido_names.get(sc, sc))}</h2><p class="links">{links}</p></section>')
    a, b = window
    return f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>지역별 아파트 매매·전세·월세 비교 | 영끌각</title>
<meta name="description" content="전국 시군구별 아파트 매매·전세 중간 가격과, 매매·전세·월세 중 어디가 돈이 더 남는지 계산하는 페이지 모음이에요.">
<base href="../">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=IBM+Plex+Sans+KR:wght@400;500;700&display=swap">
<style>
{faq_head_css}
section h2 {{ font-size: 18px; margin: 14px 0 6px; }}
.links {{ display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0 0 14px; }}
.links a {{ color: var(--ink); }}
</style>
</head>
<body>
<div class="doc">
  <div class="top"><a class="brand" href="index.html">영끌각</a><a class="back" href="index.html">계산하러 가기</a></div>
  <header>
    <h1>지역별 아파트 시세</h1>
    <p class="lead">{ym(a)}~{ym(b)} 실거래가 기준이에요. 지역을 누르면 그 지역으로 매매·전세·월세를 비교해요.</p>
  </header>
  {''.join(parts)}
</div>
</body>
</html>
"""


def main():
    tpl = (SITE / "index.html").read_text()
    data = json.loads((SITE / "data" / "regions.json").read_text())
    regions, window = data["regions"], data.get("window") or ["", ""]
    faq = (SITE / "faq" / "index.html").read_text()
    faq_css = re.search(r"<style>(.*?)</style>", faq, re.S).group(1)

    ok = {c: r for c, r in regions.items() if r.get("name") and (r.get("cnt") or 0) > 0}
    groups, sido_names = defaultdict(list), {}
    for c, r in sorted(ok.items()):
        groups[c[:2]].append((c, r["name"]))
        sido_names.setdefault(c[:2], r["name"].split()[0])

    if OUT.exists():
        shutil.rmtree(OUT)
    for c, r in ok.items():
        d = OUT / c
        d.mkdir(parents=True)
        (d / "index.html").write_text(page(tpl, c, r, groups[c[:2]], window))
    (OUT / "index.html").write_text(index_page(faq_css, groups, sido_names, window))
    print(f"지역 페이지 {len(ok)}개 + 목록 → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
