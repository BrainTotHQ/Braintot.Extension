/**
 * @types/node KHÔNG có trong deps (không được thêm dependency mới) — khai
 * báo tối giản đúng phần test popup dùng: webcrypto của Node runtime, để
 * bù jsdom thiếu crypto.subtle (QueueStore thật cần SHA-256 qua
 * pendingLinkId). Nếu sau này thêm @types/node thì xóa file này.
 */

declare module "node:crypto" {
  export const webcrypto: typeof globalThis.crypto;
}
