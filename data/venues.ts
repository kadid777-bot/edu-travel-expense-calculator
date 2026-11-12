// 자주 쓰는 교육 장소 3곳. 고르면 교육 장소의 시·도·시·군·구가 자동으로 채워진다.
// 시·도·시·군·구 이름은 data/sigungu.ts 목록과 똑같아야 한다(숙박 상한 지역 판정, 시내 판정, 철도역·좌표 조회에 쓴다).
// 주소는 시·군·구까지만 적었다. 정확한 번지 주소는 필요하면 운영자가 확인해서 고친다.
export interface Venue {
  id: string;
  name: string;
  address: string;
  sido: string;
  sigungu: string;
}

export const VENUES: Venue[] = [
  { id: "yangjae", name: "캠코양재타워", address: "서울특별시 서초구 (양재동)", sido: "서울특별시", sigungu: "서초구" },
  { id: "asan", name: "캠코인재개발원(아산)", address: "충청남도 아산시", sido: "충청남도", sigungu: "아산시" },
  { id: "busan-bifc", name: "부산 본사(BIFC)", address: "부산광역시 남구 (문현동)", sido: "부산광역시", sigungu: "남구" },
];

export const VENUE_OTHER = "other";
