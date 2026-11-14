/**
 * Đọc thống kê học tập của user (spec/31) từ Firestore qua REST — cùng tài
 * liệu `users/{uid}/stats/current` mà web ghi (braintot-web stats.ts). Dùng
 * REST + idToken thay vì Firestore SDK để tái dùng đúng pattern sync-engine:
 * dùng access token backend của phiên liên kết (spec/62).
 * Mọi lỗi (mạng, 401, thiếu config) → null, popup hiển thị "—" thay vì crash.
 */

import { getAuthUid, getIdToken, initBackendAuth } from "./backend-auth";
import {
  getFirebaseWebConfig,
  type FirebaseWebConfig,
} from "./backend-config";

/** Subset thật sự hiển thị trên popup (khối schema của web — spec/31). */
export interface UserStats {
  streakDays: number;
  lastActiveDate: string; // YYYY-MM-DD
  todayReviewedCount: number;
  totalPracticedCount: number;
  dailyGoal: number;
  customChunksCount?: number;
  totalChunksCount?: number;
}

interface FetchUserStatsOptions {
  /** DI cho test (mặc định đọc import.meta.env như backend-config). */
  config?: FirebaseWebConfig;
  fetchImpl?: typeof fetch;
}

/** Firestore REST value → số an toàn (integerValue là CHUỖI trên wire). */
function readNumber(field: unknown): number | null {
  if (typeof field !== "object" || field === null) return null;
  const shape = field as { integerValue?: unknown; doubleValue?: unknown };
  if (typeof shape.integerValue === "string") {
    const parsed = Number.parseInt(shape.integerValue, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof shape.doubleValue === "number") return shape.doubleValue;
  return null;
}

/**
 * Parse document REST thành UserStats. Bắt buộc streakDays + lastActiveDate;
 * còn lại default 0/0/20 (mặc định dailyGoal của web). Thiếu gì đó → null.
 */
export function parseUserStatsDoc(
  doc: { fields?: Record<string, unknown> } | null | undefined,
): UserStats | null {
  const fields = doc?.fields;
  if (!fields) return null;
  const streakDays = readNumber(fields.streakDays);
  const lastActiveDate =
    typeof fields.lastActiveDate === "object" &&
    fields.lastActiveDate !== null &&
    typeof (fields.lastActiveDate as { stringValue?: unknown }).stringValue ===
      "string"
      ? (fields.lastActiveDate as { stringValue: string }).stringValue
      : null;
  if (streakDays === null || lastActiveDate === null) return null;
  const stats: UserStats = {
    streakDays,
    lastActiveDate,
    todayReviewedCount: readNumber(fields.todayReviewedCount) ?? 0,
    totalPracticedCount: readNumber(fields.totalPracticedCount) ?? 0,
    dailyGoal: readNumber(fields.dailyGoal) ?? 20,
  };
  // exactOptionalPropertyTypes: chỉ gán khi document thật sự có trường.
  const chunks = readNumber(fields.customChunksCount);
  if (chunks !== null) stats.customChunksCount = chunks;
  const totalChunks = readNumber(fields.totalChunksCount);
  if (totalChunks !== null) stats.totalChunksCount = totalChunks;
  return stats;
}

/** Date → "YYYY-MM-DD" theo giờ local. */
function toISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** "YYYY-MM-DD" → Date local; sai định dạng → null. */
function parseISODate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Dải tuần (T2→CN) chứa `today`: ô active khi ngày thuộc chuỗi streak —
 * từ `lastActiveDate` lùi về `streakDays - 1` ngày. stats null/sai → 7 false.
 */
export function streakWeek(
  stats: Pick<UserStats, "streakDays" | "lastActiveDate"> | null,
  today: Date,
): boolean[] {
  const days = [false, false, false, false, false, false, false];
  if (!stats || stats.streakDays <= 0) return days;
  const end = parseISODate(stats.lastActiveDate);
  if (!end) return days;
  const start = new Date(end);
  start.setDate(start.getDate() - (stats.streakDays - 1));

  // Thứ 2 của tuần chứa today (getDay(): 0=CN…6=T7; CN lùi 6 ngày về T2).
  const monday = new Date(today);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  for (let index = 0; index < 7; index += 1) {
    const day = new Date(monday);
    day.setDate(day.getDate() + index);
    const iso = toISODate(day);
    days[index] = iso >= toISODate(start) && iso <= stats.lastActiveDate;
  }
  return days;
}

/** URL document stats trên Firestore REST. */
function statsDocUrl(projectId: string, uid: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/stats/current`;
}

/**
 * Fetch stats 1 lần khi mở popup. Chưa auth / thiếu projectId / fetch lỗi /
 * !ok / document rỗng → null (caller hiển thị "—").
 */
export async function fetchUserStats(
  options?: FetchUserStatsOptions,
): Promise<UserStats | null> {
  try {
    await initBackendAuth();
    const uid = getAuthUid();
    const token = await getIdToken();
    const config = options?.config ?? getFirebaseWebConfig();
    if (!uid || !token || !config.projectId) return null;

    const fetchImpl = options?.fetchImpl ?? fetch;
    const response = await fetchImpl(statsDocUrl(config.projectId, uid), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const document = (await response.json()) as {
      fields?: Record<string, unknown>;
    };
    return parseUserStatsDoc(document);
  } catch {
    return null;
  }
}
