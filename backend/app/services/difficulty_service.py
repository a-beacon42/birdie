"""Difficulty scoring and deck filtering service.

Computes a composite difficulty score per bird based on:
  - Rarity (70% weight): how uncommon the species is — uses regional
    frequency when available, else falls back to global_frequency.
  - Lookalikes (30% weight): how many similar-looking species exist —
    more lookalikes = harder to distinguish.

Difficulty tiers split the scored bird pool into equal-ish thirds:
  - Easy:   bottom 33% of difficulty (most common, few lookalikes)
  - Medium: middle 33%
  - Hard:   top 33% (rarest, most lookalikes)
"""

from __future__ import annotations

import random
from typing import Literal

from app.models.bird import BirdSummary

Difficulty = Literal["easy", "medium", "hard"]

# Relative weights for composite score
_RARITY_WEIGHT = 0.70
_LOOKALIKE_WEIGHT = 0.30

# Normalize lookalike count — cap at this value to avoid outliers dominating
_MAX_LOOKALIKES = 10


def compute_difficulty_scores(
    birds: list[BirdSummary],
    regional_freq: dict[str, float] | None = None,
) -> dict[str, float]:
    """Compute a 0.0–1.0 difficulty score for each bird.

    Args:
        birds: List of bird summaries to score.
        regional_freq: Optional mapping of species_code → regional frequency
                       (0.0–1.0 where 1.0 = most reported in region).
                       When provided, overrides global_frequency for rarity.

    Returns:
        Dict mapping species_code → difficulty score (0.0 = easiest, 1.0 = hardest).
    """
    if not birds:
        return {}

    scores: dict[str, float] = {}

    for bird in birds:
        # Rarity component: invert frequency so rare = higher score
        if regional_freq and bird.species_code in regional_freq:
            freq = regional_freq[bird.species_code]
        else:
            freq = bird.global_frequency

        rarity_score = 1.0 - freq  # 0.0 = very common, 1.0 = very rare

        # Lookalike component: more lookalikes = harder
        lookalike_norm = min(bird.lookalike_count, _MAX_LOOKALIKES) / _MAX_LOOKALIKES

        # Composite
        raw = (_RARITY_WEIGHT * rarity_score) + (_LOOKALIKE_WEIGHT * lookalike_norm)
        scores[bird.species_code] = round(raw, 4)

    return scores


def filter_by_difficulty(
    birds: list[BirdSummary],
    difficulty: Difficulty,
    regional_freq: dict[str, float] | None = None,
) -> list[BirdSummary]:
    """Filter birds to a difficulty tier and return them in random order.

    The birds are scored, sorted by difficulty, then split into thirds.
    The requested tier's third is returned, shuffled.

    If there are fewer than 3 birds, all are returned regardless of tier.
    """
    if len(birds) < 3:
        return birds

    scores = compute_difficulty_scores(birds, regional_freq)

    # Sort by difficulty score ascending (easiest first)
    ranked = sorted(birds, key=lambda b: scores.get(b.species_code, 0.5))

    n = len(ranked)
    third = n // 3

    if difficulty == "easy":
        pool = ranked[:third] if third > 0 else ranked[:1]
    elif difficulty == "hard":
        pool = ranked[-third:] if third > 0 else ranked[-1:]
    else:  # medium
        pool = ranked[third : n - third] if third > 0 else ranked

    random.shuffle(pool)
    return pool


def build_deck(
    birds: list[BirdSummary],
    limit: int,
    difficulty: Difficulty | None = None,
    regional_freq: dict[str, float] | None = None,
) -> list[BirdSummary]:
    """Build a shuffled game deck with optional difficulty filtering.

    Args:
        birds: Full pool of candidate birds (already filtered by family/region).
        limit: Maximum number of birds in the deck.
        difficulty: Optional difficulty tier. If None, no difficulty filtering.
        regional_freq: Optional regional frequency data for scoring.

    Returns:
        A shuffled list of up to `limit` birds.
    """
    if difficulty:
        pool = filter_by_difficulty(birds, difficulty, regional_freq)
    else:
        pool = list(birds)
        random.shuffle(pool)

    return pool[:limit]
