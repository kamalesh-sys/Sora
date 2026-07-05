from django.db import transaction
from rest_framework import serializers

from expenses.models import Household, HouseholdMember, Person
from expenses.services.privacy import can_manage_household, get_active_household_member, visible_households_for_user


@transaction.atomic
def create_household(owner, data):
    household = Household.objects.create(owner=owner, **data)
    HouseholdMember.objects.create(
        household=household,
        user=owner,
        role=HouseholdMember.Role.OWNER,
        status=HouseholdMember.Status.ACTIVE,
        visibility_level=HouseholdMember.VisibilityLevel.FULL_HOUSEHOLD,
    )
    return household


def get_user_households(user):
    return visible_households_for_user(user)


def get_household_for_user(user, household_id):
    household = visible_households_for_user(user).filter(id=household_id).first()
    if not household:
        raise serializers.ValidationError("You do not have access to this household.")
    return household


def get_user_household_role(user, household):
    member = get_active_household_member(user, household)
    return member.role if member else None


def _ensure_member_manager(actor, household):
    if not can_manage_household(actor, household):
        raise serializers.ValidationError("You do not have access to manage this household.")


def _ensure_admin_rules(actor, household, target_role):
    actor_member = get_active_household_member(actor, household)
    if not actor_member:
        raise serializers.ValidationError("You do not have access to this household.")
    if actor_member.role == HouseholdMember.Role.ADMIN and target_role == HouseholdMember.Role.OWNER:
        raise serializers.ValidationError("Admin cannot modify owner.")


@transaction.atomic
def add_household_member(
    actor,
    household,
    person=None,
    user=None,
    role=HouseholdMember.Role.MEMBER,
    visibility_level=HouseholdMember.VisibilityLevel.SHARED_ONLY,
):
    _ensure_member_manager(actor, household)
    _ensure_admin_rules(actor, household, role)

    if role == HouseholdMember.Role.OWNER:
        raise serializers.ValidationError("Cannot add another owner.")

    if not person and not user:
        raise serializers.ValidationError("Either user or person is required.")

    if person and person.owner_id != actor.id and not can_manage_household(actor, household):
        raise serializers.ValidationError("You do not have access to this person.")

    return HouseholdMember.objects.create(
        household=household,
        person=person,
        user=user,
        role=role,
        status=HouseholdMember.Status.ACTIVE,
        visibility_level=visibility_level,
    )


@transaction.atomic
def update_member(actor, member, data):
    _ensure_member_manager(actor, member.household)
    _ensure_admin_rules(actor, member.household, data.get("role", member.role))

    if member.role == HouseholdMember.Role.OWNER:
        raise serializers.ValidationError("Cannot modify owner member.")

    for field in ["role", "status", "visibility_level"]:
        if field in data:
            setattr(member, field, data[field])
    member.save()
    return member


@transaction.atomic
def remove_member(actor, member):
    _ensure_member_manager(actor, member.household)
    if member.role == HouseholdMember.Role.OWNER:
        raise serializers.ValidationError("Cannot remove owner.")
    member.status = HouseholdMember.Status.REMOVED
    member.save(update_fields=["status", "updated_at"])
    return member
