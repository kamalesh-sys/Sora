from django.db import migrations


RLS_TABLES = [
    "django_migrations",
    "django_content_type",
    "auth_permission",
    "auth_group",
    "auth_group_permissions",
    "auth_user_groups",
    "auth_user_user_permissions",
    "django_admin_log",
    "auth_user",
    "django_session",
    "authtoken_token",
    "expenses_signupotp",
    "expenses_expensecategory",
    "expenses_person",
    "expenses_peopleinvitation",
    "expenses_household",
    "expenses_householdmember",
    "expenses_expense",
    "expenses_expenseshare",
    "expenses_monthlybudget",
    "expenses_categorybudget",
    "expenses_recurringbill",
    "expenses_billoccurrence",
    "expenses_settlement",
]


def _enable_rls_sql():
    statements = [
        f'ALTER TABLE IF EXISTS public."{table_name}" ENABLE ROW LEVEL SECURITY;'
        for table_name in RLS_TABLES
    ]
    return "\n".join(statements)


class Migration(migrations.Migration):
    dependencies = [
        ("expenses", "0006_billoccurrence_expenses_bi_due_dat_a249b2_idx_and_more"),
    ]

    operations = [
        migrations.RunSQL(
            sql=_enable_rls_sql(),
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
