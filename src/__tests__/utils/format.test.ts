import { formatPct } from "../../utils/format";

describe("formatPct", () => {
    it("formats a whole percentage without a decimal", () => {
        expect(formatPct(0.85)).toBe("85%");
    });

    it("keeps one decimal for fractional percentages", () => {
        expect(formatPct(0.125)).toBe("12.5%");
    });

    it("formats zero as 0%", () => {
        expect(formatPct(0)).toBe("0%");
    });

    it("formats a full life list as 100%", () => {
        expect(formatPct(1)).toBe("100%");
    });

    it("preserves the sign on negative deltas", () => {
        expect(formatPct(-0.05)).toBe("-5%");
    });

    it("rounds to one decimal place", () => {
        // 0.8567 → 85.67 → 85.7
        expect(formatPct(0.8567)).toBe("85.7%");
    });

    it("treats a tiny life-list fraction sensibly", () => {
        // 2 of 500 species → 0.4%
        expect(formatPct(0.004)).toBe("0.4%");
    });
});
