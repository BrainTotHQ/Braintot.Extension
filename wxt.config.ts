import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "QuizKard",
    description:
      "Lưu video ngắn bạn vừa xem vào hàng đợi QuizKard để biến thành bài học tiếng Anh.",
    icons: {
      "16": "/icons/icon-16.png",
      "32": "/icons/icon-32.png",
      "48": "/icons/icon-48.png",
      "128": "/icons/icon-128.png",
    },
    action: {
      default_icon: {
        "16": "/icons/icon-16.png",
        "32": "/icons/icon-32.png",
        "48": "/icons/icon-48.png",
      },
    },
    permissions: ["activeTab", "storage", "alarms"],
    // Trang bắt tay đăng nhập: chỉ web origin được gửi message về extension.
    externally_connectable: { matches: ["https://quizkard.tonythaniel.com/*"] },
    host_permissions: [
      "*://*.youtube.com/*",
      "*://*.tiktok.com/*",
      "*://*.facebook.com/*",
      // Backend NestJS (sync pending-links) - spec 16 T5.
      "http://localhost:3001/*",
      "http://127.0.0.1:3001/*",
      "https://quizkard.tonythaniel.com/*",
    ],
  },
});
