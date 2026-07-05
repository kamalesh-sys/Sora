from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from expenses.models import Expense, ExpenseShare, HouseholdMember, Person
from expenses.services.privacy import can_create_household_expense, can_edit_expense, can_view_expense, can_view_person
from expenses.services.splits import calculate_splits, money


User = get_user_model()


def recalculate_expense_share_status(share):
    if share.status == ExpenseShare.Status.WAIVED:
        return share
    if share.paid_amount == 0:
        share.status = ExpenseShare.Status.PENDING
    elif share.paid_amount < share.share_amount:
        share.status = ExpenseShare.Status.PARTIALLY_PAID
    else:
        share.status = ExpenseShare.Status.SETTLED
    share.save(update_fields=["status", "updated_at"])
    return share


def get_expense_balance(expense):
    shares = expense.shares.all()
    total_share_amount = sum((share.share_amount for share in shares), Decimal("0.00"))
    settled_amount = sum((share.paid_amount for share in shares), Decimal("0.00"))
    pending_amount = total_share_amount - settled_amount

    if not shares:
        status = "not_shared"
    elif pending_amount == 0:
        status = "settled"
    elif settled_amount > 0:
        status = "partially_paid"
    else:
        status = "pending"

    return {
        "total_share_amount": str(money(total_share_amount)),
        "settled_amount": str(money(settled_amount)),
        "pending_amount": str(money(pending_amount)),
        "status": status,
    }


def _validate_household_expense(user, expense_data):
    household = expense_data.get("household")
    expense_type = expense_data.get("expense_type") or Expense.ExpenseType.PERSONAL
    if household:
        if not can_create_household_expense(user, household):
            raise serializers.ValidationError("Viewer cannot create household expenses.")
        expense_data["visibility"] = Expense.Visibility.HOUSEHOLD
        expense_data["expense_type"] = Expense.ExpenseType.HOUSEHOLD
    elif expense_type == Expense.ExpenseType.HOUSEHOLD:
        raise serializers.ValidationError("Household expense requires a household.")


def _apply_defaults(user, expense_data):
    expense_data.setdefault("user", user)
    expense_data.setdefault("created_by", user)
    if not expense_data.get("paid_by_user") and not expense_data.get("paid_by_person"):
        expense_data["paid_by_user"] = user
    expense_data.setdefault("visibility", Expense.Visibility.PRIVATE)
    expense_data.setdefault("expense_type", Expense.ExpenseType.PERSONAL)
    return expense_data


def create_expense_share(expense, data):
    share = ExpenseShare.objects.create(expense=expense, **data)
    return share


def _resolve_participant(row):
    payload = dict(row)
    lookups = [
        ("user", "user_id", User),
        ("person", "person_id", Person),
        ("household_member", "household_member_id", HouseholdMember),
    ]
    for object_key, id_key, model in lookups:
        raw_value = payload.pop(id_key, None)
        if raw_value is not None and object_key not in payload:
            payload[object_key] = raw_value
        value = payload.get(object_key)
        if value is None or hasattr(value, "_meta"):
            continue
        try:
            payload[object_key] = model.objects.get(pk=value)
        except model.DoesNotExist as exc:
            raise serializers.ValidationError(f"{object_key} does not exist.") from exc
    return payload


def _validate_share_participant(user, expense, row):
    if row.get("person") and not can_view_person(user, row["person"]):
        raise serializers.ValidationError("You do not have access to this person.")
    if row.get("household_member"):
        member = row["household_member"]
        if expense.household_id and member.household_id != expense.household_id:
            raise serializers.ValidationError("Household member is not part of this household.")
        if not expense.household_id:
            raise serializers.ValidationError("Household member can only be used for household expenses.")


@transaction.atomic
def create_expense_with_shares(user, validated_data, shares_data=None, split_type=None):
    expense_data = dict(validated_data)
    shares_data = shares_data or []
    _apply_defaults(user, expense_data)
    _validate_household_expense(user, expense_data)

    if expense_data["expense_type"] == Expense.ExpenseType.PERSONAL:
        expense_data["visibility"] = Expense.Visibility.PRIVATE
        expense_data["household"] = None

    if expense_data["expense_type"] in {Expense.ExpenseType.SHARED, Expense.ExpenseType.HOUSEHOLD}:
        if not expense_data.get("paid_by_user") and not expense_data.get("paid_by_person"):
            expense_data["paid_by_user"] = user

    expense = Expense.objects.create(**expense_data)

    if shares_data:
        resolved_participants = [_resolve_participant(row) for row in shares_data]
        for row in resolved_participants:
            _validate_share_participant(user, expense, row)
        calculated_rows = calculate_splits(expense.amount, resolved_participants, split_type or "equal")
        total = sum((row["share_amount"] for row in calculated_rows), Decimal("0.00"))
        if money(total) != money(expense.amount):
            raise serializers.ValidationError("Share total must equal expense amount.")
        for row in calculated_rows:
            create_expense_share(expense, row)

    return expense


@transaction.atomic
def update_expense_shares(user, expense, shares_data, split_type=None):
    if not can_edit_expense(user, expense):
        raise serializers.ValidationError("You do not have access to edit this expense.")
    resolved_participants = [_resolve_participant(row) for row in shares_data]
    for row in resolved_participants:
        _validate_share_participant(user, expense, row)
    calculated_rows = calculate_splits(expense.amount, resolved_participants, split_type or "equal")
    total = sum((row["share_amount"] for row in calculated_rows), Decimal("0.00"))
    if money(total) != money(expense.amount):
        raise serializers.ValidationError("Share total must equal expense amount.")
    expense.shares.all().delete()
    for row in calculated_rows:
        create_expense_share(expense, row)
    return expense


def ensure_can_view_expense(user, expense):
    if not can_view_expense(user, expense):
        raise serializers.ValidationError("You do not have access to this expense.")
    return expense
