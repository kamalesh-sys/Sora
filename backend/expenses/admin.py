from django.contrib import admin

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
    SignupOTP,
)


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "user", "icon", "color", "created_at"]
    search_fields = ["name", "user__email", "user__username"]
    list_filter = ["user"]


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ["name", "owner", "email", "phone", "relation_type", "linked_user", "created_at"]
    search_fields = ["name", "email", "phone", "owner__email", "linked_user__email"]
    list_filter = ["relation_type", "created_at"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(PeopleInvitation)
class PeopleInvitationAdmin(admin.ModelAdmin):
    list_display = ["email", "invited_by", "person", "relation_type", "status", "expires_at", "accepted_at"]
    search_fields = ["email", "invited_by__email", "person__name"]
    list_filter = ["status", "relation_type", "created_at", "expires_at"]
    readonly_fields = ["token_hash", "created_at", "updated_at", "accepted_at"]
    date_hierarchy = "created_at"


class HouseholdMemberInline(admin.TabularInline):
    model = HouseholdMember
    extra = 0
    readonly_fields = ["joined_at", "created_at", "updated_at"]


@admin.register(Household)
class HouseholdAdmin(admin.ModelAdmin):
    list_display = ["name", "owner", "monthly_budget", "currency", "created_at"]
    search_fields = ["name", "description", "owner__email", "owner__username"]
    list_filter = ["currency", "created_at"]
    readonly_fields = ["created_at", "updated_at"]
    inlines = [HouseholdMemberInline]


@admin.register(HouseholdMember)
class HouseholdMemberAdmin(admin.ModelAdmin):
    list_display = ["household", "user", "person", "role", "status", "visibility_level", "joined_at"]
    search_fields = ["household__name", "user__email", "person__name", "person__email"]
    list_filter = ["role", "status", "visibility_level", "created_at"]
    readonly_fields = ["joined_at", "created_at", "updated_at"]


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "user",
        "created_by",
        "household",
        "amount",
        "category",
        "payment_method",
        "expense_type",
        "visibility",
        "paid_by_user",
        "paid_by_person",
        "expense_date",
        "created_at",
    ]
    list_filter = [
        "user",
        "household",
        "payment_method",
        "expense_type",
        "visibility",
        "category",
        "expense_date",
    ]
    search_fields = ["title", "note", "user__email", "created_by__email", "paid_by_person__name"]
    readonly_fields = ["created_at", "updated_at"]
    date_hierarchy = "expense_date"


@admin.register(ExpenseShare)
class ExpenseShareAdmin(admin.ModelAdmin):
    list_display = ["expense", "user", "person", "share_amount", "paid_amount", "status", "created_at"]
    search_fields = ["expense__title", "user__email", "person__name", "person__email"]
    list_filter = ["status", "created_at"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(Settlement)
class SettlementAdmin(admin.ModelAdmin):
    list_display = ["amount", "method", "status", "expense", "expense_share", "created_by", "settled_at"]
    search_fields = ["expense__title", "note", "created_by__email", "from_person__name", "to_person__name"]
    list_filter = ["status", "method", "created_at", "settled_at"]
    readonly_fields = ["settled_at", "created_at", "updated_at"]
    date_hierarchy = "created_at"


@admin.register(MonthlyBudget)
class MonthlyBudgetAdmin(admin.ModelAdmin):
    list_display = ["month", "user", "amount", "created_at", "updated_at"]
    search_fields = ["note", "user__email", "user__username"]
    list_filter = ["user"]
    readonly_fields = ["created_at", "updated_at"]
    date_hierarchy = "month"


@admin.register(CategoryBudget)
class CategoryBudgetAdmin(admin.ModelAdmin):
    list_display = ["month", "user", "household", "category", "amount", "created_at"]
    search_fields = ["note", "user__email", "household__name", "category__name"]
    list_filter = ["month", "household", "category"]
    readonly_fields = ["created_at", "updated_at"]
    date_hierarchy = "month"


@admin.register(RecurringBill)
class RecurringBillAdmin(admin.ModelAdmin):
    list_display = ["name", "user", "household", "amount", "frequency", "next_due_date", "is_active"]
    search_fields = ["name", "note", "user__email", "household__name", "category__name"]
    list_filter = ["frequency", "is_active", "payment_method", "next_due_date"]
    readonly_fields = ["created_at", "updated_at"]
    date_hierarchy = "next_due_date"


@admin.register(BillOccurrence)
class BillOccurrenceAdmin(admin.ModelAdmin):
    list_display = ["recurring_bill", "due_date", "amount", "status", "paid_expense", "paid_at"]
    search_fields = ["recurring_bill__name", "paid_expense__title"]
    list_filter = ["status", "due_date"]
    readonly_fields = ["created_at", "updated_at"]
    date_hierarchy = "due_date"


@admin.register(SignupOTP)
class SignupOTPAdmin(admin.ModelAdmin):
    list_display = ["email", "attempts", "expires_at", "consumed_at", "created_at"]
    search_fields = ["email"]
    list_filter = ["consumed_at", "created_at"]
    readonly_fields = ["email", "code_hash", "attempts", "expires_at", "consumed_at", "created_at"]


class GoalContributionInline(admin.TabularInline):
    model = GoalContribution
    extra = 0
    readonly_fields = ["created_at", "updated_at"]


class GoalMonthSkipInline(admin.TabularInline):
    model = GoalMonthSkip
    extra = 0
    readonly_fields = ["created_at"]


@admin.register(Goal)
class GoalAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "user",
        "target_amount",
        "target_date",
        "status",
        "template_key",
        "completed_at",
    ]
    search_fields = ["name", "description", "user__email", "user__username"]
    list_filter = ["status", "template_key", "target_date"]
    readonly_fields = ["status", "completed_at", "created_at", "updated_at"]
    date_hierarchy = "target_date"
    inlines = [GoalContributionInline, GoalMonthSkipInline]


@admin.register(GoalContribution)
class GoalContributionAdmin(admin.ModelAdmin):
    list_display = ["goal", "amount", "contribution_date", "created_at"]
    search_fields = ["goal__name", "goal__user__email", "note"]
    list_filter = ["contribution_date", "created_at"]
    readonly_fields = ["created_at", "updated_at"]
    date_hierarchy = "contribution_date"


@admin.register(GoalMonthSkip)
class GoalMonthSkipAdmin(admin.ModelAdmin):
    list_display = ["goal", "month", "created_at"]
    search_fields = ["goal__name", "goal__user__email"]
    list_filter = ["month", "created_at"]
    readonly_fields = ["created_at"]
    date_hierarchy = "month"
