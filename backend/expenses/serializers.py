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
        fields = ["id", "name", "icon", "color", "created_at"]
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
        if self.instance:
            household = self.instance.household if household is None else household
            category = self.instance.category if category is None else category
        if household:
            if not can_create_household_expense(request.user, household):
                raise serializers.ValidationError("Viewer cannot create household expenses.")
            if category and category.user_id not in {request.user.id, household.owner_id}:
                raise serializers.ValidationError("Category is not allowed for this household.")
        elif category and category.user_id != request.user.id:
            raise serializers.ValidationError("Category does not belong to this user.")
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

    class Meta:
        model = GoalContribution
        fields = [
            "id",
            "amount",
            "contribution_date",
            "note",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
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
