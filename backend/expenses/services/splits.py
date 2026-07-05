from decimal import Decimal, ROUND_HALF_UP

from rest_framework import serializers


CENT = Decimal("0.01")
HUNDRED = Decimal("100.00")


def money(value):
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def _copy_participant(participant, share_amount):
    row = dict(participant)
    row["share_amount"] = money(share_amount)
    row.pop("percentage", None)
    return row


def calculate_splits(total_amount, participants, split_type):
    total = money(total_amount)
    if total < 0:
        raise serializers.ValidationError("Total amount cannot be negative.")
    if not participants:
        raise serializers.ValidationError("At least one participant is required.")

    split_type = split_type or "equal"

    if split_type == "equal":
        count = Decimal(len(participants))
        base = (total / count).quantize(CENT, rounding=ROUND_HALF_UP)
        rows = [_copy_participant(participant, base) for participant in participants]
        remainder = total - sum(row["share_amount"] for row in rows)
        rows[0]["share_amount"] = money(rows[0]["share_amount"] + remainder)
        return rows

    if split_type == "custom_amount":
        rows = []
        for participant in participants:
            if "share_amount" not in participant:
                raise serializers.ValidationError("Custom split requires share_amount.")
            rows.append(_copy_participant(participant, participant["share_amount"]))
        if sum(row["share_amount"] for row in rows) != total:
            raise serializers.ValidationError("Share total must equal expense amount.")
        return rows

    if split_type == "percentage":
        percentages = [money(participant.get("percentage", "0")) for participant in participants]
        if sum(percentages) != HUNDRED:
            raise serializers.ValidationError("Percentages must total 100.00.")

        rows = []
        for participant, percentage in zip(participants, percentages):
            rows.append(_copy_participant(participant, total * percentage / HUNDRED))
        remainder = total - sum(row["share_amount"] for row in rows)
        rows[0]["share_amount"] = money(rows[0]["share_amount"] + remainder)
        return rows

    raise serializers.ValidationError("Split type must be equal, custom_amount, or percentage.")
