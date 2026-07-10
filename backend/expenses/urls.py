from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .auth_views import login, logout, me, register
from .views import (
    BillOccurrenceViewSet,
    CategoryBudgetViewSet,
    ExpenseCategoryViewSet,
    ExpenseViewSet,
    GoalViewSet,
    MonthlyBudgetViewSet,
    PersonViewSet,
    RecurringBillViewSet,
    SettlementViewSet,
    bill_calendar,
    dashboard_summary,
    export_csv,
    export_pdf,
    monthly_summary,
)

router = DefaultRouter()
router.register("categories", ExpenseCategoryViewSet, basename="category")
router.register("people", PersonViewSet, basename="people")
router.register("expenses", ExpenseViewSet, basename="expense")
router.register("budgets", MonthlyBudgetViewSet, basename="budget")
router.register("category-budgets", CategoryBudgetViewSet, basename="category-budget")
router.register("recurring-bills", RecurringBillViewSet, basename="recurring-bill")
router.register("bill-occurrences", BillOccurrenceViewSet, basename="bill-occurrence")
router.register("settlements", SettlementViewSet, basename="settlement")
router.register("goals", GoalViewSet, basename="goal")

urlpatterns = [
    path("auth/register/", register, name="auth-register"),
    path("auth/login/", login, name="auth-login"),
    path("auth/me/", me, name="auth-me"),
    path("auth/logout/", logout, name="auth-logout"),
    path("", include(router.urls)),
    path("reports/monthly-summary/", monthly_summary, name="monthly-summary"),
    path("reports/dashboard-summary/", dashboard_summary, name="dashboard-summary"),
    path("reports/export-csv/", export_csv, name="export-csv"),
    path("reports/export-pdf/", export_pdf, name="export-pdf"),
    path("bill-calendar/", bill_calendar, name="bill-calendar"),
]
