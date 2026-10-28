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
IDX_FILE = SITE / "data" / "index.json"
IDX = json.loads(IDX_FILE.read_text())["regions"] if IDX_FILE.exists() else {}
CONFIG = json.loads((ROOT / "scripts" / "site_config.json").read_text())
URL = (CONFIG.get("url") or "").rstrip("/")
CONTACT = (CONFIG.get("contact") or "").strip()
SEO_RE = re.compile(r"<!-- seo -->.*?<!-- /seo -->", re.S)
CONTACT_RE = re.compile(r"<!-- contact -->.*?<!-- /contact -->", re.S)
MAIN_TITLE = "영끌각 | 집 살까 전세 살까? 매매·전세·월세 비교 계산기"
MAIN_DESC = "지역, 가진 돈, 살 기간만 넣으면 매매·전세·월세 중 몇 년 뒤 돈이 가장 많이 남는 쪽을 바로 알려줘요. 국토교통부 실거래가와 한국은행 금리 기준."

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


def absu(path):
    return f"{URL}/{path}" if URL else None


def seo(title, desc, path, jsonld=None):
    """<head> 안 검색·공유용 태그 묶음. path는 사이트 기준 경로('', 'faq/', 'r/11350/')"""
    e = html.escape
    img = absu("og.png") or "/og.png"
    out = [
        "<!-- seo -->",
        f"<title>{e(title)}</title>",
        f'<meta name="description" content="{e(desc)}">',
    ]
    if URL:
        out.append(f'<link rel="canonical" href="{absu(path)}">')
    out += [
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="영끌각">',
        '<meta property="og:locale" content="ko_KR">',
        f'<meta property="og:title" content="{e(title)}">',
        f'<meta property="og:description" content="{e(desc)}">',
        f'<meta property="og:image" content="{img}">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
    ]
    if URL:
        out.append(f'<meta property="og:url" content="{absu(path)}">')
    out += [
        '<meta name="twitter:card" content="summary_large_image">',
        '<meta name="theme-color" content="#cf2f25">',
        '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
        '<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">',
        '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    ]
    if jsonld:
        out.append('<script type="application/ld+json">' + json.dumps(jsonld, ensure_ascii=False) + "</script>")
    out.append("<!-- /seo -->")
    return "\n".join(out)


def stamp(file, block):
    t = file.read_text()
    assert SEO_RE.search(t), f"{file}에 <!-- seo --> 표시가 없어요"
    t = SEO_RE.sub(lambda m: block, t, count=1)
    if CONTACT_RE.search(t):
        c = (f'<a href="mailto:{html.escape(CONTACT)}">{html.escape(CONTACT)}</a>' if "@" in CONTACT
             else f'<a href="{html.escape(CONTACT)}">{html.escape(CONTACT)}</a>' if CONTACT.startswith("http")
             else "연락처를 준비하고 있어요")
        t = CONTACT_RE.sub(lambda m: f"<!-- contact -->{c}<!-- /contact -->", t)
    file.write_text(t)


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
    ix = (IDX.get(code) or {}) if IDX else {}
    sale = ix.get("sale") or {}
    if sale.get("gall") is not None:
        who = "이 지역" if ix.get("level") == "own" else ix.get("label", "시도 전체")
        s = (f"한국부동산원 아파트 매매가격지수로 보면 {who} 아파트값은 {sale['from'][:4]}년부터 해마다 평균 "
             f"{pct(sale['gall'])} {'올랐' if sale['gall'] >= 0 else '떨어졌'}어요")
        bits = [f"{y}년은 {'+' if sale[k] >= 0 else '−'}{pct(sale[k])}" for y, k in ((10, "g10"), (5, "g5")) if sale.get(k) is not None]
        lines.append(s + (f" (최근 {', '.join(bits)}씩)" if bits else "") + ".")
    g10, g5 = r.get("g10"), r.get("g5")
    if g10 is not None and sale.get("gall") is None:
        s = f"84㎡(34평형) 집값은 10년 전 같은 달보다 해마다 평균 {pct(g10)} {'올랐' if g10 >= 0 else '떨어졌'}어요"
        if g5 is not None:
            s += f". 5년 전과 비교하면 해마다 {pct(g5)} {'올랐' if g5 >= 0 else '떨어졌'}어요"
        lines.append(s + ".")
    if r.get("conv") and r.get("nconv", 0) >= 10 and 2 <= r["conv"] <= 10:   # 계산기와 같은 기준
        per1 = r["conv"] / 12 * 100   # 전세 1억당 월 (만 원)
        s = f"월세는 전세 1억당 월 {per1:.0f}만 원 꼴이에요"
        if r.get("wdep"):
            s += f" (보증금은 전세금의 {round(r['wdep'] * 100)}% 정도)"   # wdep는 비율(0.14)
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
    for mark in ("<!-- seo -->", "<h1>이 집, 영끌해서 사야 하나?</h1>", '<a class="peek" id="peek"', '<script src="app.js"></script>'):
        assert mark in tpl, f"site/index.html에서 '{mark}'를 못 찾음 — build_pages.py도 고쳐야 해요"
    t = tpl
    crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "영끌각", **({"item": absu("")} if URL else {})},
        {"@type": "ListItem", "position": 2, "name": "지역별 시세", **({"item": absu("r/")} if URL else {})},
        {"@type": "ListItem", "position": 3, "name": short, **({"item": absu(f"r/{code}/")} if URL else {})},
    ]}
    block = seo(f"{short} 아파트 매매·전세·월세 비교 | 영끌각", meta_desc(r), f"r/{code}/", crumbs)
    t = SEO_RE.sub(lambda m: block + '\n<base href="../../">', t, count=1)
    t = t.replace("<h1>이 집, 영끌해서 사야 하나?</h1>", f"<h1>{html.escape(short)} 아파트, 영끌해서 사야 하나?</h1>", 1)
    t = t.replace('  <a class="peek" id="peek"', facts + '\n  <a class="peek" id="peek"', 1)
    t = t.replace('<script src="app.js"></script>', f"<script>window.PRESET_REGION = '{code}';</script>\n<script src=\"app.js\"></script>", 1)
    return t


def llms(window):
    link = lambda p: absu(p) or "/" + p
    a, b = window
    return f"""# 영끌각

> 한국 아파트를 살지(매매), 전세로 살지, 월세로 살지 정할 때 몇 년 뒤 내 돈이 가장 많이 남는 쪽을 계산해주는 무료 웹 계산기.

- 입력: 지역(시군구), 집 크기(평형), 지금 가진 돈, 살 기간(년)
- 결과: 매매·전세·월세 각각 N년 뒤 남는 돈, 이기는 쪽과 차이 금액, 결과가 뒤집히는 집값 상승률
- 시세: 국토교통부 아파트 매매·전월세 실거래가, 최근 3개월 크기별 중간값 ({ym(a)}~{ym(b)})
- 집값·전세 상승률: 한국부동산원 월간 아파트 매매·전세가격지수의 장기 연평균(대부분 2003년 11월부터). 지수가 없는 시군은 시도 지수
- 금리: 한국은행 ECOS 예금은행 가중평균금리(주택담보대출, 전세자금대출, 정기예금, 신규취급액 기준)
- 세금: 취득세, 재산세, 종합부동산세를 1세대 1주택 법정 세율로 계산
- 매달 16일 갱신. 참고용 시뮬레이션이며 투자·대출 조언이 아님

## 페이지

- [계산기]({link("")}): 지역을 고르고 바로 계산
- [계산 방법·자주 묻는 질문]({link("faq/")})
- [지역별 시세]({link("r/")}): 시군구별 아파트 매매·전세 중간값과 그 지역으로 열린 계산기
- [소개]({link("about/")})
- [개인정보 처리방침]({link("privacy/")})
"""


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
{seo("지역별 아파트 매매·전세·월세 비교 | 영끌각", "전국 시군구별 아파트 매매·전세 중간 가격과, 매매·전세·월세 중 어디가 돈이 더 남는지 계산하는 페이지 모음이에요.", "r/")}
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

    # 손으로 쓰는 페이지들의 검색·공유 태그와 연락처
    app = {"@context": "https://schema.org", "@type": "WebApplication", "name": "영끌각", "applicationCategory": "FinanceApplication",
           "operatingSystem": "웹 브라우저", "inLanguage": "ko", "description": MAIN_DESC,
           "offers": {"@type": "Offer", "price": "0", "priceCurrency": "KRW"}, **({"url": absu("")} if URL else {})}
    stamp(SITE / "faq" / "index.html", seo("영끌각 계산 방법 · 자주 묻는 질문", "영끌각이 매매·전세·월세를 어떻게 비교하는지, 시세·상승률·세금·대출을 어떤 기준으로 계산하는지 자세히 설명해요.", "faq/"))
    stamp(SITE / "about" / "index.html", seo("영끌각 소개", "영끌각은 매매·전세·월세 중 몇 년 뒤 돈이 더 남는 쪽을 공공 데이터로 계산해주는 무료 웹 계산기예요.", "about/"))
    stamp(SITE / "privacy" / "index.html", seo("개인정보 처리방침 | 영끌각", "영끌각은 회원가입이 없고 입력한 값을 서버로 보내지 않아요. 광고 쿠키와 접속 기록 처리 방식을 설명해요.", "privacy/"))
    # 계산기 본문(index.html)이 틀이라 마지막에: 위 지역 페이지는 이미 만들어짐
    stamp(SITE / "index.html", seo(MAIN_TITLE, MAIN_DESC, "", app))

    pages = ["", "faq/", "about/", "privacy/", "r/"] + [f"r/{c}/" for c in sorted(ok)]
    robots = "User-agent: *\nAllow: /\n"
    if URL:
        day = (data.get("updated") or "")[:10]
        items = "".join(f"<url><loc>{absu(p)}</loc>{f'<lastmod>{day}</lastmod>' if day and p.startswith('r/') else ''}</url>\n" for p in pages)
        (SITE / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + items + "</urlset>\n")
        robots += f"Sitemap: {absu('sitemap.xml')}\n"
    (SITE / "robots.txt").write_text(robots)
    (SITE / "llms.txt").write_text(llms(window))
    print("검색·공유 태그, robots.txt, llms.txt" + (", sitemap.xml" if URL else " (url이 없어 sitemap·canonical 생략)"))


if __name__ == "__main__":
    main()
