"""Tests for the difficulty scoring and deck building service."""

import pytest

from app.models.bird import BirdSummary
from app.services.difficulty_service import (
    build_deck,
    compute_difficulty_scores,
    filter_by_difficulty,
)


def _make_bird(code: str, freq: float = 0.5, lookalikes: int = 0) -> BirdSummary:
    """Create a minimal BirdSummary for testing."""
    return BirdSummary(
        id=code,
        species_code=code,
        sci_name=f"Sciurus {code}",
        com_name=f"Bird {code}",
        family_code="famA",
        family_com_name="Family A",
        image_url="https://example.com/img.jpg",
        global_frequency=freq,
        lookalike_count=lookalikes,
    )


class TestDifficultyScoring:
    def test_empty_input(self):
        assert compute_difficulty_scores([]) == {}

    def test_rare_birds_score_higher(self):
        common = _make_bird("common", freq=0.9)
        rare = _make_bird("rare", freq=0.1)
        scores = compute_difficulty_scores([common, rare])
        assert scores["rare"] > scores["common"]

    def test_more_lookalikes_increases_difficulty(self):
        few = _make_bird("few", freq=0.5, lookalikes=0)
        many = _make_bird("many", freq=0.5, lookalikes=8)
        scores = compute_difficulty_scores([few, many])
        assert scores["many"] > scores["few"]

    def test_regional_freq_overrides_global(self):
        bird = _make_bird("b1", freq=0.1)  # globally rare
        regional = {"b1": 0.9}  # regionally common
        scores = compute_difficulty_scores([bird], regional_freq=regional)
        # Should use regional freq (common) → low difficulty
        assert scores["b1"] < 0.5

    def test_scores_bounded_0_to_1(self):
        birds = [
            _make_bird("a", freq=0.0, lookalikes=15),  # maximum difficulty
            _make_bird("b", freq=1.0, lookalikes=0),  # minimum difficulty
        ]
        scores = compute_difficulty_scores(birds)
        for code, score in scores.items():
            assert 0.0 <= score <= 1.0, f"{code} score out of range: {score}"


class TestFilterByDifficulty:
    def _make_pool(self, n=12):
        return [_make_bird(f"b{i}", freq=i / n) for i in range(n)]

    def test_easy_returns_common_birds(self):
        pool = self._make_pool()
        result = filter_by_difficulty(pool, "easy")
        # Easy = bottom third = highest frequency = lowest difficulty
        codes = {b.species_code for b in result}
        # Should include the most common birds (high freq = low difficulty)
        assert "b11" in codes or "b10" in codes or "b9" in codes

    def test_hard_returns_rare_birds(self):
        pool = self._make_pool()
        result = filter_by_difficulty(pool, "hard")
        codes = {b.species_code for b in result}
        # Should include the rarest birds (low freq = high difficulty)
        assert "b0" in codes or "b1" in codes or "b2" in codes

    def test_few_birds_returns_all(self):
        pool = [_make_bird("only1", freq=0.5)]
        result = filter_by_difficulty(pool, "hard")
        assert len(result) == 1


class TestBuildDeck:
    def test_build_deck_limits_size(self):
        birds = [_make_bird(f"b{i}") for i in range(50)]
        deck = build_deck(birds, limit=10)
        assert len(deck) == 10

    def test_build_deck_with_difficulty(self):
        birds = [_make_bird(f"b{i}", freq=i / 20) for i in range(20)]
        deck = build_deck(birds, limit=5, difficulty="easy")
        assert len(deck) <= 5

    def test_build_deck_empty_input(self):
        deck = build_deck([], limit=10)
        assert deck == []

    def test_build_deck_shuffles(self):
        """Run multiple times — at least one should differ from sorted order."""
        birds = [_make_bird(f"b{i}") for i in range(20)]
        orders = set()
        for _ in range(10):
            deck = build_deck(birds, limit=20)
            orders.add(tuple(b.species_code for b in deck))
        # With 20 birds, chance of all 10 being identical is negligible
        assert len(orders) > 1
