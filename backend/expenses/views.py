from datetime import date

from django.db.models import Q
from django.http import HttpResponse
from django.utils.dateparse import parse_date
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from .models import (
    BillOccurrence,
    CategoryBudget,
    Expense,
    ExpenseCategory,
    ExpenseShare,
    HouseholdMember,
    MonthlyBudget,
    PeopleInvitation,
    Person,
    RecurringBill,
    Settlement,
)
from .serializers import (
    AcceptPeopleInvitationSerializer,
    AddHouseholdMemberSerializer,
    BillOccurrenceSerializer,
    CategoryBudgetSerializer,
    CreatePeopleInvitationSerializer,
    ExpenseCategorySerializer,
    ExpenseSerializer,
    ExpenseShareSerializer,
    HouseholdDetailSerializer,
    HouseholdMemberSerializer,
    HouseholdSerializer,
    MonthlyBudgetSerializer,
    PeopleInvitationSerializer,
    PersonSerializer,
    RecurringBillSerializer,
    SettlementSerializer,
)
from .services.budgets import get_category_budget_usage
from .services.categories import seed_default_categories
from .services.household_reports import (
    build_household_monthly_report_csv,
    build_household_monthly_report_pdf,
    get_household_monthly_report,
)
from .services.households import get_user_households, remove_member, update_member
from .services.people import (
    accept_invitation,
    accept_invitation_record,
    cancel_invitation,
    decline_invitation,
    normalize_email,
    send_people_invitation_email,
)
from .services.privacy import (
    can_create_household_expense,
    can_edit_expense,
    get_active_household_member,
    visible_expenses_for_user,
    visible_households_for_user,
)
from .services.recurring_bills import get_bill_calendar, mark_occurrence_paid, mark_occurrence_skipped
from .services.reports import (
    build_expenses_csv,
    build_monthly_report_pdf,
    get_monthly_expenses,
    get_monthly_report_data,
    parse_month_range,
)
from .services.settlements import cancel_settlement, get_household_balances, get_person_ledger
from .services.share_summary import (
    build_expense_share_summary,
    build_household_share_summary,
    build_person_share_summary,
)
from .services.shared_expenses import ensure_can_view_expense, update_expense_shares


def _parse_query_date(value, field_name):
    parsed = parse_date(value)
    if parsed is None:
        raise ValidationError({field_name: "Date must use YYYY-MM-DD format."})
    return parsed


def _parse_limit(value):
    try:
        limit = int(value)
    except (TypeError, ValueError):
        raise ValidationError({"limit": "Limit must be a number."})
    if limit < 1 or limit > 100:
        raise ValidationError({"limit": "Limit must be between 1 and 100."})
    return limit


def _require_month(request):
    try:
        start, end = parse_month_range(request.query_params.get("month"))
    except ValueError as exc:
        raise ValidationError({"month": str(exc)})
    return start, end


def _can_export_household_details(user, household):
    member = get_active_household_member(user, household)
    return bool(
        member
        and (
            member.role
            in {
                HouseholdMember.Role.OWNER,
                HouseholdMember.Role.ADMIN,
                HouseholdMember.Role.MEMBER,
            }
            or member.visibility_level == HouseholdMember.VisibilityLevel.FULL_HOUSEHOLD
        )
    )


def _previous_month(month_start):
    if month_start.month == 1:
        return date(month_start.year - 1, 12, 1)
    return date(month_start.year, month_start.month - 1, 1)


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseCategorySerializer

    def get_queryset(self):
        return ExpenseCategory.objects.filter(user=self.request.user).order_by("name")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=["post"], url_path="seed-defaults")
    def seed_defaults(self, request):
        categories = seed_default_categories(request.user)
        serializer = self.get_serializer(categories, many=True)
        return Response(serializer.data)


class PersonViewSet(viewsets.ModelViewSet):
    serializer_class = PersonSerializer

    def get_queryset(self):
        return Person.objects.filter(owner=self.request.user).order_by("name", "id")

    @action(detail=False, methods=["post"], url_path="invite")
    def invite(self, request):
        serializer = CreatePeopleInvitationSerializer(
            data=request.data,
            context={"request": request, "send_email": False},
        )
        serializer.is_valid(raise_exception=True)
        invitation = serializer.save()
        try:
            send_people_invitation_email(invitation, invitation.raw_token)
        except Exception:
            invitation.status = PeopleInvitation.Status.CANCELLED
            invitation.save(update_fields=["status", "updated_at"])
            return Response(
                {"detail": "Could not send invitation email. Check email settings."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        data = PeopleInvitationSerializer(invitation).data
        data["invite_token"] = invitation.raw_token
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="invitations")
    def invitations(self, request):
        user_email = normalize_email(request.user.email)
        invitations = PeopleInvitation.objects.filter(
            Q(invited_by=request.user) | Q(email=user_email)
        ).select_related("invited_by", "person").distinct().order_by("-created_at")
        return Response(PeopleInvitationSerializer(invitations, many=True, context={"request": request}).data)

    @action(detail=False, methods=["get"], url_path="overview")
    def overview(self, request):
        people = list(self.get_queryset())
        user_email = normalize_email(request.user.email)
        invitations = (
            PeopleInvitation.objects.filter(Q(invited_by=request.user) | Q(email=user_email))
            .select_related("invited_by", "person")
            .distinct()
            .order_by("-created_at")
        )
        ledgers = {}
        for person in people:
            ledger = get_person_ledger(request.user, person)
            ledgers[str(person.id)] = {
                "total_owed_to_me": str(ledger["total_owed_to_me"]),
                "total_i_owe": str(ledger["total_i_owe"]),
                "settlements_count": ledger["settlements_count"],
                "pending_balance": str(ledger["pending_balance"]),
            }
        return Response(
            {
                "people": PersonSerializer(people, many=True, context={"request": request}).data,
                "invitations": PeopleInvitationSerializer(
                    invitations,
                    many=True,
                    context={"request": request},
                ).data,
                "ledgers": ledgers,
            }
        )

    @action(detail=False, methods=["post"], url_path=r"invitations/(?P<invitation_id>[^/.]+)/cancel")
    def cancel_invitation(self, request, invitation_id=None):
        invitation = PeopleInvitation.objects.filter(id=invitation_id, invited_by=request.user).first()
        if not invitation:
            raise ValidationError("You do not have access to this invitation.")
        invitation = cancel_invitation(invitation, request.user)
        return Response(PeopleInvitationSerializer(invitation, context={"request": request}).data)

    @action(detail=False, methods=["post"], url_path="invitations/accept")
    def accept_invitation(self, request):
        serializer = AcceptPeopleInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invitation = accept_invitation(serializer.validated_data["token"], request.user)
        return Response(PeopleInvitationSerializer(invitation, context={"request": request}).data)

    @action(detail=False, methods=["post"], url_path=r"invitations/(?P<invitation_id>[^/.]+)/accept")
    def accept_invitation_by_id(self, request, invitation_id=None):
        invitation = PeopleInvitation.objects.filter(
            id=invitation_id,
            email=normalize_email(request.user.email),
        ).first()
        if not invitation:
            raise ValidationError("You do not have access to this invitation.")
        invitation = accept_invitation_record(invitation, request.user)
        return Response(PeopleInvitationSerializer(invitation, context={"request": request}).data)

    @action(detail=False, methods=["post"], url_path=r"invitations/(?P<invitation_id>[^/.]+)/decline")
    def decline_invitation_by_id(self, request, invitation_id=None):
        invitation = PeopleInvitation.objects.filter(
            id=invitation_id,
            email=normalize_email(request.user.email),
        ).first()
        if not invitation:
            raise ValidationError("You do not have access to this invitation.")
        invitation = decline_invitation(invitation, request.user)
        return Response(PeopleInvitationSerializer(invitation, context={"request": request}).data)

    @action(detail=True, methods=["get"], url_path="ledger")
    def ledger(self, request, pk=None):
        person = self.get_object()
        ledger = get_person_ledger(request.user, person)
        return Response(
            {
                "total_owed_to_me": str(ledger["total_owed_to_me"]),
                "total_i_owe": str(ledger["total_i_owe"]),
                "settlements_count": ledger["settlements_count"],
                "pending_balance": str(ledger["pending_balance"]),
            }
        )

    @action(detail=True, methods=["get"], url_path="share-summary")
    def share_summary(self, request, pk=None):
        person = self.get_object()
        return Response({"text": build_person_share_summary(request.user, person, request.query_params.get("month"))})


class HouseholdViewSet(viewsets.ModelViewSet):
    serializer_class = HouseholdSerializer

    def get_queryset(self):
        return get_user_households(self.request.user).prefetch_related("members").order_by("name", "id")

    def get_serializer_class(self):
        if self.action == "retrieve":
            return HouseholdDetailSerializer
        return HouseholdSerializer

    @action(detail=True, methods=["get", "post"], url_path="members")
    def members(self, request, pk=None):
        household = self.get_object()
        if request.method == "GET":
            members = household.members.select_related("user", "person").order_by("role", "id")
            return Response(HouseholdMemberSerializer(members, many=True).data)

        serializer = AddHouseholdMemberSerializer(
            data=request.data,
            context={"request": request, "household": household},
        )
        serializer.is_valid(raise_exception=True)
        member = serializer.save()
        return Response(HouseholdMemberSerializer(member).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch", "delete"], url_path=r"members/(?P<member_id>[^/.]+)")
    def member_detail(self, request, pk=None, member_id=None):
        household = self.get_object()
        member = household.members.filter(id=member_id).first()
        if not member:
            raise ValidationError("Household member not found.")

        if request.method == "DELETE":
            member = remove_member(request.user, member)
            return Response(HouseholdMemberSerializer(member).data)

        serializer = HouseholdMemberSerializer(member, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        member = update_member(request.user, member, serializer.validated_data)
        return Response(HouseholdMemberSerializer(member).data)

    @action(detail=True, methods=["get"], url_path="balances")
    def balances(self, request, pk=None):
        return Response(get_household_balances(request.user, self.get_object()))

    @action(detail=True, methods=["get"], url_path="category-budgets/usage")
    def category_budget_usage(self, request, pk=None):
        household = self.get_object()
        start, _ = _require_month(request)
        return Response(get_category_budget_usage(request.user, start.strftime("%Y-%m"), household=household))

    @action(detail=True, methods=["get"], url_path="bill-calendar")
    def bill_calendar(self, request, pk=None):
        household = self.get_object()
        start, _ = _require_month(request)
        occurrences = get_bill_calendar(request.user, start.strftime("%Y-%m"), household=household)
        return Response(BillOccurrenceSerializer(occurrences, many=True).data)

    @action(detail=True, methods=["get"], url_path="reports/monthly-summary")
    def monthly_report(self, request, pk=None):
        household = self.get_object()
        start, _ = _require_month(request)
        return Response(get_household_monthly_report(request.user, household, start.strftime("%Y-%m")))

    @action(detail=True, methods=["get"], url_path="reports/export-csv")
    def export_csv(self, request, pk=None):
        household = self.get_object()
        if not _can_export_household_details(request.user, household):
            raise PermissionDenied("You do not have access to export detailed household reports.")
        start, _ = _require_month(request)
        report_data = get_household_monthly_report(request.user, household, start.strftime("%Y-%m"))
        response = HttpResponse(build_household_monthly_report_csv(report_data), content_type="text/csv")
        response["Content-Disposition"] = (
            f'attachment; filename="household-{household.id}-expenses-{start:%Y-%m}.csv"'
        )
        return response

    @action(detail=True, methods=["get"], url_path="reports/export-pdf")
    def export_pdf(self, request, pk=None):
        household = self.get_object()
        if not _can_export_household_details(request.user, household):
            raise PermissionDenied("You do not have access to export detailed household reports.")
        start, _ = _require_month(request)
        report_data = get_household_monthly_report(request.user, household, start.strftime("%Y-%m"))
        response = HttpResponse(build_household_monthly_report_pdf(report_data), content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="household-{household.id}-expense-report-{start:%Y-%m}.pdf"'
        )
        return response

    @action(detail=True, methods=["get"], url_path="share-summary")
    def share_summary(self, request, pk=None):
        household = self.get_object()
        start, _ = _require_month(request)
        return Response({"text": build_household_share_summary(request.user, household, start.strftime("%Y-%m"))})


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer

    def get_queryset(self):
        queryset = visible_expenses_for_user(self.request.user).order_by("-expense_date", "-created_at")
        params = self.request.query_params

        if month := params.get("month"):
            try:
                start, end = parse_month_range(month)
            except ValueError as exc:
                raise ValidationError({"month": str(exc)})
            queryset = queryset.filter(expense_date__range=(start, end))

        if household := params.get("household"):
            queryset = queryset.filter(household_id=household)

        if category := params.get("category"):
            try:
                category_id = int(category)
            except ValueError:
                raise ValidationError({"category": "Category must be a numeric ID."})
            queryset = queryset.filter(category_id=category_id)

        if payment_method := params.get("payment_method"):
            if payment_method not in Expense.PaymentMethod.values:
                raise ValidationError(
                    {
                        "payment_method": (
                            "Payment method must be one of: "
                            f"{', '.join(Expense.PaymentMethod.values)}."
                        )
                    }
                )
            queryset = queryset.filter(payment_method=payment_method)

        if expense_type := params.get("expense_type"):
            if expense_type not in Expense.ExpenseType.values:
                raise ValidationError({"expense_type": "Invalid expense type."})
            queryset = queryset.filter(expense_type=expense_type)

        if start_date := params.get("start_date"):
            queryset = queryset.filter(expense_date__gte=_parse_query_date(start_date, "start_date"))

        if end_date := params.get("end_date"):
            queryset = queryset.filter(expense_date__lte=_parse_query_date(end_date, "end_date"))

        if ordering := params.get("ordering"):
            allowed_ordering = {
                "recent": ("-expense_date", "-created_at"),
                "oldest": ("expense_date", "created_at"),
                "amount_desc": ("-amount", "-expense_date"),
                "amount_asc": ("amount", "-expense_date"),
            }
            if ordering not in allowed_ordering:
                raise ValidationError({"ordering": f"Ordering must be one of: {', '.join(allowed_ordering)}."})
            queryset = queryset.order_by(*allowed_ordering[ordering])

        if limit := params.get("limit"):
            queryset = queryset[: _parse_limit(limit)]

        return queryset

    def perform_update(self, serializer):
        if not can_edit_expense(self.request.user, serializer.instance):
            raise PermissionDenied("You do not have access to edit this expense.")
        serializer.save()

    def perform_destroy(self, instance):
        if not can_edit_expense(self.request.user, instance):
            raise PermissionDenied("You do not have access to edit this expense.")
        instance.delete()

    @action(detail=True, methods=["get", "post"], url_path="shares")
    def shares(self, request, pk=None):
        expense = ensure_can_view_expense(request.user, self.get_object())
        if request.method == "GET":
            return Response(ExpenseShareSerializer(expense.shares.all(), many=True, context={"request": request}).data)

        if not can_edit_expense(request.user, expense):
            raise PermissionDenied("You do not have access to edit this expense.")
        serializer = ExpenseShareSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        share = serializer.save(expense=expense)
        return Response(ExpenseShareSerializer(share, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch", "delete"], url_path=r"shares/(?P<share_id>[^/.]+)")
    def share_detail(self, request, pk=None, share_id=None):
        expense = ensure_can_view_expense(request.user, self.get_object())
        if not can_edit_expense(request.user, expense):
            raise PermissionDenied("You do not have access to edit this expense.")
        share = expense.shares.filter(id=share_id).first()
        if not share:
            raise ValidationError("Expense share not found.")
        if request.method == "DELETE":
            share.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = ExpenseShareSerializer(share, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        share = serializer.save()
        return Response(ExpenseShareSerializer(share, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="shares/recalculate")
    def recalculate_shares(self, request, pk=None):
        expense = self.get_object()
        if not can_edit_expense(request.user, expense):
            raise PermissionDenied("You do not have access to edit this expense.")
        shares = request.data.get("participants") or request.data.get("shares") or []
        split_type = request.data.get("split_type") or "equal"
        expense = update_expense_shares(request.user, expense, shares, split_type=split_type)
        return Response(ExpenseSerializer(expense, context={"request": request}).data)

    @action(detail=True, methods=["get"], url_path="share-summary")
    def share_summary(self, request, pk=None):
        expense = ensure_can_view_expense(request.user, self.get_object())
        return Response({"text": build_expense_share_summary(request.user, expense)})


class MonthlyBudgetViewSet(viewsets.ModelViewSet):
    serializer_class = MonthlyBudgetSerializer

    def get_queryset(self):
        queryset = MonthlyBudget.objects.filter(user=self.request.user).order_by("-month")
        month = self.request.query_params.get("month")

        if month:
            try:
                start, _ = parse_month_range(month)
            except ValueError as exc:
                raise ValidationError({"month": str(exc)})
            queryset = queryset.filter(month=start)

        return queryset

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class SettlementViewSet(viewsets.ModelViewSet):
    serializer_class = SettlementSerializer

    def get_queryset(self):
        visible_expense_ids = visible_expenses_for_user(self.request.user).values_list("id", flat=True)
        return (
            Settlement.objects.select_related("expense", "expense_share")
            .filter(Q(created_by=self.request.user) | Q(expense_id__in=visible_expense_ids))
            .distinct()
            .order_by("-created_at")
        )

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        settlement = cancel_settlement(request.user, self.get_object())
        return Response(SettlementSerializer(settlement).data)


class CategoryBudgetViewSet(viewsets.ModelViewSet):
    serializer_class = CategoryBudgetSerializer

    def get_queryset(self):
        household_ids = visible_households_for_user(self.request.user).values_list("id", flat=True)
        return (
            CategoryBudget.objects.select_related("category", "household")
            .filter(Q(user=self.request.user) | Q(household_id__in=household_ids))
            .order_by("-month", "category__name")
        )

    def perform_update(self, serializer):
        instance = serializer.instance
        if instance.household_id and not can_create_household_expense(self.request.user, instance.household):
            raise PermissionDenied("You do not have access to this household.")
        if instance.user_id and instance.user_id != self.request.user.id:
            raise PermissionDenied("You do not have access to this category budget.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance.household_id and not can_create_household_expense(self.request.user, instance.household):
            raise PermissionDenied("You do not have access to this household.")
        if instance.user_id and instance.user_id != self.request.user.id:
            raise PermissionDenied("You do not have access to this category budget.")
        instance.delete()

    @action(detail=False, methods=["get"], url_path="usage")
    def usage(self, request):
        start, _ = _require_month(request)
        return Response(get_category_budget_usage(request.user, start.strftime("%Y-%m")))


class RecurringBillViewSet(viewsets.ModelViewSet):
    serializer_class = RecurringBillSerializer

    def get_queryset(self):
        household_ids = visible_households_for_user(self.request.user).values_list("id", flat=True)
        return (
            RecurringBill.objects.select_related("category", "household")
            .filter(Q(user=self.request.user) | Q(household_id__in=household_ids))
            .order_by("next_due_date", "name")
        )

    def perform_update(self, serializer):
        instance = serializer.instance
        if instance.household_id and not can_create_household_expense(self.request.user, instance.household):
            raise PermissionDenied("You do not have access to this household.")
        if instance.user_id and instance.user_id != self.request.user.id:
            raise PermissionDenied("You do not have access to this recurring bill.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance.household_id and not can_create_household_expense(self.request.user, instance.household):
            raise PermissionDenied("You do not have access to this household.")
        if instance.user_id and instance.user_id != self.request.user.id:
            raise PermissionDenied("You do not have access to this recurring bill.")
        instance.delete()


class BillOccurrenceViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = BillOccurrenceSerializer

    def get_queryset(self):
        household_ids = visible_households_for_user(self.request.user).values_list("id", flat=True)
        return (
            BillOccurrence.objects.select_related("recurring_bill", "recurring_bill__category")
            .filter(Q(recurring_bill__user=self.request.user) | Q(recurring_bill__household_id__in=household_ids))
            .order_by("due_date", "id")
        )

    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        create_expense = request.data.get("create_expense", True)
        if isinstance(create_expense, str):
            create_expense = create_expense.lower() not in {"0", "false", "no"}
        occurrence = mark_occurrence_paid(request.user, self.get_object(), create_expense=create_expense)
        return Response(BillOccurrenceSerializer(occurrence).data)

    @action(detail=True, methods=["post"], url_path="skip")
    def skip(self, request, pk=None):
        occurrence = mark_occurrence_skipped(request.user, self.get_object())
        return Response(BillOccurrenceSerializer(occurrence).data)


@api_view(["GET"])
def bill_calendar(request):
    start, _ = _require_month(request)
    occurrences = get_bill_calendar(request.user, start.strftime("%Y-%m"))
    return Response(BillOccurrenceSerializer(occurrences, many=True).data)


@api_view(["GET"])
def monthly_summary(request):
    try:
        start, end = parse_month_range(request.query_params.get("month"))
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(get_monthly_report_data(start, end, user=request.user))


@api_view(["GET"])
def dashboard_summary(request):
    try:
        start, end = parse_month_range(request.query_params.get("month"))
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    try:
        limit = _parse_limit(request.query_params.get("limit", 30))
    except ValidationError as exc:
        return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

    previous_start = _previous_month(start)
    previous_end = date(
        previous_start.year,
        previous_start.month,
        parse_month_range(previous_start.strftime("%Y-%m"))[1].day,
    )
    recent_expenses = visible_expenses_for_user(request.user).filter(
        expense_date__range=(start, end)
    ).order_by("-expense_date", "-created_at")[:limit]

    return Response(
        {
            "summary": get_monthly_report_data(start, end, user=request.user),
            "previous_summary": get_monthly_report_data(previous_start, previous_end, user=request.user),
            "recent_expenses": ExpenseSerializer(
                recent_expenses,
                many=True,
                context={"request": request},
            ).data,
        }
    )


@api_view(["GET"])
def export_csv(request):
    try:
        start, end = parse_month_range(request.query_params.get("month"))
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    csv_content = build_expenses_csv(get_monthly_expenses(start, end, user=request.user))
    response = HttpResponse(csv_content, content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="sora-expenses-{start:%Y-%m}.csv"'
    return response


@api_view(["GET"])
def export_pdf(request):
    try:
        start, end = parse_month_range(request.query_params.get("month"))
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    expenses = list(get_monthly_expenses(start, end, user=request.user))
    report_data = get_monthly_report_data(start, end, user=request.user)
    pdf_content = build_monthly_report_pdf(report_data, expenses)
    response = HttpResponse(pdf_content, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="sora-expense-report-{start:%Y-%m}.pdf"'
    return response
