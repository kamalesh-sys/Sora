from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from rest_framework import serializers

from expenses.models import ExpenseShare, Household, Settlement
from expenses.services.privacy import can_view_expense, can_view_household, can_view_person


def _pending_amount(share):
    return share.share_amount - share.paid_amount


def _infer_settlement_parties(data):
    share = data.get("expense_share")
    if not share:
        return data

    expense = share.expense
    data.setdefault("expense", expense)
    if not data.get("from_user") and not data.get("from_person"):
        data["from_user"] = share.user
        data["from_person"] = share.person
    if not data.get("to_user") and not data.get("to_person"):
        data["to_user"] = expense.paid_by_user
        data["to_person"] = expense.paid_by_person
    return data


def apply_settlement_to_share(settlement, share):
    pending = _pending_amount(share)
    if settlement.amount > pending:
        raise serializers.ValidationError("Settlement amount cannot exceed pending share amount.")
    share.paid_amount += settlement.amount
    share.save()
    return share


@transaction.atomic
def create_settlement(actor, data):
    settlement_data = _infer_settlement_parties(dict(data))
    settlement_data["created_by"] = actor
    expense = settlement_data.get("expense")
    share = settlement_data.get("expense_share")

    if expense and not can_view_expense(actor, expense):
        raise serializers.ValidationError("You do not have access to this expense.")
    if share and not can_view_expense(actor, share.expense):
        raise serializers.ValidationError("You do not have access to this expense.")

    if share and settlement_data.get("status", Settlement.Status.COMPLETED) == Settlement.Status.COMPLETED:
        if settlement_data["amount"] > _pending_amount(share):
            raise serializers.ValidationError("Settlement amount cannot exceed pending share amount.")

    settlement = Settlement.objects.create(**settlement_data)
    if settlement.expense_share_id and settlement.status == Settlement.Status.COMPLETED:
        apply_settlement_to_share(settlement, settlement.expense_share)
    return settlement


@transaction.atomic
def cancel_settlement(actor, settlement):
    if settlement.created_by_id != actor.id and not (
        settlement.expense and can_view_expense(actor, settlement.expense)
    ):
        raise serializers.ValidationError("You do not have access to this settlement.")
    if settlement.status == Settlement.Status.CANCELLED:
        return settlement

    if settlement.expense_share_id and settlement.status == Settlement.Status.COMPLETED:
        share = settlement.expense_share
        if share.paid_amount < settlement.amount:
            raise serializers.ValidationError("Cannot reverse this settlement.")
        share.paid_amount -= settlement.amount
        share.save()

    settlement.status = Settlement.Status.CANCELLED
    settlement.save(update_fields=["status", "updated_at"])
    return settlement


def get_person_ledger(user, person):
    if not can_view_person(user, person):
        raise serializers.ValidationError("You do not have access to this person.")

    owed_to_me = sum(
        (share.share_amount - share.paid_amount)
        for share in ExpenseShare.objects.filter(person=person, expense__paid_by_user=user)
    ) or Decimal("0.00")
    i_owe = sum(
        (share.share_amount - share.paid_amount)
        for share in ExpenseShare.objects.filter(user=user, expense__paid_by_person=person)
    ) or Decimal("0.00")
    settlements = Settlement.objects.filter(
        Q(from_person=person) | Q(to_person=person),
        created_by=user,
    )
    return {
        "total_owed_to_me": owed_to_me,
        "total_i_owe": i_owe,
        "settlements_count": settlements.count(),
        "pending_balance": owed_to_me - i_owe,
    }


def get_household_balances(user, household):
    if not can_view_household(user, household):
        raise serializers.ValidationError("You do not have access to this household.")
    shares = ExpenseShare.objects.select_related("person", "user").filter(
        expense__household=household
    )
    rows = []
    for share in shares:
        pending = share.share_amount - share.paid_amount
        if pending == 0:
            continue
        rows.append(
            {
                "share_id": share.id,
                "user": share.user_id,
                "person": share.person_id,
                "name": (
                    share.user.get_full_name()
                    if share.user_id
                    else share.person.name
                    if share.person_id
                    else "Member"
                ),
                "pending_amount": pending,
                "status": share.status,
            }
        )
    return rows
