# -*- coding: utf-8 -*-
"""
쿠팡파트너스 API - 잘 팔리는 상품 리스트 추출
사용법:
  1. 아래 ACCESS_KEY, SECRET_KEY에 쿠팡파트너스에서 발급받은 키 입력
  2. python coupang_bestsellers.py
결과: bestsellers.csv 파일로 저장 (상품명/가격/이미지URL/제휴링크)
"""

import hmac
import hashlib
import requests
import csv
import json
from datetime import datetime, timezone

# ==== 형이 직접 입력할 부분 ====
ACCESS_KEY = "여기에_액세스키"
SECRET_KEY = "여기에_시크릿키"
# ==============================

DOMAIN = "https://api-gateway.coupang.com"

# 카테고리 ID (쿠팡파트너스 문서 기준)
CATEGORIES = {
    "1001": "여성패션",
    "1002": "남성패션",
    "1010": "뷰티",
    "1011": "출산/유아동",
    "1012": "식품",
    "1013": "주방용품",
    "1014": "생활용품",
    "1015": "홈인테리어",
    "1016": "가전디지털",
    "1017": "스포츠/레저",
    "1018": "자동차용품",
    "1019": "도서/음반/DVD",
    "1020": "완구/취미",
    "1021": "문구/오피스",
    "1024": "헬스/건강식품",
    "1025": "국내여행",
    "1026": "해외여행",
    "1029": "반려동물용품",
}


def generate_hmac(method: str, url_path: str) -> str:
    """쿠팡파트너스 API 인증 서명 생성"""
    signed_date = datetime.now(timezone.utc).strftime("%y%m%dT%H%M%SZ")
    message = signed_date + method + url_path.replace("?", "")
    signature = hmac.new(
        SECRET_KEY.encode(), message.encode(), hashlib.sha256
    ).hexdigest()
    return (
        f"CEA algorithm=HmacSHA256, access-key={ACCESS_KEY}, "
        f"signed-date={signed_date}, signature={signature}"
    )


def get_best_products(category_id: str, limit: int = 20) -> list:
    """카테고리별 베스트 상품 조회"""
    url_path = f"/v2/providers/affiliate_open_api/apis/openapi/products/bestcategories/{category_id}?limit={limit}"
    headers = {
        "Authorization": generate_hmac("GET", url_path),
        "Content-Type": "application/json",
    }
    resp = requests.get(DOMAIN + url_path, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json().get("data", [])


def get_goldbox() -> list:
    """오늘의 골드박스(특가) 상품 조회"""
    url_path = "/v2/providers/affiliate_open_api/apis/openapi/products/goldbox"
    headers = {
        "Authorization": generate_hmac("GET", url_path),
        "Content-Type": "application/json",
    }
    resp = requests.get(DOMAIN + url_path, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json().get("data", [])


def save_csv(products: list, filename: str):
    """상품 리스트를 CSV로 저장"""
    with open(filename, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(["상품명", "가격", "이미지URL", "제휴링크", "카테고리", "로켓배송"])
        for p in products:
            writer.writerow([
                p.get("productName", ""),
                p.get("productPrice", ""),
                p.get("productImage", ""),
                p.get("productUrl", ""),   # 이게 제휴링크 (수익 발생 지점)
                p.get("categoryName", ""),
                "O" if p.get("isRocket") else "X",
            ])
    print(f"저장 완료: {filename} ({len(products)}개)")


if __name__ == "__main__":
    all_products = []

    # 1) 골드박스 특가 상품
    try:
        gold = get_goldbox()
        print(f"골드박스: {len(gold)}개")
        all_products.extend(gold)
    except Exception as e:
        print(f"골드박스 실패: {e}")

    # 2) 주요 카테고리별 베스트 (원하는 카테고리만 골라서)
    target_categories = ["1016", "1014", "1010"]  # 가전, 생활용품, 뷰티
    for cat_id in target_categories:
        try:
            best = get_best_products(cat_id, limit=20)
            print(f"{CATEGORIES.get(cat_id, cat_id)} 베스트: {len(best)}개")
            all_products.extend(best)
        except Exception as e:
            print(f"{cat_id} 실패: {e}")

    save_csv(all_products, "bestsellers.csv")
