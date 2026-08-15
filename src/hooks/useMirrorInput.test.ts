import { describe, it, expect } from "bun:test";
import {
  calculateCanvasVideoRect,
  normalizeCoordinates,
  ANDROID_KEYCODES,
  SPECIAL_KEY_MAP,
  computeScrollTicks,
  classifyKeyEvent,
} from "./useMirrorInput";

describe("useMirrorInput - Coordinate & Letterbox Normalization", () => {
  function createMockCanvas(
    boundingWidth: number,
    boundingHeight: number,
    boundingLeft = 0,
    boundingTop = 0,
  ): HTMLCanvasElement {
    return {
      getBoundingClientRect: () => ({
        width: boundingWidth,
        height: boundingHeight,
        left: boundingLeft,
        top: boundingTop,
        right: boundingLeft + boundingWidth,
        bottom: boundingTop + boundingHeight,
        x: boundingLeft,
        y: boundingTop,
        toJSON: () => {},
      }),
      width: boundingWidth,
      height: boundingHeight,
    } as unknown as HTMLCanvasElement;
  }

  it("handles null or zero-dimension canvas safely", () => {
    expect(calculateCanvasVideoRect(null, 1080, 1920)).toBeNull();

    const zeroCanvas = createMockCanvas(0, 0);
    expect(calculateCanvasVideoRect(zeroCanvas, 1080, 1920)).toBeNull();

    const zeroIntrinsicZeroCanvas = createMockCanvas(0, 0);
    expect(calculateCanvasVideoRect(zeroIntrinsicZeroCanvas, 0, 0)).toBeNull();

    const validCanvas = createMockCanvas(400, 800);
    // When intrinsic dimensions are 0, falls back to canvas width/height
    const fallbackRect = calculateCanvasVideoRect(validCanvas, 0, 0);
    expect(fallbackRect).not.toBeNull();
    expect(fallbackRect!.width).toBe(400);
    expect(fallbackRect!.height).toBe(800);

    const normZero = normalizeCoordinates(50, 50, null, 1080, 1920);
    expect(normZero).toEqual({ x: 0, y: 0, inside: false });
  });

  it("calculates exact rect when aspect ratio perfectly matches", () => {
    // 1080x1920 stream displayed inside 540x960 canvas
    const canvas = createMockCanvas(540, 960, 100, 200);
    const rect = calculateCanvasVideoRect(canvas, 1080, 1920);

    expect(rect).not.toBeNull();
    expect(rect!.left).toBe(100);
    expect(rect!.top).toBe(200);
    expect(rect!.width).toBe(540);
    expect(rect!.height).toBe(960);
    expect(rect!.scale).toBe(0.5);

    // Center click
    const center = normalizeCoordinates(370, 680, canvas, 1080, 1920);
    expect(center.inside).toBe(true);
    expect(center.x).toBeCloseTo(0.5, 3);
    expect(center.y).toBeCloseTo(0.5, 3);

    // Top-left click
    const topLeft = normalizeCoordinates(100, 200, canvas, 1080, 1920);
    expect(topLeft.inside).toBe(true);
    expect(topLeft.x).toBeCloseTo(0.0, 3);
    expect(topLeft.y).toBeCloseTo(0.0, 3);

    // Bottom-right click
    const bottomRight = normalizeCoordinates(640, 1160, canvas, 1080, 1920);
    expect(bottomRight.inside).toBe(true);
    expect(bottomRight.x).toBeCloseTo(1.0, 3);
    expect(bottomRight.y).toBeCloseTo(1.0, 3);
  });

  it("calculates exact pillarboxing (black bars on left and right)", () => {
    // 1080x2160 stream (1:2 aspect ratio) in a wide 800x800 container
    // Active video height = 800, active video width = 800 * (1080/2160) = 400
    // Left/Right black bars = (800 - 400) / 2 = 200px each
    const canvas = createMockCanvas(800, 800, 0, 0);
    const rect = calculateCanvasVideoRect(canvas, 1080, 2160);

    expect(rect).not.toBeNull();
    expect(rect!.left).toBe(200); // 200px left offset
    expect(rect!.top).toBe(0);
    expect(rect!.width).toBe(400);
    expect(rect!.height).toBe(800);

    // Click in the left black bar (x = 50, y = 400) -> inside should be FALSE
    const leftBarClick = normalizeCoordinates(50, 400, canvas, 1080, 2160);
    expect(leftBarClick.inside).toBe(false);
    expect(leftBarClick.x).toBe(0); // Clamped to 0

    // Click in the right black bar (x = 750, y = 400) -> inside should be FALSE
    const rightBarClick = normalizeCoordinates(750, 400, canvas, 1080, 2160);
    expect(rightBarClick.inside).toBe(false);
    expect(rightBarClick.x).toBe(1); // Clamped to 1

    // Click in active center (x = 400, y = 400) -> inside should be TRUE
    const centerClick = normalizeCoordinates(400, 400, canvas, 1080, 2160);
    expect(centerClick.inside).toBe(true);
    expect(centerClick.x).toBeCloseTo(0.5, 3);
    expect(centerClick.y).toBeCloseTo(0.5, 3);
  });

  it("calculates exact letterboxing (black bars on top and bottom)", () => {
    // 1920x1080 landscape stream in a tall 600x600 container
    // Active video width = 600, active video height = 600 * (1080/1920) = 337.5
    // Top/Bottom black bars = (600 - 337.5) / 2 = 131.25px each
    const canvas = createMockCanvas(600, 600, 50, 50);
    const rect = calculateCanvasVideoRect(canvas, 1920, 1080);

    expect(rect).not.toBeNull();
    expect(rect!.left).toBe(50);
    expect(rect!.top).toBeCloseTo(50 + 131.25, 2);
    expect(rect!.width).toBe(600);
    expect(rect!.height).toBeCloseTo(337.5, 2);

    // Click in top black bar
    const topBarClick = normalizeCoordinates(350, 60, canvas, 1920, 1080);
    expect(topBarClick.inside).toBe(false);
    expect(topBarClick.y).toBe(0);

    // Click in bottom black bar
    const bottomBarClick = normalizeCoordinates(350, 620, canvas, 1920, 1080);
    expect(bottomBarClick.inside).toBe(false);
    expect(bottomBarClick.y).toBe(1);

    // Click in active area
    const activeClick = normalizeCoordinates(350, 50 + 131.25 + 168.75, canvas, 1920, 1080);
    expect(activeClick.inside).toBe(true);
    expect(activeClick.x).toBeCloseTo(0.5, 2);
    expect(activeClick.y).toBeCloseTo(0.5, 2);
  });

  it("clamps dragged coordinates strictly between 0.0 and 1.0", () => {
    const canvas = createMockCanvas(500, 1000, 0, 0);

    const farLeftTop = normalizeCoordinates(-500, -500, canvas, 1080, 2160);
    expect(farLeftTop.x).toBe(0);
    expect(farLeftTop.y).toBe(0);
    expect(farLeftTop.inside).toBe(false);

    const farRightBottom = normalizeCoordinates(5000, 5000, canvas, 1080, 2160);
    expect(farRightBottom.x).toBe(1);
    expect(farRightBottom.y).toBe(1);
    expect(farRightBottom.inside).toBe(false);
  });
});

describe("useMirrorInput - Android Keycodes & Special Key Mapping", () => {
  it("contains valid standard Android keycodes", () => {
    expect(ANDROID_KEYCODES.HOME).toBe(3);
    expect(ANDROID_KEYCODES.BACK).toBe(4);
    expect(ANDROID_KEYCODES.DPAD_UP).toBe(19);
    expect(ANDROID_KEYCODES.DPAD_DOWN).toBe(20);
    expect(ANDROID_KEYCODES.DPAD_LEFT).toBe(21);
    expect(ANDROID_KEYCODES.DPAD_RIGHT).toBe(22);
    expect(ANDROID_KEYCODES.VOLUME_UP).toBe(24);
    expect(ANDROID_KEYCODES.VOLUME_DOWN).toBe(25);
    expect(ANDROID_KEYCODES.POWER).toBe(26);
    expect(ANDROID_KEYCODES.TAB).toBe(61);
    expect(ANDROID_KEYCODES.SPACE).toBe(62);
    expect(ANDROID_KEYCODES.ENTER).toBe(66);
    expect(ANDROID_KEYCODES.DEL).toBe(67);
    expect(ANDROID_KEYCODES.PAGE_UP).toBe(92);
    expect(ANDROID_KEYCODES.PAGE_DOWN).toBe(93);
    expect(ANDROID_KEYCODES.ESCAPE).toBe(111);
    expect(ANDROID_KEYCODES.FORWARD_DEL).toBe(112);
    expect(ANDROID_KEYCODES.APP_SWITCH).toBe(187);
  });

  it("maps DOM keys to correct Android special keycodes", () => {
    expect(SPECIAL_KEY_MAP["Enter"]).toBe(66);
    expect(SPECIAL_KEY_MAP["Backspace"]).toBe(67);
    expect(SPECIAL_KEY_MAP["Delete"]).toBe(112);
    expect(SPECIAL_KEY_MAP["ArrowUp"]).toBe(19);
    expect(SPECIAL_KEY_MAP["ArrowDown"]).toBe(20);
    expect(SPECIAL_KEY_MAP["ArrowLeft"]).toBe(21);
    expect(SPECIAL_KEY_MAP["ArrowRight"]).toBe(22);
    expect(SPECIAL_KEY_MAP["Tab"]).toBe(61);
    expect(SPECIAL_KEY_MAP["Escape"]).toBe(4); // Android Back
    expect(SPECIAL_KEY_MAP["PageUp"]).toBe(92);
    expect(SPECIAL_KEY_MAP["PageDown"]).toBe(93);
  });
});

describe("useMirrorInput - Wheel Tick & Accumulator Logic", () => {
  it("converts continuous trackpad and mouse wheel deltas to bounded scrcpy scroll ticks", () => {
    // Small sub-threshold delta (e.g. Mac trackpad tiny movement)
    const acc1 = { x: 5, y: 12 };
    const r1 = computeScrollTicks(acc1);
    expect(r1).toEqual({ dx: 0, dy: 0 });
    expect(acc1).toEqual({ x: 5, y: 12 }); // Retains sub-pixel remainder

    // Accumulated to exceed threshold
    acc1.y += 15; // Total y = 27
    const r2 = computeScrollTicks(acc1);
    expect(r2).toEqual({ dx: 0, dy: -1 }); // 1 tick downward
    expect(acc1.y).toBe(7); // 27 - 20 = 7

    // Large fast scroll wheel tick (e.g. deltaY = 120 on notched mouse)
    const acc2 = { x: 0, y: 120 };
    const r3 = computeScrollTicks(acc2);
    expect(r3).toEqual({ dx: 0, dy: -6 }); // 120 / 20 = 6 ticks
    expect(acc2.y).toBe(0);

    // Extreme delta clamped to scrcpy maximum of 16
    const acc3 = { x: 0, y: 5000 };
    const r4 = computeScrollTicks(acc3);
    expect(r4.dy).toBe(-16);
  });
});

describe("useMirrorInput - Host Modifier Collision Prevention", () => {
  it("identifies host modifier shortcuts to prevent injecting rogue characters", () => {
    // Cmd+W (close window), Cmd+Q (quit), Cmd+R (reload), Cmd+, (settings), Cmd+C (copy)
    expect(classifyKeyEvent({ key: "w", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }).isHostShortcut).toBe(true);
    expect(classifyKeyEvent({ key: "q", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }).isHostShortcut).toBe(true);
    expect(classifyKeyEvent({ key: "r", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }).isHostShortcut).toBe(true);
    expect(classifyKeyEvent({ key: ",", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }).isHostShortcut).toBe(true);
    expect(classifyKeyEvent({ key: "c", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }).isHostShortcut).toBe(true);
    expect(classifyKeyEvent({ key: "Tab", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }).isHostShortcut).toBe(true);

    // Ctrl+C, Ctrl+R, Ctrl+Tab on Linux/Windows
    expect(classifyKeyEvent({ key: "c", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }).isHostShortcut).toBe(true);
    expect(classifyKeyEvent({ key: "Tab", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }).isHostShortcut).toBe(true);

    // Cmd+V / Ctrl+V correctly identified as paste
    expect(classifyKeyEvent({ key: "v", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }).isPaste).toBe(true);
    expect(classifyKeyEvent({ key: "v", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }).isPaste).toBe(true);

    // Alt+B, Alt+H, Alt+R, Alt+P, Alt+ArrowUp, Alt+ArrowDown identified as navigation
    expect(classifyKeyEvent({ key: "b", ctrlKey: false, metaKey: false, altKey: true, shiftKey: false }).isNavShortcut).toBe(true);
    expect(classifyKeyEvent({ key: "h", ctrlKey: false, metaKey: false, altKey: true, shiftKey: false }).isNavShortcut).toBe(true);
    expect(classifyKeyEvent({ key: "r", ctrlKey: false, metaKey: false, altKey: true, shiftKey: false }).isNavShortcut).toBe(true);
    expect(classifyKeyEvent({ key: "p", ctrlKey: false, metaKey: false, altKey: true, shiftKey: false }).isNavShortcut).toBe(true);
    expect(classifyKeyEvent({ key: "ArrowUp", ctrlKey: false, metaKey: false, altKey: true, shiftKey: false }).isNavShortcut).toBe(true);
    expect(classifyKeyEvent({ key: "ArrowDown", ctrlKey: false, metaKey: false, altKey: true, shiftKey: false }).isNavShortcut).toBe(true);

    // Standard character typing (no modifiers)
    const normalKey = classifyKeyEvent({ key: "a", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
    expect(normalKey.isHostShortcut).toBe(false);
    expect(normalKey.isPaste).toBe(false);
    expect(normalKey.isNavShortcut).toBe(false);
  });
});

