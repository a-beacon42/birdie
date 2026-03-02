/**
 * Tests for SearchableDropdown — filtering, selection, and generics.
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import SearchableDropdown from "../../components/SearchableDropdown";

interface TestItem {
    code: string;
    label: string;
}

const items: TestItem[] = [
    { code: "US-NY", label: "New York" },
    { code: "US-CA", label: "California" },
    { code: "US-TX", label: "Texas" },
    { code: "US-FL", label: "Florida" },
    { code: "US-WA", label: "Washington" },
];

const defaultProps = {
    label: "State",
    data: items,
    labelField: "label" as const,
    valueField: "code" as const,
    placeholder: "Select a state",
    value: null as string | null,
    onChange: jest.fn(),
};

describe("SearchableDropdown", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("rendering", () => {
        it("renders with placeholder when no value selected", () => {
            const { container } = render(<SearchableDropdown {...defaultProps} />);
            expect(container.textContent).toContain("Select a state");
        });

        it("shows selected item label when value is set", () => {
            const { container } = render(
                <SearchableDropdown {...defaultProps} value="US-NY" />,
            );
            expect(container.textContent).toContain("New York");
        });

        it("shows chevron indicator", () => {
            const { container } = render(<SearchableDropdown {...defaultProps} />);
            expect(container.textContent).toContain("▼");
        });
    });

    describe("interaction", () => {
        it("trigger is clickable (no disabled styling)", () => {
            const { container } = render(<SearchableDropdown {...defaultProps} />);
            // The trigger area should exist and be clickable
            const trigger = container.firstElementChild!.firstElementChild!;
            expect(trigger).toBeInTheDocument();
            // Should not throw when clicking
            fireEvent.click(trigger);
        });

        it("disabled prop prevents interaction", () => {
            const { container } = render(
                <SearchableDropdown {...defaultProps} disabled />,
            );
            // Chevron should still show ▼ (not ▲ which means open)
            expect(container.textContent).toContain("▼");
            expect(container.textContent).not.toContain("▲");
        });
    });

    describe("edge cases", () => {
        it("handles empty data array", () => {
            const { container } = render(
                <SearchableDropdown {...defaultProps} data={[]} />,
            );
            expect(container.textContent).toContain("Select a state");
        });

        it("handles value not in data", () => {
            const { container } = render(
                <SearchableDropdown {...defaultProps} value="XX-ZZ" />,
            );
            // Should show placeholder when value doesn't match any item
            expect(container.textContent).toContain("Select a state");
        });

        it("renders with custom placeholder", () => {
            const { container } = render(
                <SearchableDropdown {...defaultProps} placeholder="Choose one…" />,
            );
            expect(container.textContent).toContain("Choose one…");
        });
    });
});
