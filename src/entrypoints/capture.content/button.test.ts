// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("wxt/browser", () => ({
  browser: { runtime: { getURL: (path: string) => `chrome-extension://x${path}` } },
}));

import { createCaptureButton } from "./button";

const label = (button: ReturnType<typeof createCaptureButton>) =>
  button.element.querySelector(".braintot-button__label")?.textContent;

describe("nút Lưu vào BrainTot theo trạng thái liên kết (spec/62)", () => {
  it("đã liên kết → nhãn lưu", () => {
    const button = createCaptureButton(() => {});
    expect(label(button)).toBe("Lưu vào BrainTot");
  });

  it("chưa liên kết → nhãn mời đồng bộ với BrainTot Web, vẫn bấm được", () => {
    const onClick = vi.fn();
    const button = createCaptureButton(onClick);
    button.setLinkStatus("unlinked");
    expect(label(button)).toBe("Đồng bộ với BrainTot Web");
    button.element.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("hết hạn → nhãn liên kết lại; liên kết xong → quay về nhãn lưu", () => {
    const button = createCaptureButton(() => {});
    button.setLinkStatus("expired");
    expect(label(button)).toBe("Liên kết lại BrainTot Web");
    button.setLinkStatus("linked");
    expect(label(button)).toBe("Lưu vào BrainTot");
  });
});
