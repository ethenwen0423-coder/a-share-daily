import pandas as pd
import pytest

from app.schemas.strategy import Condition, RuleGroup
from app.strategies.rules import evaluate_condition, evaluate_group


def test_cross_above_and_below_definition():
    previous = pd.Series({"a": 1.0, "b": 1.0})
    current_up = pd.Series({"a": 2.0, "b": 1.0})
    assert evaluate_condition(current_up, previous, Condition(left="a", comparison="cross_above", right="b"))
    previous_down = pd.Series({"a": 2.0, "b": 2.0})
    current_down = pd.Series({"a": 1.0, "b": 2.0})
    assert evaluate_condition(current_down, previous_down, Condition(left="a", comparison="cross_below", right="b"))


def test_and_or_group():
    row = pd.Series({"x": 10.0})
    and_group = RuleGroup(operator="and", conditions=[Condition(left="x", comparison="greater_than", right=5), Condition(left="x", comparison="less_than", right=20)])
    assert evaluate_group(row, None, and_group)
    or_group = RuleGroup(operator="or", conditions=[Condition(left="x", comparison="less_than", right=5), Condition(left="x", comparison="equal", right=10)])
    assert evaluate_group(row, None, or_group)


def test_missing_field_is_rejected():
    with pytest.raises(ValueError, match="不存在的字段"):
        evaluate_condition(pd.Series({"x": 1}), None, Condition(left="bad", comparison="greater_than", right=0))
