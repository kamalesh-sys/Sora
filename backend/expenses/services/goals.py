from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP, ROUND_UP

from django.db.models import Sum
from django.utils import timezone


MONEY_QUANTUM = Decimal("0.01")
PERCENT_QUANTUM = Decimal("0.01")


GOAL_TEMPLATES = (
    {
        "key": "emergency_fund",
        "name": "Emergency fund",
        "description": "Build a calm buffer for life's surprises.",
        "icon": "shield-check",
        "color": "#2E7D5B",
        "suggested_months": 6,
    },
    {
        "key": "travel",
        "name": "Travel",
        "description": "Save for a trip without disturbing everyday money.",
        "icon": "plane",
        "color": "#276EF1",
        "suggested_months": 8,
    },
    {
        "key": "education",
        "name": "Education",
        "description": "Plan ahead for courses, fees, or learning tools.",
        "icon": "graduation-cap",
        "color": "#7A5AF8",
        "suggested_months": 12,
    },
    {
        "key": "home_upgrade",
        "name": "Home upgrade",
        "description": "Make room for repairs, furniture, or a refresh.",
        "icon": "home",
        "color": "#B54708",
        "suggested_months": 10,
    },
    {
        "key": "vehicle",
        "name": "Vehicle",
        "description": "Prepare for a two-wheeler, car, or major service.",
        "icon": "car",
        "color": "#344054",
        "suggested_months": 18,
    },
    {
        "key": "celebration",
        "name": "Celebration",
        "description": "Set aside money for a wedding or family occasion.",
        "icon": "sparkles",
        "color": "#C11574",
        "suggested_months": 12,
    },
    {
        "key": "gadget",
        "name": "Gadget",
        "description": "Save steadily for a phone, laptop, or appliance.",
        "icon": "smartphone",
        "color": "#087E8B",
        "suggested_months": 6,
    },
    {
        "key": "custom",
        "name": "Something else",
        "description": "Create a goal around what matters to you.",
        "icon": "target",
        "color": "#5B6472",
        "suggested_months": 6,
    },
)

GOAL_TEMPLATE_KEYS = frozenset(template["key"] for template in GOAL_TEMPLATES)


def money(value):
    return Decimal(value).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def month_start(value):
    return value.replace(day=1)


def next_month(value):
    value = month_start(value)
    if value.month == 12:
        return date(value.year + 1, 1, 1)
    return date(value.year, value.month + 1, 1)


def months_between(start, end):
    """Return month starts in the inclusive date range."""
    current = month_start(start)
    last = month_start(end)
    months = []
    while current <= last:
        months.append(current)
        current = next_month(current)
    return months


@dataclass(frozen=True)
class GoalMetrics:
    saved_amount: Decimal
    remaining_amount: Decimal
    progress_percent: Decimal
    required_monthly_contribution: Decimal
    remaining_month_count: int
    expected_saved_amount: Decimal
    shortfall_amount: Decimal
    health_status: str
    can_skip_current_month: bool


def calculate_goal_metrics(
    *,
    target_amount,
    target_date,
    start_date,
    saved_amount,
    skipped_months=(),
    status="active",
    as_of,
):
    """Calculate a goal schedule using only Decimal and date values.

    The current month remains available until the target day. Only fully
    elapsed months count toward expected savings, which prevents a newly
    created goal from being labelled at risk immediately.
    """
    target = money(target_amount)
    if target <= 0:
        raise ValueError("Target amount must be positive.")
    saved = money(saved_amount)
    remaining = money(max(target - saved, Decimal("0.00")))
    progress = min((saved / target) * Decimal("100"), Decimal("100"))
    progress = progress.quantize(PERCENT_QUANTUM, rounding=ROUND_HALF_UP)

    current_month = month_start(as_of)
    skipped = {month_start(value) for value in skipped_months}
    schedule = [
        month
        for month in months_between(start_date, target_date)
        if month not in skipped
    ]
    elapsed_months = [month for month in schedule if month < current_month]
    remaining_months = [] if as_of > target_date else [
        month for month in schedule if month >= current_month
    ]

    if as_of > target_date:
        expected = target
    elif schedule:
        expected = money(
            (target * Decimal(len(elapsed_months))) / Decimal(len(schedule))
        )
    else:
        expected = Decimal("0.00")

    shortfall = money(max(expected - saved, Decimal("0.00")))
    remaining_month_count = len(remaining_months)
    if remaining == 0:
        required_monthly = Decimal("0.00")
    elif remaining_month_count:
        required_monthly = (remaining / Decimal(remaining_month_count)).quantize(
            MONEY_QUANTUM,
            rounding=ROUND_UP,
        )
    else:
        required_monthly = remaining

    is_completed = status == "completed" or remaining == 0
    if is_completed:
        health_status = "completed"
    elif target_date < as_of:
        health_status = "overdue"
    elif shortfall > 0:
        health_status = "at_risk"
    else:
        health_status = "on_track"

    can_skip_current_month = bool(
        not is_completed
        and as_of <= target_date
        and current_month in remaining_months
        and remaining_month_count > 1
    )

    return GoalMetrics(
        saved_amount=saved,
        remaining_amount=remaining,
        progress_percent=progress,
        required_monthly_contribution=required_monthly,
        remaining_month_count=remaining_month_count,
        expected_saved_amount=expected,
        shortfall_amount=shortfall,
        health_status=health_status,
        can_skip_current_month=can_skip_current_month,
    )


def _goal_saved_amount(goal):
    prefetched = getattr(goal, "_prefetched_objects_cache", {}).get("contributions")
    if prefetched is not None:
        return sum((item.amount for item in prefetched), Decimal("0.00"))
    return goal.contributions.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")


def _goal_skipped_months(goal):
    prefetched = getattr(goal, "_prefetched_objects_cache", {}).get("skipped_months")
    if prefetched is not None:
        return [item.month for item in prefetched]
    return list(goal.skipped_months.values_list("month", flat=True))


def get_goal_metrics(goal, as_of=None):
    as_of = as_of or timezone.localdate()
    cache = getattr(goal, "_goal_metrics_cache", None)
    if cache and as_of in cache:
        return cache[as_of]

    created_date = timezone.localtime(goal.created_at).date()
    metrics = calculate_goal_metrics(
        target_amount=goal.target_amount,
        target_date=goal.target_date,
        start_date=created_date,
        saved_amount=_goal_saved_amount(goal),
        skipped_months=_goal_skipped_months(goal),
        status=goal.status,
        as_of=as_of,
    )
    if cache is None:
        cache = {}
        goal._goal_metrics_cache = cache
    cache[as_of] = metrics
    return metrics


def synchronize_goal_completion(goal):
    """Keep persisted completion state aligned with contributions and target."""
    saved_amount = money(
        goal.contributions.aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )
    should_be_completed = saved_amount >= money(goal.target_amount)
    was_completed = goal.status == goal.Status.COMPLETED

    if should_be_completed and not was_completed:
        goal.status = goal.Status.COMPLETED
        goal.completed_at = timezone.now()
        goal.updated_at = timezone.now()
        type(goal).objects.filter(pk=goal.pk).update(
            status=goal.status,
            completed_at=goal.completed_at,
            updated_at=goal.updated_at,
        )
    elif should_be_completed and goal.completed_at is None:
        goal.completed_at = timezone.now()
        goal.updated_at = timezone.now()
        type(goal).objects.filter(pk=goal.pk).update(
            completed_at=goal.completed_at,
            updated_at=goal.updated_at,
        )
    elif not should_be_completed and was_completed:
        goal.status = goal.Status.ACTIVE
        goal.completed_at = None
        goal.updated_at = timezone.now()
        type(goal).objects.filter(pk=goal.pk).update(
            status=goal.status,
            completed_at=None,
            updated_at=goal.updated_at,
        )

    goal._goal_metrics_cache = {}
    return not was_completed and should_be_completed
