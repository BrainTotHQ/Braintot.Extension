// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("wxt/browser", () => ({
  browser: { runtime: { getURL: (path: string) => `chrome-extension://x${path}` } },
}));

import { createCaptureButton } from "./button";

const label = (button: ReturnType<typeof createCaptureButton>) =>
  button.element.querySelector(".braintot-button__label")?.textContent;

describe("nut Luu vao BrainTot", () => {
  it("idle -> nhan luu, bam goi onClick", () => {
    const onClick = vi.fn();
    const button = createCaptureButton(onClick);
    expect(label(button)).toBe("Lưu vào BrainTot");
    button.element.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("saved -> doi nhan va khoa nut", () => {
    const onClick = vi.fn();
    const button = createCaptureButton(onClick);
    button.setState("saved");
    expect(button.element.disabled).toBe(true);
    button.element.click();
    expect(onClick).not.toHaveBeenCalled();
  });
});
