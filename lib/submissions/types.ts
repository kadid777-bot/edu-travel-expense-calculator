// Design Ref: docs/SUBMISSION-DESIGN.md §5 — 제출 기록·증빙 파일의 모양과 제한
import type { CalculationInput, CalculationResult } from "../calc/types";

export const FILE_KINDS = ["highpass", "lodging", "transport", "other"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  highpass: "하이패스 영수증",
  lodging: "숙박비 영수증",
  transport: "교통비 영수증",
  other: "기타 증빙",
};

/** 허용하는 파일 형식 → 저장할 확장자 */
export const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

export const LIMITS = {
  maxFileBytes: 10 * 1024 * 1024, // 파일당 10MB
  maxFiles: 10, // 제출당 10개
  maxTotalBytes: 30 * 1024 * 1024, // 합계 30MB
  serverUploadBytes: 4 * 1024 * 1024, // 서버를 거치는 업로드는 서버리스 요청 크기 한도 때문에 4MB까지
  uploadKeyMinutes: 30, // 업로드 키 유효 시간
} as const;

export interface SubmissionFile {
  id: string;
  kind: FileKind;
  name: string; // 원본 이름(표시용). 저장 경로에는 쓰지 않는다
  size: number;
  contentType: string;
  blobPath: string; // submissions/{id}/{fileId}.{ext}
}

export interface Submission {
  id: string; // 접수 번호 (예: K7M2-9QXA)
  createdAt: string; // ISO
  status: "draft" | "submitted";
  submitter: { name: string; employeeNo: string };
  consent: { agreedAt: string; version: string };
  input: CalculationInput;
  result: CalculationResult;
  meta: { fetchedAt: string; notes: string[]; evidence?: unknown };
  files: SubmissionFile[];
  /** 업로드 키의 해시와 만료 시각 (키 자체는 저장하지 않는다) */
  uploadKeyHash?: string;
  uploadKeyExpires?: string;
}

/** 목록 표에 필요한 최소 정보 */
export interface SubmissionSummary {
  id: string;
  createdAt: string;
  name: string;
  employeeNo: string;
  venue: string;
  startDate: string;
  endDate: string;
  total: number;
  warnings: number;
  files: number;
}

export const CONSENT_VERSION = "2026-11-12";
export const CONSENT_TEXT =
  "여비 정산 확인을 위해 이름·사번, 산출 내역, 증빙 파일(영수증 등)을 수집·저장하는 데 동의합니다. 보관 기간은 운영자가 삭제할 때까지이며, 카드번호·주민등록번호 등은 가려서 올려야 합니다.";
