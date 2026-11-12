// Design Ref: §2.2 ② — 질문과 관련 있는 규정 조항 찾기 (규정이 2개뿐이라 별도 벡터 DB 없이 글자 쌍(bigram) 일치로 검색한다)
// 데이터: data/regulation-chunks.json (scripts/build-regulation-chunks.mjs 로 생성)
import chunksJson from "../../data/regulation-chunks.json";

export interface Chunk {
  document: "여비세칙" | "인력개발세칙";
  article: string; // 예: "제9조", "제4조의2", "별표 1"
  title: string;
  text: string;
}

export interface Hit {
  chunk: Chunk;
  score: number;
}

const CHUNKS = chunksJson as Chunk[];

// 질문의 일상 표현을 규정 용어로 넓혀서 검색한다
const EXPANSIONS: [RegExp, string][] = [
  [/ktx|케이티엑스|고속철|기차|열차|철도/i, "철도운임 고속철도 일반실 특실"],
  [/특실|1등석|일등석|비즈니스/, "특실 고속철도특실 일반실"],
  [/비행기|항공|공항/, "항공운임 항공마일리지"],
  [/버스/, "자동차운임 고속버스"],
  [/자차|자가용|내\s*차|승용차|주유|기름|통행료|하이패스/, "자가용 자동차운임 연료비 통행료"],
  [/숙박|호텔|잠|1박|2박|묵/, "숙박비 숙박하는 밤의 수 상한액"],
  [/식사|식대|식비/, "식비 식사 제공"],
  [/일비|일당/, "일비"],
  [/교통/, "교통비 교통수단"],
  [/교육|연수|훈련/, "교육훈련비 교육대상자 집행기준"],
  [/시내|근거리|같은\s*(시|구|군)/, "시내출장 시내화출장 당일귀임"],
  [/여비|출장비|경비|비용|지급|받을\s*수/, "여비 출장 지급기준 별표"],
];

// 규정과 관련된 말이 하나도 없는 질문(예: 점심 메뉴, 주식)은 검색하지 않는다 — 확장어 때문에 엉뚱한 조항이 걸리는 것을 막는다
const DOMAIN_TERMS =
  /여비|출장|교육|연수|훈련|숙박|식비|식사|식대|교통|항공|비행기|철도|ktx|열차|기차|버스|자차|자가용|통행료|하이패스|주유|일비|일당|지급|규정|한도|상한|인정|실비|환입|정액|시내|시외|특실|일반실|별표|조항|세칙/i;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

function bigrams(text: string): Set<string> {
  const t = normalize(text);
  const set = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

interface Indexed {
  chunk: Chunk;
  body: Set<string>;
  title: Set<string>;
}

const INDEX: Indexed[] = CHUNKS.map((chunk) => ({
  chunk,
  body: bigrams(chunk.text),
  title: bigrams(`${chunk.title} ${chunk.article}`),
}));

// 너무 흔한 글자 쌍은 점수에서 약하게 반영한다 (문서 빈도의 역수)
const DF = new Map<string, number>();
for (const it of INDEX) for (const b of it.body) DF.set(b, (DF.get(b) ?? 0) + 1);
const N = INDEX.length;
const idf = (b: string) => Math.log(1 + N / (DF.get(b) ?? 0.5));

/** 질문에 관련 있는 조항을 점수순으로 최대 k개 돌려준다. 근거가 약하면 빈 배열 */
export function retrieve(question: string, k = 6, minScore = 4): Hit[] {
  if (!DOMAIN_TERMS.test(question)) return [];
  let expanded = question;
  for (const [re, add] of EXPANSIONS) if (re.test(question)) expanded += ` ${add}`;
  const q = bigrams(expanded);
  if (q.size === 0) return [];

  const hits: Hit[] = [];
  for (const it of INDEX) {
    let score = 0;
    for (const b of q) {
      if (it.body.has(b)) score += idf(b);
      if (it.title.has(b)) score += idf(b) * 1.5; // 제목·조항명에 맞으면 가중
    }
    // 긴 조각이 글자 쌍이 많아 유리해지는 것을 완화
    score /= Math.log(3 + it.chunk.text.length / 400);
    if (score >= minScore) hits.push({ chunk: it.chunk, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, k);
}

/** "제9조 제5항", "별표 1 (부분)" 같은 표기에서 조항 번호 부분만 뽑는다 */
export function baseArticle(article: string): string {
  const m = article.replace(/\s+/g, " ").trim().match(/^(제\d+조(?:의\d+)?|별표 ?\d+(?:의\d+)?)/);
  return m ? m[1].replace(/^별표(\d)/, "별표 $1") : article.trim();
}
