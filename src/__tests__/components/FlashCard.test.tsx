/**
 * Tests for FlashCard — flip logic, accessibility, and rendering states.
 */

import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import FlashCard from "../../components/FlashCard";

// Mock expo-image with a simple img
jest.mock("expo-image", () => ({
    Image: (props: any) => <img data-testid="mock-image" src={props.source} alt="" />,
}));

const defaultProps = {
    imageUrl: "https://example.com/bird.jpg",
    commonName: "Northern Cardinal",
    latinName: "Cardinalis cardinalis",
    speciesCode: "norcar",
    cardWidth: 300,
};

describe("FlashCard", () => {
    describe("rendering", () => {
        it("renders without crashing", () => {
            const { container } = render(<FlashCard {...defaultProps} />);
            expect(container.querySelector('[role="button"]')).toBeInTheDocument();
        });

        it("shows the bird name after flip", () => {
            render(<FlashCard {...defaultProps} />);
            const card = screen.getByRole("button", { name: /Bird identification card/ });
            fireEvent.click(card); // flip to back
            // After flip, accessibility label includes bird name
            expect(screen.getByRole("button", { name: /Northern Cardinal/ })).toBeInTheDocument();
        });

        it("renders deck position badge when provided", () => {
            const { container } = render(
                <FlashCard {...defaultProps} deckPosition={{ idx: 3, deckSize: 10 }} />,
            );
            expect(container.textContent).toContain("3/10");
        });
    });

    describe("flip logic", () => {
        it("starts showing the front (unflipped) state", () => {
            render(<FlashCard {...defaultProps} />);
            expect(screen.getByRole("button", { name: /Bird identification card/ })).toBeInTheDocument();
        });

        it("flips on press — accessibility label changes", () => {
            render(<FlashCard {...defaultProps} />);
            const card = screen.getByRole("button", { name: /Bird identification card/ });
            fireEvent.click(card);
            expect(screen.getByRole("button", { name: /Northern Cardinal/ })).toBeInTheDocument();
        });

        it("flips back on second press", () => {
            render(<FlashCard {...defaultProps} />);
            const card = screen.getByRole("button", { name: /Bird identification card/ });
            fireEvent.click(card); // flip
            const flippedCard = screen.getByRole("button", { name: /Northern Cardinal/ });
            fireEvent.click(flippedCard); // flip back
            expect(screen.getByRole("button", { name: /Bird identification card/ })).toBeInTheDocument();
        });
    });

    describe("accessibility", () => {
        it("Ask AI button has accessibility label", () => {
            render(<FlashCard {...defaultProps} onAskAI={jest.fn()} />);
            expect(screen.getByRole("button", { name: /Ask AI about Northern Cardinal/ })).toBeInTheDocument();
        });

        it("Info button has accessibility label", () => {
            render(<FlashCard {...defaultProps} onInfoPress={jest.fn()} />);
            expect(screen.getByRole("button", { name: /Wikipedia.*Northern Cardinal/i })).toBeInTheDocument();
        });
    });

    describe("callbacks", () => {
        it("calls onAskAI when Ask AI button is pressed", () => {
            const mockAskAI = jest.fn();
            render(<FlashCard {...defaultProps} onAskAI={mockAskAI} />);
            fireEvent.click(screen.getByRole("button", { name: /Ask AI/ }));
            expect(mockAskAI).toHaveBeenCalledTimes(1);
        });

        it("calls onInfoPress when info button is pressed", () => {
            const mockInfo = jest.fn();
            render(<FlashCard {...defaultProps} onInfoPress={mockInfo} />);
            fireEvent.click(screen.getByRole("button", { name: /Wikipedia/ }));
            expect(mockInfo).toHaveBeenCalledTimes(1);
        });
    });
});
