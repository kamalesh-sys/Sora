from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from .models import (
    BillOccurrence,
    CategoryBudget,
    Expense,
    ExpenseCategory,
    ExpenseShare,
    Goal,
    GoalContribution,
    GoalMonthSkip,
    Household,
    HouseholdMember,
    MonthlyBudget,
    Loan,
    LoanPayment,
    PeopleInvitation,
    Person,
    RecurringBill,
    Settlement,
)
from .services.budgets import create_or_update_category_budget, get_month_start
from .services.goals import (
    GOAL_TEMPLATE_KEYS,
    GOAL_TEMPLATES,
    get_goal_metrics,
    synchronize_goal_completion,
)
from .services.households import add_household_member, create_household, get_user_household_role
from .services.loans import get_loan_metrics, latest_payment_date, money
from .services.people import create_invitation, create_person, normalize_email, send_people_invitation_email
from .services.privacy import can_create_household_expense, can_view_expense, can_view_person
from .services.recurring_bills import create_recurring_bill
from .services.settlements import create_settlement
from .services.shared_expenses import create_expense_with_shares, get_expense_balance
from .services.splits import money


User = get_user_model()


class UserMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name"]


class ExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseCategory
        fields = ["id", "name", "icon", "color", "transaction_type", "created_at"]
        read_only_fields = ["id", "created_at"]


class PersonMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Person
        fields = ["id", "name", "email", "relation_type"]


class PersonSerializer(serializers.ModelSerializer):
    linked_user = UserMiniSerializer(read_only=True)

    class Meta:
        model = Person
        fields = [
            "id",
            "name",
            "email",
            "phone",
            "relation_type",
            "linked_user",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "linked_user", "created_at", "updated_at"]

    def create(self, validated_data):
        return create_person(self.context["request"].user, validated_data)


class PeopleInvitationSerializer(serializers.ModelSerializer):
    direction = serializers.SerializerMethodField()
    invited_by_detail = UserMiniSerializer(source="invited_by", read_only=True)
    person_detail = PersonMiniSerializer(source="person", read_only=True)

    class Meta:
        model = PeopleInvitation
        fields = [
            "id",
            "invited_by",
            "invited_by_detail",
            "email",
            "relation_type",
            "person",
            "person_detail",
            "direction",
            "status",
            "expires_at",
            "accepted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "invited_by",
            "invited_by_detail",
            "direction",
            "status",
            "expires_at",
            "accepted_at",
            "created_at",
            "updated_at",
        ]

    def get_direction(self, obj):
        request = self.context.get("request")
        if not request:
            return "sent"
        if obj.invited_by_id == request.user.id:
            return "sent"
        if obj.email == normalize_email(request.user.email):
            return "received"
        return "sent"


class CreatePeopleInvitationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    relation_type = serializers.ChoiceField(choices=Person.RelationType.choices, default=Person.RelationType.OTHER)
    person = serializers.PrimaryKeyRelatedField(queryset=Person.objects.none(), required=False, allow_null=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request:
            self.fields["person"].queryset = Person.objects.filter(owner=request.user)

    def save(self, **kwargs):
        user = self.context["request"].user
        person = self.validated_data.get("person")
        if person is None and self.validated_data.get("name"):
            person = create_person(
                user,
                {
                    "name": self.validated_data["name"],
                    "email": self.validated_data["email"],
                    "relation_type": self.validated_data["relation_type"],
                },
            )
        invitation, raw_token = create_invitation(
            invited_by=user,
            email=self.validated_data["email"],
            relation_type=self.validated_data["relation_type"],
            person=person,
        )
        send_email = self.context.get("send_email", True)
        if send_email:
            send_people_invitation_email(invitation, raw_token)
        invitation.raw_token = raw_token
        return invitation


class AcceptPeopleInvitationSerializer(serializers.Serializer):
    token = serializers.CharField()


class HouseholdMemberSerializer(serializers.ModelSerializer):
    user_detail = UserMiniSerializer(source="user", read_only=True)
    person_detail = PersonMiniSerializer(source="person", read_only=True)

    class Meta:
        model = HouseholdMember
        fields = [
            "id",
            "household",
            "user",
            "user_detail",
            "person",
            "person_detail",
            "role",
            "status",
            "visibility_level",
            "joined_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "household", "joined_at", "created_at", "updated_at"]


class AddHouseholdMemberSerializer(serializers.Serializer):
    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False, allow_null=True)
    person = serializers.PrimaryKeyRelatedField(queryset=Person.objects.none(), required=False, allow_null=True)
    role = serializers.ChoiceField(choices=HouseholdMember.Role.choices, default=HouseholdMember.Role.MEMBER)
    visibility_level = serializers.ChoiceField(
        choices=HouseholdMember.VisibilityLevel.choices,
        default=HouseholdMember.VisibilityLevel.SHARED_ONLY,
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request:
            self.fields["person"].queryset = Person.objects.filter(owner=request.user)

    def validate(self, attrs):
        if not attrs.get("user") and not attrs.get("person"):
            raise serializers.ValidationError("Either user or person is required.")
        return attrs

    def save(self, **kwargs):
        return add_household_member(
            actor=self.context["request"].user,
            household=self.context["household"],
            user=self.validated_data.get("user"),
            person=self.validated_data.get("person"),
            role=self.validated_data.get("role", HouseholdMember.Role.MEMBER),
            visibility_level=self.validated_data.get(
                "visibility_level",
                HouseholdMember.VisibilityLevel.SHARED_ONLY,
            ),
        )


class HouseholdSerializer(serializers.ModelSerializer):
    my_role = serializers.SerializerMethodField()
    members_count = serializers.SerializerMethodField()

    class Meta:
        model = Household
        fields = [
            "id",
            "name",
            "description",
            "monthly_budget",
            "currency",
            "my_role",
            "members_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "my_role", "members_count", "created_at", "updated_at"]

    def get_my_role(self, obj):
        request = self.context.get("request")
        return get_user_household_role(request.user, obj) if request else None

    def get_members_count(self, obj):
        return obj.members.filter(status=HouseholdMember.Status.ACTIVE).count()

    def create(self, validated_data):
        return create_household(self.context["request"].user, validated_data)


class HouseholdDetailSerializer(HouseholdSerializer):
    members = HouseholdMemberSerializer(many=True, read_only=True)

    class Meta(HouseholdSerializer.Meta):
        fields = HouseholdSerializer.Meta.fields + ["members"]


class HouseholdMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Household
        fields = ["id", "name", "currency"]


class ExpenseShareSerializer(serializers.ModelSerializer):
    user_detail = UserMiniSerializer(source="user", read_only=True)
    person_detail = PersonMiniSerializer(source="person", read_only=True)
    pending_amount = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseShare
        fields = [
            "id",
            "expense",
            "user",
            "user_detail",
            "person",
            "person_detail",
            "household_member",
            "share_amount",
            "paid_amount",
            "pending_amount",
            "status",
            "note",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "expense", "pending_amount", "created_at", "updated_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request:
            self.fields["person"].queryset = Person.objects.filter(
                Q(owner=request.user) | Q(linked_user=request.user)
            )

    def get_pending_amount(self, obj):
        return str(money(obj.share_amount - obj.paid_amount))

    def validate_person(self, value):
        request = self.context.get("request")
        if value and request and not can_view_person(request.user, value):
            raise serializers.ValidationError("You do not have access to this person.")
        return value

    def validate(self, attrs):
        if not attrs.get("user") and not attrs.get("person") and not attrs.get("household_member"):
            if not self.instance:
                raise serializers.ValidationError("At least one participant is required.")
        paid_amount = attrs.get("paid_amount")
        share_amount = attrs.get("share_amount")
        if self.instance:
            paid_amount = self.instance.paid_amount if paid_amount is None else paid_amount
            share_amount = self.instance.share_amount if share_amount is None else share_amount
        else:
            paid_amount = Decimal("0.00") if paid_amount is None else paid_amount
            share_amount = Decimal("0.00") if share_amount is None else share_amount
        if paid_amount > share_amount:
            raise serializers.ValidationError("Paid amount cannot exceed share amount.")
        return attrs


class ExpenseSerializer(serializers.ModelSerializer):
    category_detail = ExpenseCategorySerializer(source="category", read_only=True)
    household_detail = HouseholdMiniSerializer(source="household", read_only=True)
    paid_by_user_detail = UserMiniSerializer(source="paid_by_user", read_only=True)
    paid_by_person_detail = PersonMiniSerializer(source="paid_by_person", read_only=True)
    shares = ExpenseShareSerializer(many=True, read_only=True)
    share_summary = serializers.SerializerMethodField()
    split_type = serializers.ChoiceField(
        choices=["equal", "custom_amount", "percentage"],
        write_only=True,
        required=False,
    )
    participants = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)

    class Meta:
        model = Expense
        fields = [
            "id",
            "title",
            "amount",
            "transaction_type",
            "category",
            "category_detail",
            "payment_method",
            "expense_date",
            "note",
            "household",
            "household_detail",
            "created_by",
            "paid_by_user",
            "paid_by_user_detail",
            "paid_by_person",
            "paid_by_person_detail",
            "visibility",
            "expense_type",
            "shares",
            "share_summary",
            "split_type",
            "participants",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_by",
            "created_at",
            "updated_at",
            "category_detail",
            "household_detail",
            "paid_by_user_detail",
            "paid_by_person_detail",
            "shares",
            "share_summary",
        ]

    def to_internal_value(self, data):
        mutable = data.copy()
        request = self.context.get("request")
        if request and mutable.get("paid_by_user") == "me":
            mutable["paid_by_user"] = request.user.pk
        return super().to_internal_value(mutable)

    def get_share_summary(self, obj):
        return get_expense_balance(obj)

    def validate_category(self, value):
        request = self.context.get("request")
        if not value or not request:
            return value
        if not (hasattr(self, "initial_data") and self.initial_data.get("household")) and value.user_id != request.user.id:
            raise serializers.ValidationError("Category does not belong to this user.")
        return value

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value

    def validate_paid_by_person(self, value):
        request = self.context.get("request")
        if value and request and not can_view_person(request.user, value):
            raise serializers.ValidationError("You do not have access to this person.")
        return value

    def validate_household(self, value):
        request = self.context.get("request")
        if value and request and not can_create_household_expense(request.user, value):
            raise serializers.ValidationError("Viewer cannot create household expenses.")
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        if not request:
            return attrs
        household = attrs.get("household")
        category = attrs.get("category")
        transaction_type = attrs.get("transaction_type")
        expense_type = attrs.get("expense_type")
        if self.instance:
            household = self.instance.household if household is None else household
            category = self.instance.category if category is None else category
            transaction_type = self.instance.transaction_type if transaction_type is None else transaction_type
            expense_type = self.instance.expense_type if expense_type is None else expense_type
        transaction_type = transaction_type or Expense.TransactionType.EXPENSE
        expense_type = expense_type or Expense.ExpenseType.PERSONAL
        if household:
            if not can_create_household_expense(request.user, household):
                raise serializers.ValidationError("Viewer cannot create household expenses.")
            if category and category.user_id not in {request.user.id, household.owner_id}:
                raise serializers.ValidationError("Category is not allowed for this household.")
        elif category and category.user_id != request.user.id:
            raise serializers.ValidationError("Category does not belong to this user.")
        if category and category.transaction_type != transaction_type:
            raise serializers.ValidationError(
                {"category": f"Choose a category for {transaction_type} transactions."}
            )
        participants = attrs.get("participants")
        if transaction_type == Expense.TransactionType.INCOME:
            if expense_type == Expense.ExpenseType.SHARED:
                raise serializers.ValidationError(
                    {"expense_type": "Income cannot be split as a shared expense."}
                )
            if participants:
                raise serializers.ValidationError(
                    {"participants": "Income transactions cannot have expense shares."}
                )
            if self.instance and self.instance.shares.exists():
                raise serializers.ValidationError(
                    {"transaction_type": "Remove expense shares before changing this transaction to income."}
                )
        return attrs

    def create(self, validated_data):
        participants = validated_data.pop("participants", None)
        split_type = validated_data.pop("split_type", None)
        return create_expense_with_shares(
            self.context["request"].user,
            validated_data,
            shares_data=participants,
            split_type=split_type,
        )

    def update(self, instance, validated_data):
        validated_data.pop("participants", None)
        validated_data.pop("split_type", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        return instance


class MonthlyBudgetSerializer(serializers.ModelSerializer):
    class Meta:
        model = MonthlyBudget
        fields = ["id", "month", "amount", "note", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_month(self, value):
        return value.replace(day=1)


class SettlementSerializer(serializers.ModelSerializer):
    expense_detail = ExpenseSerializer(source="expense", read_only=True)

    class Meta:
        model = Settlement
        fields = [
            "id",
            "expense",
            "expense_detail",
            "expense_share",
            "from_user",
            "from_person",
            "to_user",
            "to_person",
            "amount",
            "method",
            "status",
            "settled_at",
            "note",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "expense_detail", "settled_at", "created_by", "created_at", "updated_at"]

    def validate(self, attrs):
        request = self.context.get("request")
        expense = attrs.get("expense")
        share = attrs.get("expense_share")
        if share:
            expense = share.expense
        if expense and request and not can_view_expense(request.user, expense):
            raise serializers.ValidationError("You do not have access to this expense.")
        return attrs

    def create(self, validated_data):
        return create_settlement(self.context["request"].user, validated_data)


class CategoryBudgetSerializer(serializers.ModelSerializer):
    category_detail = ExpenseCategorySerializer(source="category", read_only=True)

    class Meta:
        model = CategoryBudget
        fields = [
            "id",
            "user",
            "household",
            "category",
            "category_detail",
            "month",
            "amount",
            "note",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "category_detail", "created_at", "updated_at"]

    def validate_month(self, value):
        return get_month_start(value)

    def validate(self, attrs):
        request = self.context.get("request")
        if not request:
            return attrs
        household = attrs.get("household")
        category = attrs.get("category")
        if self.instance:
            household = self.instance.household if household is None else household
            category = self.instance.category if category is None else category
        if household:
            if not can_create_household_expense(request.user, household):
                raise serializers.ValidationError("You do not have access to this household.")
            if category and category.user_id not in {request.user.id, household.owner_id}:
                raise serializers.ValidationError("Category is not allowed for this household.")
        elif category and category.user_id != request.user.id:
            raise serializers.ValidationError("Category does not belong to this user.")
        if category and category.transaction_type != ExpenseCategory.TransactionType.EXPENSE:
            raise serializers.ValidationError({"category": "Budgets require an expense category."})
        return attrs

    def create(self, validated_data):
        return create_or_update_category_budget(self.context["request"].user, validated_data)


class CategoryBudgetUsageSerializer(serializers.Serializer):
    month = serializers.CharField()
    rows = serializers.ListField()


class RecurringBillSerializer(serializers.ModelSerializer):
    category_detail = ExpenseCategorySerializer(source="category", read_only=True)

    class Meta:
        model = RecurringBill
        fields = [
            "id",
            "user",
            "household",
            "name",
            "category",
            "category_detail",
            "amount",
            "payment_method",
            "frequency",
            "due_day",
            "next_due_date",
            "reminder_days_before",
            "auto_create_expense",
            "is_active",
            "note",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "category_detail", "created_at", "updated_at"]

    def validate(self, attrs):
        request = self.context.get("request")
        if not request:
            return attrs
        household = attrs.get("household")
        category = attrs.get("category")
        if self.instance:
            household = self.instance.household if household is None else household
            category = self.instance.category if category is None else category
        if household:
            if not can_create_household_expense(request.user, household):
                raise serializers.ValidationError("You do not have access to this household.")
            if category and category.user_id not in {request.user.id, household.owner_id}:
                raise serializers.ValidationError("Category is not allowed for this household.")
        elif category and category.user_id != request.user.id:
            raise serializers.ValidationError("Category does not belong to this user.")
        if category and category.transaction_type != ExpenseCategory.TransactionType.EXPENSE:
            raise serializers.ValidationError({"category": "Recurring bills require an expense category."})
        return attrs

    def create(self, validated_data):
        return create_recurring_bill(self.context["request"].user, validated_data)


class BillOccurrenceSerializer(serializers.ModelSerializer):
    recurring_bill_detail = RecurringBillSerializer(source="recurring_bill", read_only=True)

    class Meta:
        model = BillOccurrence
        fields = [
            "id",
            "recurring_bill",
            "recurring_bill_detail",
            "due_date",
            "amount",
            "status",
            "paid_expense",
            "paid_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "recurring_bill_detail", "paid_expense", "paid_at", "created_at", "updated_at"]


class GoalContributionSerializer(serializers.ModelSerializer):
    contribution_date = serializers.DateField(default=timezone.localdate)
    add_to_expenses = serializers.BooleanField(default=False, required=False, write_only=True)

    class Meta:
        model = GoalContribution
        fields = [
            "id",
            "amount",
            "contribution_date",
            "note",
            "expense",
            "add_to_expenses",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "expense", "created_at", "updated_at"]
        extra_kwargs = {
            "amount": {"min_value": Decimal("0.01")},
        }

    def validate_contribution_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("Contribution date cannot be in the future.")
        return value


class GoalMonthSkipSerializer(serializers.ModelSerializer):
    class Meta:
        model = GoalMonthSkip
        fields = ["id", "month", "created_at"]
        read_only_fields = fields


class GoalMonthSkipCreateSerializer(serializers.Serializer):
    month = serializers.CharField(max_length=7)

    def validate_month(self, value):
        parts = value.split("-")
        if len(parts) != 2 or len(parts[0]) != 4 or len(parts[1]) != 2:
            raise serializers.ValidationError("Month must use YYYY-MM format.")
        try:
            return date(int(parts[0]), int(parts[1]), 1)
        except (TypeError, ValueError):
            raise serializers.ValidationError("Month must use YYYY-MM format.")


class GoalTemplateSerializer(serializers.Serializer):
    key = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField()
    icon = serializers.CharField()
    color = serializers.CharField()
    suggested_months = serializers.IntegerField()


class GoalSerializer(serializers.ModelSerializer):
    contributions = GoalContributionSerializer(many=True, read_only=True)
    skipped_months = GoalMonthSkipSerializer(many=True, read_only=True)
    saved_amount = serializers.SerializerMethodField()
    remaining_amount = serializers.SerializerMethodField()
    progress_percent = serializers.SerializerMethodField()
    required_monthly_contribution = serializers.SerializerMethodField()
    remaining_month_count = serializers.SerializerMethodField()
    expected_saved_amount = serializers.SerializerMethodField()
    shortfall_amount = serializers.SerializerMethodField()
    health_status = serializers.SerializerMethodField()
    can_skip_current_month = serializers.SerializerMethodField()

    class Meta:
        model = Goal
        fields = [
            "id",
            "name",
            "description",
            "target_amount",
            "target_date",
            "status",
            "completed_at",
            "template_key",
            "icon",
            "color",
            "saved_amount",
            "remaining_amount",
            "progress_percent",
            "required_monthly_contribution",
            "remaining_month_count",
            "expected_saved_amount",
            "shortfall_amount",
            "health_status",
            "can_skip_current_month",
            "contributions",
            "skipped_months",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "completed_at",
            "saved_amount",
            "remaining_amount",
            "progress_percent",
            "required_monthly_contribution",
            "remaining_month_count",
            "expected_saved_amount",
            "shortfall_amount",
            "health_status",
            "can_skip_current_month",
            "contributions",
            "skipped_months",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "target_amount": {"min_value": Decimal("0.01")},
        }

    @staticmethod
    def _decimal(value):
        return format(value, ".2f")

    @staticmethod
    def _template(template_key):
        return next(
            (template for template in GOAL_TEMPLATES if template["key"] == template_key),
            None,
        )

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Goal name cannot be blank.")
        return value

    def validate_target_date(self, value):
        unchanged_existing_date = bool(
            self.instance and value == self.instance.target_date
        )
        if value < timezone.localdate() and not unchanged_existing_date:
            raise serializers.ValidationError("Target date cannot be in the past.")
        return value

    def validate_template_key(self, value):
        if value and value not in GOAL_TEMPLATE_KEYS:
            raise serializers.ValidationError("Unknown goal template.")
        return value

    def create(self, validated_data):
        template = self._template(validated_data.get("template_key"))
        if template:
            validated_data.setdefault("icon", template["icon"])
            validated_data.setdefault("color", template["color"])
        return super().create(validated_data)

    def update(self, instance, validated_data):
        with transaction.atomic():
            locked_instance = Goal.objects.select_for_update().get(pk=instance.pk)
            instance = super().update(locked_instance, validated_data)
            synchronize_goal_completion(instance)
        return instance

    def get_saved_amount(self, obj):
        return self._decimal(get_goal_metrics(obj).saved_amount)

    def get_remaining_amount(self, obj):
        return self._decimal(get_goal_metrics(obj).remaining_amount)

    def get_progress_percent(self, obj):
        return self._decimal(get_goal_metrics(obj).progress_percent)

    def get_required_monthly_contribution(self, obj):
        return self._decimal(get_goal_metrics(obj).required_monthly_contribution)

    def get_remaining_month_count(self, obj):
        return get_goal_metrics(obj).remaining_month_count

    def get_expected_saved_amount(self, obj):
        return self._decimal(get_goal_metrics(obj).expected_saved_amount)

    def get_shortfall_amount(self, obj):
        return self._decimal(get_goal_metrics(obj).shortfall_amount)

    def get_health_status(self, obj):
        return get_goal_metrics(obj).health_status

    def get_can_skip_current_month(self, obj):
        return get_goal_metrics(obj).can_skip_current_month


class LoanPaymentSerializer(serializers.ModelSerializer):
    payment_date = serializers.DateField(default=timezone.localdate)
    principal_amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
    )
    interest_amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
    )
    fee_amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
    )

    class Meta:
        model = LoanPayment
        fields = [
            "id",
            "amount",
            "principal_amount",
            "interest_amount",
            "fee_amount",
            "payment_date",
            "payment_method",
            "reference_number",
            "note",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {
            "amount": {"min_value": Decimal("0.01")},
        }

    def validate(self, attrs):
        loan = self.context.get("loan")
        if not loan:
            raise serializers.ValidationError("A loan context is required for repayments.")

        payment_date = attrs.get("payment_date", timezone.localdate())
        if payment_date < loan.disbursed_date:
            raise serializers.ValidationError(
                {"payment_date": "A repayment cannot predate loan disbursement."}
            )
        last_payment_date = latest_payment_date(loan)
        if last_payment_date and payment_date < last_payment_date:
            raise serializers.ValidationError(
                {"payment_date": "Add repayments in date order to preserve the loan ledger."}
            )
        if loan.status == Loan.Status.CLOSED:
            raise serializers.ValidationError("A closed loan cannot receive another repayment.")

        amount = money(attrs["amount"])
        components_supplied = any(
            field in self.initial_data
            for field in ("principal_amount", "interest_amount", "fee_amount")
        )
        metrics = get_loan_metrics(loan, as_of=payment_date)

        if not components_supplied:
            interest_amount = min(amount, metrics.outstanding_interest)
            principal_amount = min(amount - interest_amount, metrics.outstanding_principal)
            if money(amount - interest_amount - principal_amount) > 0:
                raise serializers.ValidationError(
                    {"amount": "This repayment exceeds the outstanding balance. Add a fee allocation only when it was actually charged."}
                )
            attrs["interest_amount"] = interest_amount
            attrs["principal_amount"] = principal_amount
            attrs["fee_amount"] = Decimal("0.00")
            return attrs

        principal_amount = money(attrs.get("principal_amount", 0))
        interest_amount = money(attrs.get("interest_amount", 0))
        fee_amount = money(attrs.get("fee_amount", 0))
        if money(principal_amount + interest_amount + fee_amount) != amount:
            raise serializers.ValidationError(
                "Principal, interest, and fee allocations must equal the repayment total."
            )
        if principal_amount > metrics.outstanding_principal:
            raise serializers.ValidationError(
                {"principal_amount": "Principal allocation cannot exceed the outstanding principal."}
            )
        if interest_amount > metrics.outstanding_interest:
            raise serializers.ValidationError(
                {"interest_amount": "Interest allocation cannot exceed accrued interest."}
            )
        attrs["principal_amount"] = principal_amount
        attrs["interest_amount"] = interest_amount
        attrs["fee_amount"] = fee_amount
        return attrs


class LoanSerializer(serializers.ModelSerializer):
    person_detail = PersonMiniSerializer(source="person", read_only=True)
    payments = LoanPaymentSerializer(many=True, read_only=True)
    principal_paid = serializers.SerializerMethodField()
    interest_paid = serializers.SerializerMethodField()
    fees_paid = serializers.SerializerMethodField()
    total_paid = serializers.SerializerMethodField()
    accrued_interest = serializers.SerializerMethodField()
    outstanding_principal = serializers.SerializerMethodField()
    outstanding_interest = serializers.SerializerMethodField()
    total_outstanding = serializers.SerializerMethodField()
    principal_progress_percent = serializers.SerializerMethodField()
    display_status = serializers.SerializerMethodField()
    days_until_due = serializers.SerializerMethodField()

    class Meta:
        model = Loan
        fields = [
            "id",
            "direction",
            "name",
            "person",
            "person_detail",
            "counterparty_name",
            "loan_type",
            "principal_amount",
            "annual_interest_rate",
            "interest_type",
            "disbursed_date",
            "interest_start_date",
            "repayment_frequency",
            "planned_payment_amount",
            "next_due_date",
            "maturity_date",
            "reference_number",
            "account_reference",
            "collateral_note",
            "terms_note",
            "note",
            "status",
            "closed_on",
            "principal_paid",
            "interest_paid",
            "fees_paid",
            "total_paid",
            "accrued_interest",
            "outstanding_principal",
            "outstanding_interest",
            "total_outstanding",
            "principal_progress_percent",
            "display_status",
            "days_until_due",
            "payments",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "person_detail",
            "status",
            "closed_on",
            "principal_paid",
            "interest_paid",
            "fees_paid",
            "total_paid",
            "accrued_interest",
            "outstanding_principal",
            "outstanding_interest",
            "total_outstanding",
            "principal_progress_percent",
            "display_status",
            "days_until_due",
            "payments",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "principal_amount": {"min_value": Decimal("0.01")},
            "annual_interest_rate": {"min_value": Decimal("0.00")},
            "planned_payment_amount": {"min_value": Decimal("0.00")},
        }

    @staticmethod
    def _decimal(value):
        return format(value, ".2f")

    def _metrics(self, obj):
        cache = getattr(self, "_loan_metrics", None)
        if cache is None:
            cache = {}
            self._loan_metrics = cache
        if obj.pk not in cache:
            cache[obj.pk] = get_loan_metrics(obj)
        return cache[obj.pk]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Loan name cannot be blank.")
        return value

    def validate_counterparty_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter the lender or borrower name.")
        return value

    def validate_person(self, value):
        request = self.context.get("request")
        if value and request and value.owner_id != request.user.id:
            raise serializers.ValidationError("Choose a person from your own people list.")
        return value

    def validate(self, attrs):
        instance = self.instance
        principal = attrs.get("principal_amount", instance.principal_amount if instance else None)
        disbursed_date = attrs.get("disbursed_date", instance.disbursed_date if instance else None)
        interest_start_date = attrs.get("interest_start_date", instance.interest_start_date if instance else None)
        next_due_date = attrs.get("next_due_date", instance.next_due_date if instance else None)
        maturity_date = attrs.get("maturity_date", instance.maturity_date if instance else None)
        interest_type = attrs.get("interest_type", instance.interest_type if instance else Loan.InterestType.NONE)
        annual_interest_rate = attrs.get(
            "annual_interest_rate",
            instance.annual_interest_rate if instance else Decimal("0.00"),
        )

        if interest_type == Loan.InterestType.NONE and annual_interest_rate:
            raise serializers.ValidationError(
                {"annual_interest_rate": "Set interest type to simple before adding a rate."}
            )
        if disbursed_date and interest_start_date and interest_start_date < disbursed_date:
            raise serializers.ValidationError(
                {"interest_start_date": "Interest cannot start before loan disbursement."}
            )
        if disbursed_date and next_due_date and next_due_date < disbursed_date:
            raise serializers.ValidationError(
                {"next_due_date": "The next due date cannot be before disbursement."}
            )
        if disbursed_date and maturity_date and maturity_date < disbursed_date:
            raise serializers.ValidationError(
                {"maturity_date": "The maturity date cannot be before disbursement."}
            )
        if instance and principal is not None and money(principal) < self._metrics(instance).principal_paid:
            raise serializers.ValidationError(
                {"principal_amount": "Original principal cannot be lower than principal already repaid."}
            )
        return attrs

    def create(self, validated_data):
        person = validated_data.get("person")
        if person and not validated_data.get("counterparty_name"):
            validated_data["counterparty_name"] = person.name
        return super().create(validated_data)

    def get_principal_paid(self, obj):
        return self._decimal(self._metrics(obj).principal_paid)

    def get_interest_paid(self, obj):
        return self._decimal(self._metrics(obj).interest_paid)

    def get_fees_paid(self, obj):
        return self._decimal(self._metrics(obj).fees_paid)

    def get_total_paid(self, obj):
        return self._decimal(self._metrics(obj).total_paid)

    def get_accrued_interest(self, obj):
        return self._decimal(self._metrics(obj).accrued_interest)

    def get_outstanding_principal(self, obj):
        return self._decimal(self._metrics(obj).outstanding_principal)

    def get_outstanding_interest(self, obj):
        return self._decimal(self._metrics(obj).outstanding_interest)

    def get_total_outstanding(self, obj):
        return self._decimal(self._metrics(obj).total_outstanding)

    def get_principal_progress_percent(self, obj):
        return self._decimal(self._metrics(obj).principal_progress_percent)

    def get_display_status(self, obj):
        return self._metrics(obj).status

    def get_days_until_due(self, obj):
        return self._metrics(obj).days_until_due
