from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone


class SignupOTP(models.Model):
    email = models.EmailField(db_index=True)
    code_hash = models.CharField(max_length=256)
    attempts = models.PositiveSmallIntegerField(default=0)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["email", "created_at"]),
        ]

    def __str__(self):
        return f"Signup OTP for {self.email}"


class ExpenseCategory(models.Model):
    class TransactionType(models.TextChoices):
        EXPENSE = "expense", "Expense"
        INCOME = "income", "Income"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="expense_categories",
    )
    name = models.CharField(max_length=100)
    icon = models.CharField(max_length=100, blank=True)
    color = models.CharField(max_length=50, blank=True)
    transaction_type = models.CharField(
        max_length=10,
        choices=TransactionType.choices,
        default=TransactionType.EXPENSE,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "expense categories"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "name", "transaction_type"],
                name="unique_transaction_category_per_user",
            )
        ]

    def __str__(self):
        return self.name


class Person(models.Model):
    class RelationType(models.TextChoices):
        FAMILY = "family", "Family"
        FRIEND = "friend", "Friend"
        ROOMMATE = "roommate", "Roommate"
        RELATIVE = "relative", "Relative"
        HELPER = "helper", "Helper"
        OTHER = "other", "Other"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="people",
    )
    name = models.CharField(max_length=150)
    email = models.EmailField(null=True, blank=True, db_index=True)
    phone = models.CharField(max_length=30, blank=True)
    relation_type = models.CharField(
        max_length=20,
        choices=RelationType.choices,
        default=RelationType.OTHER,
    )
    linked_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="linked_people",
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "email"],
                condition=Q(email__isnull=False) & ~Q(email=""),
                name="unique_person_owner_email",
            )
        ]

    def clean(self):
        if self.linked_user_id and self.owner_id == self.linked_user_id:
            raise ValidationError("Owner cannot link a person to themselves.")

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class PeopleInvitation(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        EXPIRED = "expired", "Expired"
        CANCELLED = "cancelled", "Cancelled"

    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_people_invitations",
    )
    email = models.EmailField(db_index=True)
    relation_type = models.CharField(
        max_length=20,
        choices=Person.RelationType.choices,
        default=Person.RelationType.OTHER,
    )
    person = models.ForeignKey(
        Person,
        null=True,
        blank=True,
        related_name="invitations",
        on_delete=models.SET_NULL,
    )
    token_hash = models.CharField(max_length=256)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["email"]),
            models.Index(fields=["status"]),
            models.Index(fields=["expires_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["invited_by", "email"],
                condition=Q(status="pending"),
                name="unique_pending_people_invitation",
            )
        ]

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.email} - {self.status}"


class Household(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_households",
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    monthly_budget = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    currency = models.CharField(max_length=10, default="INR")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "name"],
                name="unique_household_owner_name",
            )
        ]

    def __str__(self):
        return self.name


class HouseholdMember(models.Model):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        ADMIN = "admin", "Admin"
        MEMBER = "member", "Member"
        VIEWER = "viewer", "Viewer"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INVITED = "invited", "Invited"
        REMOVED = "removed", "Removed"

    class VisibilityLevel(models.TextChoices):
        SHARED_ONLY = "shared_only", "Shared Only"
        CATEGORY_SUMMARY = "category_summary", "Category Summary"
        MONTHLY_SUMMARY = "monthly_summary", "Monthly Summary"
        FULL_HOUSEHOLD = "full_household", "Full Household"

    household = models.ForeignKey(Household, related_name="members", on_delete=models.CASCADE)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="household_memberships",
        on_delete=models.CASCADE,
    )
    person = models.ForeignKey(
        Person,
        null=True,
        blank=True,
        related_name="household_memberships",
        on_delete=models.CASCADE,
    )
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.MEMBER)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    visibility_level = models.CharField(
        max_length=30,
        choices=VisibilityLevel.choices,
        default=VisibilityLevel.SHARED_ONLY,
    )
    joined_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["household", "role", "id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(user__isnull=False) | Q(person__isnull=False),
                name="household_member_has_user_or_person",
            ),
            models.UniqueConstraint(
                fields=["household"],
                condition=Q(role="owner"),
                name="unique_household_owner_member",
            ),
            models.UniqueConstraint(
                fields=["household", "user"],
                condition=Q(user__isnull=False),
                name="unique_household_user_member",
            ),
            models.UniqueConstraint(
                fields=["household", "person"],
                condition=Q(person__isnull=False),
                name="unique_household_person_member",
            ),
        ]

    def clean(self):
        if self.user_id and self.person_id and self.person.linked_user_id != self.user_id:
            raise ValidationError("Person must be linked to the same user.")
        if self.role == self.Role.OWNER and self.household_id and self.user_id != self.household.owner_id:
            raise ValidationError("Household owner member must be the household owner.")

    def save(self, *args, **kwargs):
        if self.status == self.Status.ACTIVE and not self.joined_at:
            self.joined_at = timezone.now()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        subject = self.user or self.person
        return f"{self.household} - {subject}"


class Expense(models.Model):
    class TransactionType(models.TextChoices):
        EXPENSE = "expense", "Expense"
        INCOME = "income", "Income"

    class PaymentMethod(models.TextChoices):
        UPI = "upi", "UPI"
        CASH = "cash", "Cash"
        BANK = "bank", "Bank"
        CARD = "card", "Card"
        WALLET = "wallet", "Wallet"
        OTHER = "other", "Other"

    class Visibility(models.TextChoices):
        PRIVATE = "private", "Private"
        SHARED = "shared", "Shared"
        HOUSEHOLD = "household", "Household"

    class ExpenseType(models.TextChoices):
        PERSONAL = "personal", "Personal"
        SHARED = "shared", "Shared"
        HOUSEHOLD = "household", "Household"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="expenses",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_expenses",
    )
    household = models.ForeignKey(
        Household,
        null=True,
        blank=True,
        related_name="expenses",
        on_delete=models.CASCADE,
    )
    title = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    transaction_type = models.CharField(
        max_length=10,
        choices=TransactionType.choices,
        default=TransactionType.EXPENSE,
    )
    category = models.ForeignKey(
        ExpenseCategory,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="expenses",
    )
    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        default=PaymentMethod.UPI,
    )
    paid_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="paid_expenses",
        on_delete=models.SET_NULL,
    )
    paid_by_person = models.ForeignKey(
        Person,
        null=True,
        blank=True,
        related_name="paid_expenses",
        on_delete=models.SET_NULL,
    )
    expense_date = models.DateField()
    visibility = models.CharField(
        max_length=20,
        choices=Visibility.choices,
        default=Visibility.PRIVATE,
    )
    expense_type = models.CharField(
        max_length=20,
        choices=ExpenseType.choices,
        default=ExpenseType.PERSONAL,
    )
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-expense_date", "-created_at"]
        indexes = [
            models.Index(fields=["user", "expense_date"]),
            models.Index(fields=["household", "expense_date"]),
            models.Index(fields=["category", "expense_date"]),
            models.Index(fields=["payment_method", "expense_date"]),
            models.Index(fields=["expense_type", "expense_date"]),
            models.Index(fields=["user", "transaction_type", "expense_date"]),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="transaction_amount_positive"),
        ]

    def __str__(self):
        return f"{self.title} - {self.amount}"


class ExpenseShare(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PARTIALLY_PAID = "partially_paid", "Partially Paid"
        SETTLED = "settled", "Settled"
        WAIVED = "waived", "Waived"

    expense = models.ForeignKey(Expense, related_name="shares", on_delete=models.CASCADE)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="expense_shares",
        on_delete=models.CASCADE,
    )
    person = models.ForeignKey(
        Person,
        null=True,
        blank=True,
        related_name="expense_shares",
        on_delete=models.CASCADE,
    )
    household_member = models.ForeignKey(
        HouseholdMember,
        null=True,
        blank=True,
        related_name="expense_shares",
        on_delete=models.SET_NULL,
    )
    share_amount = models.DecimalField(max_digits=12, decimal_places=2)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["expense", "id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(user__isnull=False)
                | Q(person__isnull=False)
                | Q(household_member__isnull=False),
                name="expense_share_has_participant",
            ),
            models.CheckConstraint(condition=Q(share_amount__gte=0), name="share_amount_non_negative"),
            models.CheckConstraint(condition=Q(paid_amount__gte=0), name="paid_amount_non_negative"),
            models.CheckConstraint(
                condition=Q(paid_amount__lte=models.F("share_amount")),
                name="paid_amount_lte_share_amount",
            ),
        ]

    def clean(self):
        if self.paid_amount > self.share_amount:
            raise ValidationError("Paid amount cannot exceed share amount.")

    def save(self, *args, **kwargs):
        if self.status != self.Status.WAIVED:
            if self.paid_amount == 0:
                self.status = self.Status.PENDING
            elif self.paid_amount < self.share_amount:
                self.status = self.Status.PARTIALLY_PAID
            else:
                self.status = self.Status.SETTLED
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.expense} - {self.share_amount}"


class Settlement(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    expense = models.ForeignKey(
        Expense,
        null=True,
        blank=True,
        related_name="settlements",
        on_delete=models.SET_NULL,
    )
    expense_share = models.ForeignKey(
        ExpenseShare,
        null=True,
        blank=True,
        related_name="settlements",
        on_delete=models.SET_NULL,
    )
    from_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="settlements_sent",
        on_delete=models.SET_NULL,
    )
    from_person = models.ForeignKey(
        Person,
        null=True,
        blank=True,
        related_name="settlements_sent",
        on_delete=models.SET_NULL,
    )
    to_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="settlements_received",
        on_delete=models.SET_NULL,
    )
    to_person = models.ForeignKey(
        Person,
        null=True,
        blank=True,
        related_name="settlements_received",
        on_delete=models.SET_NULL,
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(max_length=20, choices=Expense.PaymentMethod.choices, default=Expense.PaymentMethod.UPI)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.COMPLETED)
    settled_at = models.DateTimeField(null=True, blank=True)
    note = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="created_settlements",
        on_delete=models.CASCADE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="settlement_amount_positive"),
            models.CheckConstraint(
                condition=Q(from_user__isnull=False) | Q(from_person__isnull=False),
                name="settlement_has_payer",
            ),
            models.CheckConstraint(
                condition=Q(to_user__isnull=False) | Q(to_person__isnull=False),
                name="settlement_has_receiver",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.status == self.Status.COMPLETED and not self.settled_at:
            self.settled_at = timezone.now()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.amount} - {self.status}"


class MonthlyBudget(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="monthly_budgets",
    )
    month = models.DateField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-month"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "month"],
                name="unique_monthly_budget_per_user",
            )
        ]

    def clean(self):
        if self.month:
            self.month = self.month.replace(day=1)

    def save(self, *args, **kwargs):
        if self.month:
            self.month = self.month.replace(day=1)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.month:%Y-%m} - {self.amount}"


class CategoryBudget(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="category_budgets",
        on_delete=models.CASCADE,
    )
    household = models.ForeignKey(
        Household,
        null=True,
        blank=True,
        related_name="category_budgets",
        on_delete=models.CASCADE,
    )
    category = models.ForeignKey(
        ExpenseCategory,
        related_name="category_budgets",
        on_delete=models.CASCADE,
    )
    month = models.DateField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-month", "category__name"]
        constraints = [
            models.CheckConstraint(
                condition=(Q(user__isnull=False) & Q(household__isnull=True))
                | (Q(user__isnull=True) & Q(household__isnull=False)),
                name="category_budget_exactly_one_scope",
            ),
            models.UniqueConstraint(
                fields=["user", "category", "month"],
                condition=Q(user__isnull=False),
                name="unique_personal_category_budget",
            ),
            models.UniqueConstraint(
                fields=["household", "category", "month"],
                condition=Q(household__isnull=False),
                name="unique_household_category_budget",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.month:
            self.month = self.month.replace(day=1)
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        scope = self.household or self.user
        return f"{scope} - {self.category} - {self.month:%Y-%m}"


class RecurringBill(models.Model):
    class Frequency(models.TextChoices):
        MONTHLY = "monthly", "Monthly"
        WEEKLY = "weekly", "Weekly"
        YEARLY = "yearly", "Yearly"
        CUSTOM = "custom", "Custom"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="recurring_bills",
        on_delete=models.CASCADE,
    )
    household = models.ForeignKey(
        Household,
        null=True,
        blank=True,
        related_name="recurring_bills",
        on_delete=models.CASCADE,
    )
    name = models.CharField(max_length=150)
    category = models.ForeignKey(ExpenseCategory, null=True, blank=True, on_delete=models.SET_NULL)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method = models.CharField(
        max_length=20,
        choices=Expense.PaymentMethod.choices,
        default=Expense.PaymentMethod.UPI,
    )
    frequency = models.CharField(max_length=20, choices=Frequency.choices, default=Frequency.MONTHLY)
    due_day = models.PositiveSmallIntegerField(null=True, blank=True)
    next_due_date = models.DateField()
    reminder_days_before = models.PositiveSmallIntegerField(default=3)
    auto_create_expense = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["next_due_date", "name"]
        indexes = [
            models.Index(fields=["user", "next_due_date"]),
            models.Index(fields=["household", "next_due_date"]),
            models.Index(fields=["is_active", "next_due_date"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(Q(user__isnull=False) & Q(household__isnull=True))
                | (Q(user__isnull=True) & Q(household__isnull=False)),
                name="recurring_bill_exactly_one_scope",
            )
        ]

    def clean(self):
        if self.frequency == self.Frequency.MONTHLY and self.due_day is not None:
            if self.due_day < 1 or self.due_day > 31:
                raise ValidationError("Monthly due day must be between 1 and 31.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class BillOccurrence(models.Model):
    class Status(models.TextChoices):
        UPCOMING = "upcoming", "Upcoming"
        PAID = "paid", "Paid"
        SKIPPED = "skipped", "Skipped"
        OVERDUE = "overdue", "Overdue"

    recurring_bill = models.ForeignKey(
        RecurringBill,
        related_name="occurrences",
        on_delete=models.CASCADE,
    )
    due_date = models.DateField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.UPCOMING)
    paid_expense = models.ForeignKey(
        Expense,
        null=True,
        blank=True,
        related_name="bill_occurrences",
        on_delete=models.SET_NULL,
    )
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["due_date", "id"]
        indexes = [
            models.Index(fields=["due_date", "status"]),
            models.Index(fields=["status", "due_date"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["recurring_bill", "due_date"],
                name="unique_bill_occurrence_due_date",
            )
        ]

    def refresh_overdue_status(self):
        if self.status == self.Status.UPCOMING and self.due_date < timezone.localdate():
            self.status = self.Status.OVERDUE

    def save(self, *args, **kwargs):
        self.refresh_overdue_status()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.recurring_bill} - {self.due_date}"


class Goal(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="goals",
        on_delete=models.CASCADE,
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    target_amount = models.DecimalField(max_digits=14, decimal_places=2)
    target_date = models.DateField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    template_key = models.CharField(max_length=50, blank=True)
    icon = models.CharField(max_length=50, blank=True)
    color = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["status", "target_date", "id"]
        indexes = [
            models.Index(fields=["user", "status", "target_date"]),
            models.Index(fields=["user", "target_date"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(target_amount__gt=0),
                name="goal_target_amount_positive",
            ),
            models.CheckConstraint(
                condition=(Q(status="active") & Q(completed_at__isnull=True))
                | (Q(status="completed") & Q(completed_at__isnull=False)),
                name="goal_completion_state_consistent",
            ),
        ]

    def clean(self):
        if self.status == self.Status.ACTIVE and self.completed_at is not None:
            raise ValidationError("An active goal cannot have a completion time.")
        if self.status == self.Status.COMPLETED and self.completed_at is None:
            raise ValidationError("A completed goal must have a completion time.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
        from .services.goals import synchronize_goal_completion

        synchronize_goal_completion(self)

    def __str__(self):
        return self.name


class GoalContribution(models.Model):
    goal = models.ForeignKey(
        Goal,
        related_name="contributions",
        on_delete=models.CASCADE,
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    contribution_date = models.DateField()
    note = models.TextField(blank=True)
    expense = models.ForeignKey(
        Expense,
        null=True,
        blank=True,
        related_name="goal_contributions",
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-contribution_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["goal", "contribution_date"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="goal_contribution_amount_positive",
            ),
        ]

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
        from .services.goals import synchronize_goal_completion

        synchronize_goal_completion(self.goal)

    def delete(self, *args, **kwargs):
        goal = self.goal
        result = super().delete(*args, **kwargs)
        from .services.goals import synchronize_goal_completion

        synchronize_goal_completion(goal)
        return result

    def __str__(self):
        return f"{self.goal} - {self.amount}"


class GoalMonthSkip(models.Model):
    goal = models.ForeignKey(
        Goal,
        related_name="skipped_months",
        on_delete=models.CASCADE,
    )
    month = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["month", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["goal", "month"],
                name="unique_goal_skipped_month",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.month:
            self.month = self.month.replace(day=1)
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.goal} - {self.month:%Y-%m}"
