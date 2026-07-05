from django.db.models import Prefetch, Q

from expenses.models import Expense, ExpenseShare, Household, HouseholdMember, Person


ACTIVE = HouseholdMember.Status.ACTIVE


def get_active_household_member(user, household):
    if not user or not user.is_authenticated:
        return None
    return (
        HouseholdMember.objects.select_related("household", "person", "user")
        .filter(
            household=household,
            status=ACTIVE,
        )
        .filter(Q(user=user) | Q(person__linked_user=user))
        .first()
    )


def can_view_household(user, household):
    return get_active_household_member(user, household) is not None


def can_manage_household(user, household):
    member = get_active_household_member(user, household)
    return bool(member and member.role in {HouseholdMember.Role.OWNER, HouseholdMember.Role.ADMIN})


def can_create_household_expense(user, household):
    member = get_active_household_member(user, household)
    return bool(
        member
        and member.role
        in {HouseholdMember.Role.OWNER, HouseholdMember.Role.ADMIN, HouseholdMember.Role.MEMBER}
    )


def can_view_person(user, person):
    return bool(person.owner_id == user.id or person.linked_user_id == user.id)


def can_view_expense(user, expense):
    if not user or not user.is_authenticated:
        return False

    if expense.visibility == Expense.Visibility.PRIVATE:
        return expense.user_id == user.id or expense.created_by_id == user.id

    if expense.created_by_id == user.id or expense.user_id == user.id or expense.paid_by_user_id == user.id:
        return True

    if expense.paid_by_person_id and can_view_person(user, expense.paid_by_person):
        return True

    if expense.shares.filter(Q(user=user) | Q(person__owner=user) | Q(person__linked_user=user)).exists():
        return True

    if expense.household_id:
        return can_view_household(user, expense.household)

    return False


def can_edit_expense(user, expense):
    if not user or not user.is_authenticated:
        return False
    if expense.created_by_id == user.id or expense.user_id == user.id:
        return True
    if expense.household_id:
        member = get_active_household_member(user, expense.household)
        return bool(member and member.role in {HouseholdMember.Role.OWNER, HouseholdMember.Role.ADMIN})
    return False


def visible_households_for_user(user):
    return Household.objects.filter(members__status=ACTIVE).filter(
        Q(members__user=user) | Q(members__person__linked_user=user)
    ).distinct()


def detailed_household_ids_for_user(user):
    return (
        HouseholdMember.objects.filter(status=ACTIVE)
        .filter(Q(user=user) | Q(person__linked_user=user))
        .filter(
            Q(role__in=[HouseholdMember.Role.OWNER, HouseholdMember.Role.ADMIN, HouseholdMember.Role.MEMBER])
            | Q(visibility_level=HouseholdMember.VisibilityLevel.FULL_HOUSEHOLD)
        )
        .values_list("household_id", flat=True)
    )


def visible_people_for_user(user):
    return Person.objects.filter(owner=user)


def visible_expenses_for_user(user):
    household_ids = detailed_household_ids_for_user(user)
    return (
        Expense.objects.select_related("category", "household", "paid_by_user", "paid_by_person")
        .prefetch_related(
            Prefetch(
                "shares",
                queryset=ExpenseShare.objects.select_related("user", "person", "household_member"),
            )
        )
        .filter(
            Q(visibility=Expense.Visibility.PRIVATE, user=user)
            | Q(visibility=Expense.Visibility.PRIVATE, created_by=user)
            | Q(visibility=Expense.Visibility.SHARED, user=user)
            | Q(visibility=Expense.Visibility.SHARED, created_by=user)
            | Q(visibility=Expense.Visibility.SHARED, paid_by_user=user)
            | Q(visibility=Expense.Visibility.SHARED, paid_by_person__owner=user)
            | Q(visibility=Expense.Visibility.SHARED, paid_by_person__linked_user=user)
            | Q(visibility__in=[Expense.Visibility.SHARED, Expense.Visibility.HOUSEHOLD], shares__user=user)
            | Q(visibility__in=[Expense.Visibility.SHARED, Expense.Visibility.HOUSEHOLD], shares__person__owner=user)
            | Q(visibility__in=[Expense.Visibility.SHARED, Expense.Visibility.HOUSEHOLD], shares__person__linked_user=user)
            | Q(visibility=Expense.Visibility.HOUSEHOLD, household_id__in=household_ids)
        )
        .distinct()
    )
