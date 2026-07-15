from __future__ import annotations

import math

import pandas as pd

from app.schemas.strategy import Condition, RuleGroup


def _value(row: pd.Series, operand: str | float | int) -> float:
    if isinstance(operand, (float, int)):
        return float(operand)
    if operand not in row.index:
        raise ValueError(f"策略引用了不存在的字段: {operand}")
    value = row[operand]
    return float(value) if pd.notna(value) else math.nan


def evaluate_condition(current: pd.Series, previous: pd.Series | None, condition: Condition) -> bool:
    left = _value(current, condition.left)
    right = _value(current, condition.right)
    if math.isnan(left) or math.isnan(right):
        return False
    if condition.comparison == "greater_than":
        return left > right
    if condition.comparison == "greater_or_equal":
        return left >= right
    if condition.comparison == "less_than":
        return left < right
    if condition.comparison == "less_or_equal":
        return left <= right
    if condition.comparison == "equal":
        return math.isclose(left, right, rel_tol=1e-9, abs_tol=1e-12)
    if condition.comparison == "not_equal":
        return not math.isclose(left, right, rel_tol=1e-9, abs_tol=1e-12)
    if previous is None:
        return False
    prev_left = _value(previous, condition.left)
    prev_right = _value(previous, condition.right)
    if math.isnan(prev_left) or math.isnan(prev_right):
        return False
    if condition.comparison == "cross_above":
        return prev_left <= prev_right and left > right
    if condition.comparison == "cross_below":
        return prev_left >= prev_right and left < right
    raise ValueError(f"不支持的比较方式: {condition.comparison}")


def evaluate_group(current: pd.Series, previous: pd.Series | None, group: RuleGroup) -> bool:
    values = [evaluate_condition(current, previous, condition) for condition in group.conditions]
    return all(values) if group.operator == "and" else any(values)
