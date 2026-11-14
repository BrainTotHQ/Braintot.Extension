import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "BrainTot extension",
    description:
      "Lưu video ngắn bạn vừa xem vào hàng đợi BrainTot để biến thành bài học tiếng Anh.",
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
    permissions: ["activeTab", "storage"],
    // Trang bắt tay đăng nhập: chỉ web origin được gửi message về extension.
    externally_connectable: { matches: ["https://braintot-web-jsgeeh2ixa-de.a.run.app/*"] },
    host_permissions: ["*://*.youtube.com/*", "*://*.tiktok.com/*", "*://*.facebook.com/*"],
    web_accessible_resources: [
      {
        resources: ["mascot/*"],
        matches: ["*://*.youtube.com/*", "*://*.tiktok.com/*", "*://*.facebook.com/*"],
      },
    ],
  },
});
