const crypto = require('crypto');

const DOMAIN = 'https://api-gateway.coupang.com';

const CATEGORIES = {
  '1001': '여성패션', '1002': '남성패션', '1010': '뷰티', '1011': '출산/유아동',
  '1012': '식품', '1013': '주방용품', '1014': '생활용품', '1015': '홈인테리어',
  '1016': '가전디지털', '1017': '스포츠/레저', '1018': '자동차용품', '1019': '도서/음반/DVD',
  '1020': '완구/취미', '1021': '문구/오피스', '1024': '헬스/건강식품',
  '1025': '국내여행', '1026': '해외여행', '1029': '반려동물용품'
};

function signedDateNow() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const yy = pad(d.getUTCFullYear() % 100);
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  return `${yy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

// 쿠팡파트너스 서명 규칙: signedDate + method + urlPath에서 '?'만 제거한 문자열
function generateAuthHeader(method, urlPath, accessKey, secretKey) {
  const signedDate = signedDateNow();
  const message = signedDate + method + urlPath.replace('?', '');
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${signedDate}, signature=${signature}`;
}

async function callCoupangApi(urlPath, accessKey, secretKey) {
  const authHeader = generateAuthHeader('GET', urlPath, accessKey, secretKey);
  const resp = await fetch(DOMAIN + urlPath, {
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json'
    }
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} ${text.slice(0, 200)}`);
  }
  const json = await resp.json();
  return json.data || [];
}

function normalize(p, catLabel) {
  return {
    name: p.productName || '',
    price: p.productPrice || '',
    img: p.productImage || '',
    link: p.productUrl || '',
    cat: catLabel,
    rocket: p.isRocket ? 'O' : 'X'
  };
}

module.exports = async (req, res) => {
  // CORS: GitHub Pages(rorhkdcns.github.io)에서 이 함수를 직접 fetch할 수 있게 허용
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const ACCESS_KEY = process.env.COUPANG_ACCESS_KEY;
  const SECRET_KEY = process.env.COUPANG_SECRET_KEY;

  if (!ACCESS_KEY || !SECRET_KEY) {
    res.status(500).json({ error: 'Vercel 환경변수에 COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY가 설정되지 않았습니다.' });
    return;
  }

  const categoriesParam = req.query.categories;
  const targetCategories = categoriesParam
    ? String(categoriesParam).split(',').map(s => s.trim()).filter(Boolean)
    : ['1016', '1014', '1010']; // 기본값: 가전디지털, 생활용품, 뷰티

  const products = [];
  const errors = [];

  // 1) 골드박스 특가 상품
  try {
    const gold = await callCoupangApi(
      '/v2/providers/affiliate_open_api/apis/openapi/products/goldbox',
      ACCESS_KEY, SECRET_KEY
    );
    products.push(...gold.map(p => normalize(p, '골드박스')));
  } catch (e) {
    errors.push('골드박스: ' + e.message);
  }

  // 2) 카테고리별 베스트
  for (const catId of targetCategories) {
    try {
      const best = await callCoupangApi(
        `/v2/providers/affiliate_open_api/apis/openapi/products/bestcategories/${catId}?limit=20`,
        ACCESS_KEY, SECRET_KEY
      );
      products.push(...best.map(p => normalize(p, CATEGORIES[catId] || catId)));
    } catch (e) {
      errors.push(`${catId}: ` + e.message);
    }
  }

  res.status(200).json({ products, errors, count: products.length });
};
